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

/** Where a listed app sits on the first page: after the calendar and the five bridges (R79). */
const FIRST_LISTED = 6;
const BRIDGE_IDS = ['zapier', 'make', 'n8n', 'pipedream', 'ifttt'];

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
      provides: [],
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
    expect(seen.apps.map((a) => a.id)).toEqual(['calendar', ...BRIDGE_IDS]);
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
    expect(seen.apps.map((a) => a.name)).toEqual([
      'Your calendar',
      'Zapier',
      'Make',
      'n8n',
      'Pipedream',
      'IFTTT',
      'Weekly digest',
    ]);
    expect(seen.apps[FIRST_LISTED]).toMatchObject({
      kind: 'oauth',
      publisher: {
        kind: 'person',
        name: 'Dana Developer',
        handle: dev.user.handle,
        verified: false,
      },
      connectedCount: 0,
      connected: false,
      connectUrl: LOGIN,
      iconUrl: null,
    });
    // Letting it in twice is one grant, counted once; a second person is two.
    await allow(noor, app.clientId);
    await allow(noor, app.clientId);
    expect((await directory(noor)).apps[FIRST_LISTED]).toMatchObject({
      connectedCount: 1,
      connected: true,
    });
    await allow(sam, app.clientId);
    expect((await directory(noor)).apps[FIRST_LISTED]).toMatchObject({ connectedCount: 2 });
    expect((await directory(dev)).apps[FIRST_LISTED]).toMatchObject({
      connectedCount: 2,
      connected: false,
    });
    // Connected shows it as a row of the same kind a built-in would be.
    const { apps } = await noor.get('/v1/me/connected-apps');
    expect(apps).toEqual([
      expect.objectContaining({
        kind: 'oauth',
        appId: app.id,
        name: 'Weekly digest',
        publisher: {
          kind: 'person',
          name: 'Dana Developer',
          handle: dev.user.handle,
          verified: false,
        },
        iconUrl: null,
        scopes: ['messages:read'],
      }),
    ]);
    // The developer sees how many connected it, never who (review 2026-10-09 M9).
    expect((await dev.get('/v1/me/oauth-apps')).apps[0]).toMatchObject({
      id: app.id,
      connectedCount: 2,
    });
    await noor.del(`/v1/me/connected-apps/${apps[0].grantId}`);
    expect((await directory(noor)).apps[FIRST_LISTED]).toMatchObject({
      connectedCount: 1,
      connected: false,
    });
    // A deleted account lets go of its grants, and the count with them.
    await sam.req('DELETE', '/v1/me', { password: 'correct horse battery' });
    expect((await directory(noor)).apps[FIRST_LISTED]).toMatchObject({ connectedCount: 0 });
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
        publisher: { kind: 'caime', name: 'Caime', handle: null, verified: true },
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

  it('a bridge is a token for the platform (R79): one tap, scoped, shown once, on while it lives, stopped here', async () => {
    const automation = () => directory(noor, '?category=automation');
    expect((await automation()).apps.map((a) => a.id)).toEqual(BRIDGE_IDS);
    expect((await automation()).apps[0]).toMatchObject({
      kind: 'bridge',
      name: 'Zapier',
      category: 'automation',
      publisher: { kind: 'caime', name: 'Caime', handle: null, verified: true },
      connectedCount: 0,
      connected: false,
      connectUrl: null,
    });
    expect((await automation()).apps[0]).toHaveProperty('website', 'https://zapier.com');
    const made = await noor.req('POST', '/v1/me/bridges/zapier', {
      scopes: ['profile:read', 'actions:read'],
    });
    expect(made.statusCode).toBe(201);
    const { token, view } = made.json() as {
      token: string;
      view: { name: string; scopes: string[]; expiresAt: string | null };
    };
    expect(token).toMatch(/^cap_/);
    expect(view).toMatchObject({
      name: 'Zapier',
      scopes: ['profile:read', 'actions:read'],
      expiresAt: null,
    });
    // The token acts as Noor on the person routes, within what was ticked, and nowhere else.
    const as = (tok: string, url: string) =>
      t.app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${tok}` } });
    const me = await as(token, '/v1/me');
    expect(me.statusCode).toBe(200);
    expect(me.json().user.handle).toBe(noor.user.handle);
    expect((await as(token, '/v1/tasks')).statusCode).toBe(200);
    const inbox = await as(token, '/v1/inbox');
    expect(inbox.statusCode).toBe(403);
    expect(inbox.json().error.code).toBe('token_scope');
    expect((await as(token, '/v1/me/tokens')).json().error.code).toBe('token_route');
    // Connected lists it as the platform, with what it may do, and never as a bare token too.
    const { apps } = await noor.get('/v1/me/connected-apps');
    expect(apps).toEqual([
      expect.objectContaining({
        kind: 'bridge',
        appId: 'zapier',
        grantId: null,
        name: 'Zapier',
        website: 'https://zapier.com',
        publisher: { kind: 'caime', name: 'Caime', handle: null, verified: true },
        scopes: ['profile:read', 'actions:read'],
        lastUsedAt: expect.any(String),
      }),
    ]);
    expect((await automation()).apps[0]).toMatchObject({ connected: true, connectedCount: 1 });
    expect((await directory(dev, '?category=automation')).apps[0]).toMatchObject({
      connected: false,
      connectedCount: 1,
    });
    expect((await noor.get('/v1/directory/zapier')).app).toMatchObject({
      id: 'zapier',
      kind: 'bridge',
      connected: true,
    });
    // Discover says it in the reader's language, the platform by its own name.
    const ar = await noor.get('/v1/directory/zapier', { headers: { 'x-caime-language': 'ar' } });
    expect(ar.app.name).toBe('Zapier');
    expect(ar.app.tagline).not.toBe('Connect Caime to the apps on Zapier');
    // A new token for the same platform ends the old one: one lives, counted once.
    const again = (await noor.post('/v1/me/bridges/zapier', {
      scopes: ['messages:read', 'profile:read'],
    })) as { token: string };
    expect((await as(token, '/v1/me')).statusCode).toBe(401);
    expect((await as(again.token, '/v1/me')).statusCode).toBe(200);
    const after = (await noor.get('/v1/me/connected-apps')).apps;
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ kind: 'bridge', scopes: ['messages:read', 'profile:read'] });
    expect((await automation()).apps[0]).toMatchObject({ connectedCount: 1 });
    // A platform that isn't one, and a permission that isn't one.
    expect(
      (await noor.req('POST', '/v1/me/bridges/nothing', { scopes: ['profile:read'] })).statusCode,
    ).toBe(404);
    expect(
      (await noor.req('POST', '/v1/me/bridges/make', { scopes: ['everything'] })).statusCode,
    ).toBe(400);
    // Stopped here: the token ends at once, and Connected and Discover say so.
    await noor.del('/v1/me/bridges/zapier');
    expect((await as(again.token, '/v1/me')).statusCode).toBe(401);
    expect((await noor.get('/v1/me/connected-apps')).apps).toEqual([]);
    expect((await automation()).apps[0]).toMatchObject({ connected: false, connectedCount: 0 });
    expect((await noor.req('DELETE', '/v1/me/bridges/zapier')).statusCode).toBe(404);
    // Under 18, no bridge (R29), as no token.
    const teen = await signup(t, { displayName: 'Teen Haddad', birthDate: '2011-12-31' });
    const refused = await teen.req('POST', '/v1/me/bridges/make', { scopes: ['profile:read'] });
    expect(refused.statusCode).toBe(403);
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
    expect((await directory(noor)).apps[FIRST_LISTED]?.iconUrl).toBe(path);
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
    expect((await directory(noor)).apps[FIRST_LISTED]?.publisher).toEqual({
      kind: 'org',
      name: 'Dana Studio',
      handle: expect.stringMatching(/^studio\./),
      verified: false,
    });
    // Its owner and admins see what's published under it, whatever state each listing is in.
    const under_ = await dev.get(`/v1/orgs/${studio}/listings`);
    expect(under_.apps).toEqual([
      {
        app: expect.objectContaining({ id: app.id, name: 'Weekly digest' }),
        listing: 'listed',
        developer: { displayName: 'Dana Developer', handle: dev.user.handle },
      },
    ]);
    expect(under_.apps[0].app.publisher).toMatchObject({ kind: 'org', name: 'Dana Studio' });
    expect((await noor.req('GET', `/v1/orgs/${studio}/listings`)).statusCode).toBe(404);
    expect((await dev.req('GET', `/v1/orgs/${theirs}/listings`)).statusCode).toBe(404);
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
  it('consent names the same publisher and icon as Discover and Connected do', async () => {
    const { challenge } = pkce();
    const asked = await noor.get(
      `/v1/oauth/authorize?${new URLSearchParams({
        response_type: 'code',
        client_id: app.clientId,
        redirect_uri: REDIRECT,
        scope: 'messages:read',
        code_challenge: challenge,
        code_challenge_method: 'S256',
      })}`,
    );
    expect(asked.app).toEqual({
      id: app.id,
      name: 'Weekly digest',
      website: SITE,
      publisher: {
        kind: 'person',
        name: 'Dana Developer',
        handle: dev.user.handle,
        verified: false,
      },
      iconUrl: expect.stringMatching(/^\/v1\/directory\/.+\/icon\?v=/),
    });
    expect(asked.app).not.toHaveProperty('owner');
  });

  it('tells the developer of each look Caime took: listed, or why not', async () => {
    const { notifications } = await dev.get('/v1/notifications');
    const about = notifications.filter((n: { kind: string }) => n.kind === 'app');
    // Newest first: the last review listed it; an earlier one declined it with its reason.
    expect(about[0]).toMatchObject({
      title: 'Weekly digest is listed in Discover',
      body: 'Anyone on Caime can find and connect it now.',
      data: { appId: app.id },
    });
    expect(about).toContainEqual(
      expect.objectContaining({
        title: expect.stringMatching(/ wasn’t listed$/),
        body: 'The tagline says nothing of what it does.',
      }),
    );
    expect(about.every((n: { data: { appId: unknown } }) => typeof n.data.appId === 'string')).toBe(
      true,
    );
  });

  it('an icon reaches whoever let the app in, listed or not; a personal token is a Connected row too', async () => {
    const path = (await dev.get(`/v1/directory/${app.id}`)).app.iconUrl as string;
    await allow(noor, app.clientId);
    const withdrawn = await dev.patch(`/v1/me/oauth-apps/${app.id}`, { listed: false });
    expect(withdrawn.app.listing.state).toBe('none');
    // Unlisted: its owner and whoever let it in (Connected shows it) see the icon; nobody else.
    expect((await noor.req('GET', path)).statusCode).toBe(200);
    const tala = await signup(t, { displayName: 'Tala Ward' });
    expect((await tala.req('GET', path)).statusCode).toBe(404);
    // A personal token acts for its maker as an app would: Connected lists it and ends it.
    const made = (await noor.post('/v1/me/tokens', {
      name: 'Home script',
      scopes: ['messages:read'],
      days: 30,
    })) as { token: string; view: { id: string } };
    const { apps } = await noor.get('/v1/me/connected-apps');
    expect(apps.map((a: { kind: string; name: string }) => [a.kind, a.name])).toEqual([
      ['oauth', 'Weekly digest'],
      ['token', 'Home script'],
    ]);
    expect(apps[1]).toMatchObject({
      appId: made.view.id,
      grantId: null,
      publisher: { kind: 'person', name: 'Noor Haddad', handle: noor.user.handle, verified: false },
      scopes: ['messages:read'],
    });
    await noor.del(`/v1/me/connected-apps/${made.view.id}`);
    expect(
      (
        await t.app.inject({
          method: 'GET',
          url: '/v1/me',
          headers: { authorization: `Bearer ${made.token}` },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (await noor.get('/v1/me/connected-apps')).apps.map((a: { kind: string }) => a.kind),
    ).toEqual(['oauth']);
    // Someone else's token isn't theirs to end.
    expect((await tala.req('DELETE', `/v1/me/connected-apps/${made.view.id}`)).statusCode).toBe(
      404,
    );
    await noor.del(`/v1/me/connected-apps/${apps[0].grantId}`);
    const again = await dev.patch(`/v1/me/oauth-apps/${app.id}`, { listed: true });
    expect(again.app.listing.state).toBe('waiting');
    await review(app.id, 'list');
  });

  it('under 18, Discover shows apps with nothing to connect; a suspended developer’s leave it', async () => {
    const kid = await signup(t, { displayName: 'Kid Haddad', birthDate: '2012-05-05' });
    // (Found by name: the keyset test above filled the first page with busier apps.)
    const seen = (await directory(kid, '?q=digest')).apps.find((a) => a.id === app.id);
    expect(seen).toMatchObject({ name: 'Weekly digest', connectUrl: null });
    expect((await kid.get(`/v1/directory/${app.id}`)).app.connectUrl).toBeNull();
    expect((await noor.get(`/v1/directory/${app.id}`)).app.connectUrl).toBe(LOGIN);
    await t.ctx.db
      .updateTable('users')
      .set({ suspended_at: t.clock.now })
      .where('id', '=', dev.user.id)
      .execute();
    expect((await directory(noor, '?q=digest')).apps.map((a) => a.name)).not.toContain(
      'Weekly digest',
    );
    expect((await noor.req('GET', `/v1/directory/${app.id}`)).statusCode).toBe(404);
    await t.ctx.db
      .updateTable('users')
      .set({ suspended_at: null })
      .where('id', '=', dev.user.id)
      .execute();
    expect((await directory(noor, '?q=digest')).apps.map((a) => a.name)).toContain('Weekly digest');
  });

  it('says what an app gives Caime (R78): a closed list on the listing, reviewed with it, shown in Discover', async () => {
    const sync = (await register(dev, 'Calendar bridge', 'https://sync.example')).app;
    const bad = await dev.req('PATCH', `/v1/me/oauth-apps/${sync.id}`, { provides: ['payments'] });
    expect(bad.statusCode).toBe(400);
    const asked = await dev.patch(`/v1/me/oauth-apps/${sync.id}`, {
      tagline: 'Your calendar, in step',
      category: 'calendars',
      provides: ['calendar_sync', 'calendar_sync'],
      loginUrl: 'https://sync.example/login',
      listed: true,
    });
    expect(asked.app.listing).toMatchObject({
      state: 'waiting',
      provides: ['calendar_sync'],
      revision: 1,
    });
    expect((await review(sync.id, 'list')).statusCode).toBe(200);
    const shown = (await noor.get(`/v1/directory/${sync.id}`)).app as { provides: string[] };
    expect(shown.provides).toEqual(['calendar_sync']);
    // A change to what it gives is a change to what's shown: it asks again, as a new tagline would.
    const more = await dev.patch(`/v1/me/oauth-apps/${sync.id}`, {
      provides: ['calendar_sync', 'mail'],
    });
    expect(more.app.listing).toMatchObject({
      state: 'waiting',
      provides: ['calendar_sync', 'mail'],
      revision: 2,
    });
    expect((await noor.req('GET', `/v1/directory/${sync.id}`)).statusCode).toBe(404);
    // The same list again changes nothing.
    expect((await review(sync.id, 'list')).statusCode).toBe(200);
    const same = await dev.patch(`/v1/me/oauth-apps/${sync.id}`, {
      provides: ['calendar_sync', 'mail'],
    });
    expect(same.app.listing).toMatchObject({ state: 'listed', revision: 2 });
    expect(
      ((await noor.get(`/v1/directory/${sync.id}`)).app as { provides: string[] }).provides,
    ).toEqual(['calendar_sync', 'mail']);
    // Caime's own carry none.
    const own = (await noor.get('/v1/directory/calendar')).app as { provides: string[] };
    expect(own.provides).toEqual([]);
  });
});
