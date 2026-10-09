import { createHash, randomBytes } from 'node:crypto';
import { uuidv4 } from '@caime/core';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

/**
 * Apps (R74): a developer lists an app, the operator looks once, Discover pages it with its
 * publisher and how many connected it (kept on the row by the grant's own transaction), and
 * Connected shows Caime's own built-ins beside the grants.
 */
let t: TestApp;
let dev: Client;
let noor: Client;
let sam: Client;
let app: { id: string; clientId: string };
const ADMIN = 'operator-token-0123456789abcdef';
const SITE = 'https://digest.example';
const REDIRECT = `${SITE}/callback`;
const LOGIN = `${SITE}/login`;

const operator = (method: 'GET' | 'POST', url: string, body?: unknown) =>
  t.app.inject({
    method,
    url,
    headers: { authorization: `Bearer ${ADMIN}` },
    ...(body ? { payload: body as object } : {}),
  });
/** The operator's answer on the listing as it stands (the version they looked at). */
async function review(id: string, decision: 'list' | 'decline', reason?: string) {
  const queue = (await operator('GET', '/v1/admin/listings')).json() as {
    listings: Array<{ id: string; listing: { revision: number } }>;
  };
  const revision = queue.listings.find((l) => l.id === id)?.listing.revision ?? 0;
  return operator('POST', `/v1/admin/listings/${id}`, {
    decision,
    revision,
    ...(reason ? { reason } : {}),
  });
}

function pkce() {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}
/** Someone lets the app in, as its sign-in sends them to Caime to do. */
async function allow(c: Client, clientId: string, redirect = REDIRECT) {
  const res = await c.req('POST', '/v1/oauth/authorize', {
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirect,
    scope: 'messages:read',
    code_challenge: pkce().challenge,
    code_challenge_method: 'S256',
    decision: 'allow',
  });
  expect(res.statusCode).toBe(200);
}
const register = (c: Client, name: string, site = SITE) =>
  c.post('/v1/me/oauth-apps', {
    name,
    website: site,
    redirectUris: [`${site}/callback`],
  }) as Promise<{ app: { id: string; clientId: string } }>;

function multipart(name: string, mime: string, data: Buffer) {
  const boundary = `----caime${uuidv4()}`;
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: ${mime}\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return {
    payload: Buffer.concat([head, data, tail]),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}
async function uploadImage(c: Client) {
  const jpeg = await sharp({
    create: { width: 512, height: 512, channels: 3, background: '#c8285f' },
  })
    .jpeg()
    .toBuffer();
  const body = multipart('icon.jpg', 'image/jpeg', jpeg);
  const res = await t.app.inject({
    method: 'POST',
    url: '/v1/files',
    payload: body.payload,
    headers: { ...body.headers, authorization: `Bearer ${c.token}` },
  });
  expect(res.statusCode).toBe(201);
  return res.json().file as { id: string };
}
const directory = (c: Client, query = '') =>
  c.get(`/v1/directory${query}`) as Promise<{
    apps: Array<{
      id: string;
      kind: string;
      name: string;
      category: string;
      publisher: { name: string; handle: string | null; verified: boolean };
      connectedCount: number;
      connected: boolean;
      connectUrl: string | null;
      iconUrl: string | null;
    }>;
    nextBefore: string | null;
  }>;

beforeAll(async () => {
  t = await createTestApp({ ADMIN_TOKEN: ADMIN });
  dev = await signup(t, { displayName: 'Dana Developer' });
  noor = await signup(t, { displayName: 'Noor Haddad' });
  sam = await signup(t, { displayName: 'Sam Rivera' });
  app = (await register(dev, 'Weekly digest')).app;
});

afterAll(async () => {
  await t.close();
});

describe('Discover and Connected (R74)', () => {
  it('a registered app is unlisted; listing needs a tagline, a category and a sign-in at its own address', async () => {
    const mine = (await dev.get('/v1/me/oauth-apps')).apps[0];
    expect(mine.listing).toEqual({
      state: 'none',
      tagline: null,
      description: null,
      category: null,
      iconFileId: null,
      loginUrl: null,
      orgId: null,
      declinedReason: null,
      askedAt: null,
      revision: 0,
    });
    const bare = await dev.req('PATCH', `/v1/me/oauth-apps/${app.id}`, { listed: true });
    expect(bare.statusCode).toBe(400);
    expect(bare.json().error.message).toMatch(/tagline, a category and where Connect goes/);
    const elsewhere = await dev.req('PATCH', `/v1/me/oauth-apps/${app.id}`, {
      tagline: 'Your week, every Monday',
      category: 'tasks',
      loginUrl: 'https://elsewhere.example/login',
      listed: true,
    });
    expect(elsewhere.statusCode).toBe(400);
    expect(elsewhere.json().error.message).toMatch(/own address/);
    const http = await dev.req('PATCH', `/v1/me/oauth-apps/${app.id}`, {
      loginUrl: 'http://digest.example/login',
    });
    expect(http.statusCode).toBe(400);
    const asked = await dev.patch(`/v1/me/oauth-apps/${app.id}`, {
      tagline: 'Your week, every Monday',
      description: 'Every Monday, what moved and what waits.',
      category: 'tasks',
      loginUrl: LOGIN,
      listed: true,
    });
    expect(asked.app.listing).toMatchObject({
      state: 'waiting',
      loginUrl: LOGIN,
      category: 'tasks',
    });
    // Nobody else's PATCH reaches it.
    expect(
      (await noor.req('PATCH', `/v1/me/oauth-apps/${app.id}`, { tagline: 'x' })).statusCode,
    ).toBe(404);

    // Waiting, it's in nobody's Discover but its owner's own view.
    const seen = await directory(noor);
    expect(seen.apps.map((a) => a.id)).toEqual(['calendar']);
    expect(seen.apps[0]).toMatchObject({
      kind: 'builtin',
      name: 'Your calendar',
      category: 'calendars',
      publisher: { name: 'Caime', handle: null, verified: true },
      connected: false,
      connectUrl: null,
    });
    expect(seen.nextBefore).toBeNull();
    expect((await noor.req('GET', `/v1/directory/${app.id}`)).statusCode).toBe(404);
    expect((await dev.get(`/v1/directory/${app.id}`)).app.name).toBe('Weekly digest');
  });

  it('the operator lets it through; Discover shows it with its publisher; connecting counts once per person', async () => {
    const queue = (await operator('GET', '/v1/admin/listings')).json();
    expect(queue.listings).toEqual([
      expect.objectContaining({
        id: app.id,
        name: 'Weekly digest',
        owner: { displayName: 'Dana Developer', handle: dev.user.handle },
        org: null,
        listing: expect.objectContaining({ state: 'waiting' }),
      }),
    ]);
    const let_ = await review(app.id, 'list');
    expect(let_.statusCode).toBe(200);
    expect(let_.json().listing.listing.state).toBe('listed');
    expect((await operator('GET', '/v1/admin/listings')).json().listings).toEqual([]);
    // A person's own token isn't the operator's.
    expect((await noor.req('GET', '/v1/admin/listings')).statusCode).toBe(401);

    const seen = await directory(noor);
    expect(seen.apps.map((a) => a.name)).toEqual(['Your calendar', 'Weekly digest']);
    expect(seen.apps[1]).toMatchObject({
      kind: 'oauth',
      publisher: { name: 'Dana Developer', handle: dev.user.handle, verified: false },
      connectedCount: 0,
      connected: false,
      connectUrl: LOGIN,
      iconUrl: null,
    });
    // Letting it in twice is one grant, counted once; a second person is two.
    await allow(noor, app.clientId);
    await allow(noor, app.clientId);
    expect((await directory(noor)).apps[1]).toMatchObject({ connectedCount: 1, connected: true });
    await allow(sam, app.clientId);
    expect((await directory(noor)).apps[1]).toMatchObject({ connectedCount: 2 });
    expect((await directory(dev)).apps[1]).toMatchObject({ connectedCount: 2, connected: false });
    // Connected shows it as a row of the same kind a built-in would be.
    const { apps } = await noor.get('/v1/me/connected-apps');
    expect(apps).toEqual([
      expect.objectContaining({
        kind: 'oauth',
        appId: app.id,
        name: 'Weekly digest',
        owner: 'Dana Developer',
        iconUrl: null,
        scopes: ['messages:read'],
      }),
    ]);
    await noor.del(`/v1/me/connected-apps/${apps[0].grantId}`);
    expect((await directory(noor)).apps[1]).toMatchObject({ connectedCount: 1, connected: false });
    // A deleted account lets go of its grants, and the count with them.
    await sam.req('DELETE', '/v1/me', { password: 'correct horse battery' });
    expect((await directory(noor)).apps[1]).toMatchObject({ connectedCount: 0 });
  });

  it('the calendar is a built-in: on, it joins Connected; Discover counts who has it on', async () => {
    await noor.post('/v1/calendar/feed', {});
    const { apps } = await noor.get('/v1/me/connected-apps');
    expect(apps).toEqual([
      expect.objectContaining({
        kind: 'builtin',
        appId: 'calendar',
        grantId: null,
        name: 'Your calendar',
        owner: 'Caime',
        scopes: [],
      }),
    ]);
    expect((await directory(noor)).apps[0]).toMatchObject({ connected: true, connectedCount: 1 });
    expect((await directory(dev)).apps[0]).toMatchObject({ connected: false, connectedCount: 1 });
    expect((await noor.get('/v1/directory/calendar')).app).toMatchObject({
      id: 'calendar',
      connected: true,
    });
    await noor.del('/v1/calendar/feed');
    expect((await noor.get('/v1/me/connected-apps')).apps).toEqual([]);
    expect((await directory(noor)).apps[0]).toMatchObject({ connected: false, connectedCount: 0 });
  });

  it('declining says why; a change to what’s shown asks again; unlisting takes it out', async () => {
    const other = (await register(dev, 'Other app')).app;
    await dev.patch(`/v1/me/oauth-apps/${other.id}`, {
      tagline: 'Another thing',
      category: 'work',
      loginUrl: LOGIN,
      listed: true,
    });
    const mute = await review(other.id, 'decline');
    expect(mute.statusCode).toBe(400);
    const declined = await review(other.id, 'decline', 'The tagline says nothing of what it does.');
    expect(declined.json().listing.listing).toMatchObject({
      state: 'declined',
      declinedReason: 'The tagline says nothing of what it does.',
    });
    const mine = (await dev.get('/v1/me/oauth-apps')).apps.find(
      (a: { id: string }) => a.id === other.id,
    );
    expect(mine.listing.state).toBe('declined');
    expect((await directory(noor)).apps.map((a) => a.name)).not.toContain('Other app');
    // Changing what's shown asks again; a change that shows nothing new doesn't.
    const again = await dev.patch(`/v1/me/oauth-apps/${other.id}`, {
      tagline: 'Keeps your week in view',
    });
    expect(again.app.listing.state).toBe('waiting');
    await review(other.id, 'list');
    expect((await directory(noor)).apps.map((a) => a.name)).toContain('Other app');
    const same = await dev.patch(`/v1/me/oauth-apps/${other.id}`, {
      tagline: 'Keeps your week in view',
    });
    expect(same.app.listing.state).toBe('listed');
    const changed = await dev.patch(`/v1/me/oauth-apps/${other.id}`, { category: 'tasks' });
    expect(changed.app.listing.state).toBe('waiting');
    expect((await directory(noor)).apps.map((a) => a.name)).not.toContain('Other app');
    // Taken out: nothing of the ask stays, and asking again starts over.
    const out = await dev.patch(`/v1/me/oauth-apps/${other.id}`, { listed: false });
    expect(out.app.listing).toMatchObject({
      state: 'none',
      declinedReason: null,
      tagline: 'Keeps your week in view',
    });
    expect((await operator('GET', '/v1/admin/listings')).json().listings).toEqual([]);
    expect(
      (await dev.patch(`/v1/me/oauth-apps/${other.id}`, { listed: true })).app.listing.state,
    ).toBe('waiting');
    // Removing the app removes its listing with it.
    await dev.del(`/v1/me/oauth-apps/${other.id}`);
    expect((await operator('GET', '/v1/admin/listings')).json().listings).toEqual([]);
    expect((await review(other.id, 'list')).statusCode).toBe(404);
  });

  it('a review lets through only what the operator looked at; the operator sees a pending icon', async () => {
    const fresh = (await register(dev, 'Versioned app', 'https://versioned.example')).app;
    const asked = await dev.patch(`/v1/me/oauth-apps/${fresh.id}`, {
      tagline: 'First words',
      category: 'work',
      loginUrl: 'https://versioned.example/login',
      listed: true,
    });
    const seen = asked.app.listing.revision;
    expect(asked.app.listing.askedAt).toBeTruthy();
    const changed = await dev.patch(`/v1/me/oauth-apps/${fresh.id}`, { tagline: 'Second words' });
    expect(changed.app.listing.state).toBe('waiting');
    expect(changed.app.listing.revision).toBe(seen + 1);
    const stale = await operator('POST', `/v1/admin/listings/${fresh.id}`, {
      decision: 'list',
      revision: seen,
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error.code).toBe('listing_changed');
    expect((await review(fresh.id, 'list')).statusCode).toBe(200);
    const icon = await uploadImage(dev);
    await dev.patch(`/v1/me/oauth-apps/${fresh.id}`, { iconFileId: icon.id });
    expect((await operator('GET', `/v1/admin/listings/${fresh.id}/icon`)).statusCode).toBe(200);
    expect((await noor.req('GET', `/v1/admin/listings/${fresh.id}/icon`)).statusCode).toBe(401);
    await dev.del(`/v1/me/oauth-apps/${fresh.id}`);
  });

  it('an icon is the owner’s own image, seen by anyone once listed and by its owner before', async () => {
    const theirs = await uploadImage(noor);
    const stolen = await dev.req('PATCH', `/v1/me/oauth-apps/${app.id}`, { iconFileId: theirs.id });
    expect(stolen.statusCode).toBe(400);
    const mine = await uploadImage(dev);
    const set = await dev.patch(`/v1/me/oauth-apps/${app.id}`, { iconFileId: mine.id });
    expect(set.app.listing.iconFileId).toBe(mine.id);
    // A new icon on a listed app is a change to what's shown: it asks again.
    expect(set.app.listing.state).toBe('waiting');
    const path = `/v1/directory/${app.id}/icon?v=${mine.id.slice(-8)}`;
    expect((await dev.get(`/v1/directory/${app.id}`)).app.iconUrl).toBe(path);
    expect((await noor.req('GET', path)).statusCode).toBe(404);
    const own = await dev.req('GET', path);
    expect(own.statusCode).toBe(200);
    expect(own.headers['content-type']).toMatch(/^image\//);
    await review(app.id, 'list');
    const seen = await noor.req('GET', path);
    expect(seen.statusCode).toBe(200);
    expect(seen.headers['content-type']).toMatch(/^image\//);
    expect((await directory(noor)).apps[1]?.iconUrl).toBe(path);
    expect((await noor.get('/v1/me/connected-apps')).apps).toEqual([]);
    // Anonymous, nothing.
    expect((await t.app.inject({ method: 'GET', url: path })).statusCode).toBe(401);
  });

  it('an organization publishes it, when its owner or admins say so', async () => {
    const studio = (
      await dev.post('/v1/orgs', {
        name: 'Dana Studio',
        handle: `studio.${uuidv4().slice(0, 6)}`,
        kind: 'shop',
        country: 'EG',
      })
    ).org.id;
    const theirs = (
      await noor.post('/v1/orgs', {
        name: 'Noor Clinic',
        handle: `clinic.${uuidv4().slice(0, 6)}`,
        kind: 'clinic',
        country: 'LB',
      })
    ).org.id;
    const notMine = await dev.req('PATCH', `/v1/me/oauth-apps/${app.id}`, { orgId: theirs });
    expect(notMine.statusCode).toBe(403);
    const under = await dev.patch(`/v1/me/oauth-apps/${app.id}`, { orgId: studio });
    expect(under.app.listing.orgId).toBe(studio);
    await review(app.id, 'list');
    expect((await directory(noor)).apps[1]?.publisher).toEqual({
      name: 'Dana Studio',
      handle: expect.stringMatching(/^studio\./),
      verified: false,
    });
    const queueAfter = await dev.patch(`/v1/me/oauth-apps/${app.id}`, { orgId: null });
    expect(queueAfter.app.listing.orgId).toBeNull();
    await review(app.id, 'list');
  });

  it('pages thousands by keyset, searches by name and tagline, narrows by category', async () => {
    // Three developers' worth of listed apps (20 each at most), with counts of their own.
    const devs = await Promise.all([1, 2, 3].map((n) => signup(t, { displayName: `Maker ${n}` })));
    const made: string[] = [];
    let n = 0;
    for (const d of devs)
      for (let i = 0; i < 15; i++) {
        n++;
        const site = `https://app${n}.example`;
        const a = (await register(d, `Number ${n}`, site)).app;
        await d.patch(`/v1/me/oauth-apps/${a.id}`, {
          tagline: n % 3 === 0 ? 'Keeps your meetings' : 'Keeps your notes',
          category: n % 2 === 0 ? 'calendars' : 'tasks',
          loginUrl: `${site}/login`,
          listed: true,
        });
        expect((await review(a.id, 'list')).statusCode).toBe(200);
        await t.ctx.db
          .updateTable('oauth_clients')
          .set({ connected_count: n * 7 })
          .where('id', '=', a.id)
          .execute();
        made.push(a.id);
      }
    const all: string[] = [];
    let before: string | null = null;
    let pages = 0;
    do {
      const page = await directory(noor, `?limit=20${before ? `&before=${before}` : ''}`);
      pages++;
      if (pages === 1) expect(page.apps[0]?.id).toBe('calendar');
      const counts = page.apps.filter((a) => a.kind === 'oauth').map((a) => a.connectedCount);
      expect(counts).toEqual([...counts].sort((x, y) => y - x));
      all.push(...page.apps.filter((a) => a.kind === 'oauth').map((a) => a.id));
      before = page.nextBefore;
    } while (before);
    expect(pages).toBe(3);
    expect(new Set(all).size).toBe(all.length);
    expect(all).toHaveLength(made.length + 1);
    expect(all[0]).toBe(made[made.length - 1]);
    // A search matches the name or the tagline; a category narrows, the built-in included.
    const byName = await directory(noor, '?q=number%204');
    expect(byName.apps.map((a) => a.name).sort()).toEqual(
      [
        'Number 4',
        'Number 40',
        'Number 41',
        'Number 42',
        'Number 43',
        'Number 44',
        'Number 45',
      ].sort(),
    );
    const byTagline = await directory(noor, '?q=meetings&limit=50');
    // The built-in's tagline says "meetings" too: it's searched like any other.
    expect(byTagline.apps[0]?.id).toBe('calendar');
    const matched = byTagline.apps.filter((a) => a.kind === 'oauth');
    expect(matched.every((a) => Number(a.name.replace('Number ', '')) % 3 === 0)).toBe(true);
    expect(matched).toHaveLength(15);
    const calendars = await directory(noor, '?category=calendars&limit=50');
    expect(calendars.apps[0]?.id).toBe('calendar');
    expect(calendars.apps.slice(1).every((a) => a.category === 'calendars')).toBe(true);
    expect(calendars.apps).toHaveLength(23);
    const none = await directory(noor, '?q=%25');
    expect(none.apps.filter((a) => a.kind === 'oauth')).toEqual([]);
    expect((await noor.req('GET', '/v1/directory?before=nonsense')).statusCode).toBe(400);
    expect((await noor.req('GET', '/v1/directory?limit=500')).statusCode).toBe(400);
  });
});
