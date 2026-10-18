import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LISTING_CHECKS, uuidv4 } from '@caime/core';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MARKET_PAGE_SIZE } from '../src/lib/marketplace-pages';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

/**
 * The marketplace (R80): what a listing says beyond R74's, the operator's checks, the address
 * given once and held, delisting with a note, and the pages a visitor reads, signed in or not.
 */
let t: TestApp;
let dir: string;
let dev: Client;
let noor: Client;
let digest: { id: string };
const ADMIN = 'operator-token-0123456789abcdef';
const PAGE = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';
const SITE = 'https://digest.example';
const TERMS = {
  pricing: 'freemium',
  languages: ['en', 'ar'],
  supportUrl: 'mailto:help@digest.example',
  privacyUrl: `${SITE}/privacy`,
};

const visit = (url: string, headers: Record<string, string> = {}) =>
  t.app.inject({ method: 'GET', url, headers: { accept: PAGE, ...headers } });
const operator = (method: 'GET' | 'POST', url: string, body?: object) =>
  t.app.inject({
    method,
    url,
    headers: { authorization: `Bearer ${ADMIN}` },
    ...(body ? { payload: body } : {}),
  });
const revisionOf = async (id: string) =>
  (
    (await operator('GET', '/v1/admin/listings')).json() as {
      listings: Array<{ id: string; listing: { revision: number } }>;
    }
  ).listings.find((l) => l.id === id)?.listing.revision ?? 0;
const review = async (id: string, decision: 'list' | 'decline' | 'delist', more: object = {}) =>
  operator('POST', `/v1/admin/listings/${id}`, {
    decision,
    revision: await revisionOf(id),
    ...(decision === 'list'
      ? { checks: [...LISTING_CHECKS] }
      : { reason: 'Its help page is gone.' }),
    ...more,
  });
const register = async (c: Client, name: string, site = SITE) =>
  (
    (await c.post('/v1/me/oauth-apps', {
      name,
      website: site,
      redirectUris: [`${site}/callback`],
    })) as { app: { id: string } }
  ).app;
const ask = (c: Client, id: string, site = SITE, more: object = {}) =>
  c.patch(`/v1/me/oauth-apps/${id}`, {
    tagline: 'Your week, every Monday',
    category: 'tasks',
    loginUrl: `${site}/login`,
    ...TERMS,
    listed: true,
    ...more,
  });

/** An image of `width` × `height`, uploaded by `c`. */
async function upload(c: Client, width: number, height: number) {
  const png = await sharp({
    create: { width, height, channels: 3, background: '#c8285f' },
  })
    .png()
    .toBuffer();
  const boundary = `----caime${uuidv4()}`;
  const payload = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="shot.png"\r\nContent-Type: image/png\r\n\r\n`,
    ),
    png,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const res = await t.app.inject({
    method: 'POST',
    url: '/v1/files',
    payload,
    headers: {
      'content-type': `multipart/form-data; boundary=${boundary}`,
      authorization: `Bearer ${c.token}`,
    },
  });
  expect(res.statusCode).toBe(201);
  return res.json().file as { id: string };
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'caime-market-'));
  writeFileSync(
    join(dir, 'index.html'),
    '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Caime</title></head><body><div id="root"></div><script src="/_expo/static/js/entry-abc.js" defer></script></body></html>',
  );
  mkdirSync(join(dir, '_expo', 'static', 'js'), { recursive: true });
  writeFileSync(join(dir, '_expo', 'static', 'js', 'entry-abc.js'), '1');
  t = await createTestApp({
    WEB_DIR: dir,
    PUBLIC_URL: 'https://caime.example',
    ADMIN_TOKEN: ADMIN,
  });
  dev = await signup(t, { displayName: 'Dana Developer' });
  noor = await signup(t, { displayName: 'Noor Haddad' });
  digest = await register(dev, 'Weekly Digest');
});

afterAll(async () => {
  await t.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('a listing says more (R80)', () => {
  it('asks for how it’s paid for, help and a privacy policy, each where people can reach it', async () => {
    const bare = await dev.req('PATCH', `/v1/me/oauth-apps/${digest.id}`, {
      tagline: 'Your week, every Monday',
      category: 'tasks',
      loginUrl: `${SITE}/login`,
      listed: true,
    });
    expect(bare.statusCode).toBe(400);
    expect(bare.json().error.message).toMatch(/how it’s paid for, where to get help/);
    for (const [field, value] of [
      ['supportUrl', 'ftp://digest.example'],
      ['supportUrl', 'javascript:alert(1)'],
      ['privacyUrl', 'http://digest.example/privacy'],
      ['pricing', 'pay-what-you-want'],
      ['languages', ['xx']],
    ] as const) {
      const r = await dev.req('PATCH', `/v1/me/oauth-apps/${digest.id}`, { [field]: value });
      expect(r.statusCode, field).toBe(400);
    }
    const aiBad = await dev.req('PATCH', `/v1/me/oauth-apps/${digest.id}`, {
      aiUse: { model: 'A model', keeps: 'Nothing', days: -1, where: 'EU' },
    });
    expect(aiBad.statusCode).toBe(400);
  });

  it('takes screenshots that are its developer’s own images, 8:5 and wide enough', async () => {
    const square = await upload(dev, 1600, 1600);
    const small = await upload(dev, 800, 500);
    const right = await upload(dev, 1600, 1000);
    const theirs = await upload(noor, 1600, 1000);
    for (const id of [square.id, small.id]) {
      const r = await dev.req('PATCH', `/v1/me/oauth-apps/${digest.id}`, { screenshotIds: [id] });
      expect(r.statusCode).toBe(400);
      expect(r.json().error.message).toBe('A screenshot is 8:5 and at least 1,280 pixels wide.');
    }
    const notMine = await dev.req('PATCH', `/v1/me/oauth-apps/${digest.id}`, {
      screenshotIds: [theirs.id],
    });
    expect(notMine.statusCode).toBe(400);
    const six = await dev.req('PATCH', `/v1/me/oauth-apps/${digest.id}`, {
      screenshotIds: Array.from({ length: 6 }, () => uuidv4()),
    });
    expect(six.statusCode).toBe(400);
    const asked = await ask(dev, digest.id, SITE, {
      screenshotIds: [right.id],
      aiUse: { model: 'A hosted model', keeps: 'the summary', days: 30, where: 'the EU' },
    });
    expect(asked.app.listing).toMatchObject({
      state: 'waiting',
      pricing: 'freemium',
      languages: ['en', 'ar'],
      supportUrl: 'mailto:help@digest.example',
      privacyUrl: `${SITE}/privacy`,
      aiUse: { model: 'A hosted model', keeps: 'the summary', days: 30, where: 'the EU' },
      screenshotIds: [right.id],
      slug: null,
    });
    // The same disclosure sent again, its keys in another order, changes nothing shown.
    const same = await dev.patch(`/v1/me/oauth-apps/${digest.id}`, {
      aiUse: { where: 'the EU', days: 30, keeps: 'the summary', model: 'A hosted model' },
    });
    expect(same.app.listing.revision).toBe(asked.app.listing.revision);
    // Before it's let through, a screenshot is its owner's and the operator's alone.
    expect(
      (await t.app.inject({ url: `/v1/directory/${digest.id}/screenshots/0` })).statusCode,
    ).toBe(404);
    expect((await dev.req('GET', `/v1/directory/${digest.id}/screenshots/0`)).statusCode).toBe(200);
    expect(
      (await operator('GET', `/v1/admin/listings/${digest.id}/screenshots/0`)).statusCode,
    ).toBe(200);
  });
});

describe('the operator’s look (R80)', () => {
  it('lists only with every point of the bar checked, and gives the app its address', async () => {
    const queue = (await operator('GET', '/v1/admin/listings')).json();
    expect(queue.listings[0]).toMatchObject({
      id: digest.id,
      checks: [...LISTING_CHECKS],
      screenshots: [
        expect.stringMatching(new RegExp(`^/v1/admin/listings/${digest.id}/screenshots/0\\?v=`)),
      ],
    });
    const unchecked = await review(digest.id, 'list', { checks: ['permissions', 'connect'] });
    expect(unchecked.statusCode).toBe(400);
    expect(unchecked.json().error.message).toBe('Check every point of the bar before listing it.');
    const listed = await review(digest.id, 'list');
    expect(listed.statusCode).toBe(200);
    expect(listed.json().listing.listing).toMatchObject({ state: 'listed', slug: 'weekly-digest' });
    const noted = await t.ctx.db
      .selectFrom('audit_log')
      .select('metadata')
      .where('action', '=', 'oauth.listing_reviewed')
      .where('target', '=', digest.id)
      .executeTakeFirstOrThrow();
    expect(noted.metadata).toMatchObject({ decision: 'list', checks: [...LISTING_CHECKS] });
    const seen = (await noor.get(`/v1/directory/${digest.id}`)).app;
    expect(seen).toMatchObject({
      slug: 'weekly-digest',
      pricing: 'freemium',
      languages: ['en', 'ar'],
      supportUrl: 'mailto:help@digest.example',
      privacyUrl: `${SITE}/privacy`,
      aiUse: { model: 'A hosted model', days: 30 },
      screenshots: [
        expect.stringMatching(new RegExp(`^/v1/directory/${digest.id}/screenshots/0\\?v=`)),
      ],
    });
    // Listed, its icon and screenshots are anyone's, as its page is.
    expect(
      (await t.app.inject({ url: `/v1/directory/${digest.id}/screenshots/0` })).statusCode,
    ).toBe(200);
    expect(
      (await t.app.inject({ url: `/v1/directory/${digest.id}/screenshots/3` })).statusCode,
    ).toBe(404);
  });

  it('gives each app an address of its own: never a category’s or Caime’s, never one held', async () => {
    const twin = await register(dev, 'Weekly digest', 'https://twin.example');
    const cal = await register(dev, 'Calendar', 'https://cal.example');
    const arabic = await register(dev, 'ملخص الأسبوع', 'https://ar.example');
    for (const [app, site] of [
      [twin, 'https://twin.example'],
      [cal, 'https://cal.example'],
      [arabic, 'https://ar.example'],
    ] as const) {
      await ask(dev, app.id, site);
      expect((await review(app.id, 'list')).statusCode).toBe(200);
    }
    const slugOf = async (id: string) => (await noor.get(`/v1/directory/${id}`)).app.slug;
    expect(await slugOf(twin.id)).toBe('weekly-digest-2');
    expect(await slugOf(cal.id)).toBe('calendar-2');
    expect(await slugOf(arabic.id)).toBe(`app-${arabic.id.slice(0, 8)}`);
    // Removed, its address stays held: a new app of the same name gets the next one.
    await dev.del(`/v1/me/oauth-apps/${twin.id}`);
    const third = await register(dev, 'Weekly Digest', 'https://third.example');
    await ask(dev, third.id, 'https://third.example');
    await review(third.id, 'list');
    expect(await slugOf(third.id)).toBe('weekly-digest-3');
  });

  it('takes a listed app out with a note its developer reads, and keeps its address for its return', async () => {
    const other = await register(dev, 'Out and back', 'https://outback.example');
    await ask(dev, other.id, 'https://outback.example');
    expect((await review(other.id, 'delist')).statusCode).toBe(400);
    await review(other.id, 'list');
    const out = await review(other.id, 'delist', { reason: '' });
    expect(out.statusCode).toBe(400);
    expect((await review(other.id, 'delist')).statusCode).toBe(200);
    expect((await noor.req('GET', `/v1/directory/${other.id}`)).statusCode).toBe(404);
    const told = await t.ctx.db
      .selectFrom('notifications')
      .select(['title', 'body'])
      .where('user_id', '=', dev.user.id)
      .where('kind', '=', 'app')
      .orderBy('created_at', 'desc')
      .executeTakeFirstOrThrow();
    expect(told).toEqual({
      title: 'Out and back was taken out of Discover',
      body: 'Its help page is gone.',
    });
    expect((await visit('/marketplace/out-and-back')).statusCode).toBe(404);
    await dev.patch(`/v1/me/oauth-apps/${other.id}`, { tagline: 'Back again' });
    await review(other.id, 'list');
    expect((await noor.get(`/v1/directory/${other.id}`)).app.slug).toBe('out-and-back');
    expect((await visit('/marketplace/out-and-back')).statusCode).toBe(200);
  });
});

describe('the marketplace on the web (R80)', () => {
  it('lists Caime’s own first, then the listed apps, for a visitor and for someone signed in alike', async () => {
    for (const headers of [{}, { cookie: `caime_session=${noor.token}` }] as Array<
      Record<string, string>
    >) {
      const r = await visit('/marketplace', headers);
      expect(r.statusCode).toBe(200);
      expect(r.headers['cache-control']).toBe('public, max-age=600');
      expect(r.body).not.toContain('entry-abc.js');
      expect(r.body).toContain('<h1>Apps that work with Caime.</h1>');
      expect(r.body).toContain('<a href="/marketplace" aria-current="page">Marketplace</a>');
      expect(r.body).toContain('<meta name="robots" content="index,follow">');
      expect(r.body).toContain('hreflang="ar" href="https://caime.example/marketplace?lang=ar"');
      const order = [...r.body.matchAll(/<li><a href="\/marketplace\/([a-z0-9-]+)"/g)].map(
        (m) => m[1],
      );
      expect(order.slice(0, 6)).toEqual([
        'calendar',
        'zapier',
        'make',
        'n8n',
        'pipedream',
        'ifttt',
      ]);
      expect(order).toContain('weekly-digest');
      expect(r.body).toContain('Built by Caime');
      expect(r.body).toContain('"@type":"CollectionPage"');
    }
    // A category is a page of its own; the bridges are automation's.
    const automation = (await visit('/marketplace/automation')).body;
    expect(automation).toContain('<h1>Automation apps</h1>');
    expect(automation).toContain('aria-current="page">Automation</a>');
    expect(automation).not.toContain('/marketplace/weekly-digest');
    expect(automation).toContain('/marketplace/zapier');
    expect((await visit('/marketplace/travel')).body).toContain('Nothing here yet.');
    expect((await visit('/marketplace/nothing-at-all')).statusCode).toBe(404);
    expect((await visit('/marketplace/%E2%80%A2')).statusCode).toBe(404);
    expect((await visit('/marketplace?before=junk')).statusCode).toBe(404);
  });

  it('an app’s page says what it costs, what it speaks, where help is and what it does with a model', async () => {
    const r = await visit('/marketplace/weekly-digest');
    expect(r.statusCode).toBe(200);
    const b = r.body;
    expect(b).toContain('<h1>Weekly Digest</h1>');
    expect(b).toContain('aria-current="true">Marketplace</a>');
    expect(b).toContain('<dt class="mono">Price</dt><dd>Free and paid plans</dd>');
    expect(b).toContain('<dt class="mono">Languages</dt><dd>English and Arabic</dd>');
    expect(b).toContain('<dt class="mono">Reviewed</dt><dd>Reviewed by Caime</dd>');
    expect(b).toContain('href="mailto:help@digest.example" rel="noopener nofollow"');
    expect(b).toContain(`href="${SITE}/privacy" rel="noopener nofollow"`);
    expect(b).toContain(
      'Puts people’s words through A hosted model. Keeps the summary, for 30 days, in the EU.',
    );
    expect(b).toMatch(
      /<img src="\/v1\/directory\/[0-9a-f-]+\/screenshots\/0\?v=[0-9a-f]+" alt="Weekly Digest, screenshot 1"/,
    );
    expect(b).toContain(`<a href="/settings/apps?app=${digest.id}">Connect in Caime</a>`);
    expect(b).toContain('"@type":"SoftwareApplication"');
    expect(b).toContain('"@type":"BreadcrumbList"');
    expect(b).not.toContain('entry-abc.js');
    // Caime's own: built by Caime, its help and policy Caime's.
    const zapier = (await visit('/marketplace/zapier')).body;
    expect(zapier).toContain('<dt class="mono">Reviewed</dt><dd>Built by Caime</dd>');
    expect(zapier).toContain('<a href="/privacy">');
    expect(zapier).toContain('Turn it on in Caime');
    expect(zapier).not.toContain('<dt class="mono">AI</dt>');
  });

  it('reads in Arabic, right to left, and keeps the reader’s language on its links', async () => {
    const r = await visit('/marketplace/weekly-digest?lang=ar');
    expect(r.body).toContain('<html lang="ar" dir="rtl"');
    expect(r.body).toContain('href="/marketplace/tasks?lang=ar"');
    const list = await visit('/marketplace', { 'accept-language': 'ar' });
    expect(list.body).toContain('dir="rtl"');
    expect(list.headers.vary).toMatch(/accept-language/i);
  });

  it('pages a long list by keyset, and the sitemap names every listed app', async () => {
    // Twenty apps a developer at most: three of them, then.
    const makers = [
      await signup(t, { displayName: 'Maker One' }),
      await signup(t, { displayName: 'Maker Two' }),
      await signup(t, { displayName: 'Maker Three' }),
    ];
    for (let n = 0; n < MARKET_PAGE_SIZE; n++) {
      const site = `https://many${n}.example`;
      const maker = makers[n % makers.length] as Client;
      const a = await register(maker, `Many ${n}`, site);
      await ask(maker, a.id, site, { privacyUrl: `${site}/privacy` });
      await review(a.id, 'list');
    }
    const first = (await visit('/marketplace')).body;
    const next = /href="\/marketplace\?before=([^"&]+)"/.exec(first)?.[1];
    expect(next).toBeTruthy();
    const second = await visit(`/marketplace?before=${next}`);
    expect(second.statusCode).toBe(200);
    expect(second.body).toContain('<meta name="robots" content="noindex">');
    expect(second.body).not.toContain('/marketplace/zapier"');
    const seenFirst = new Set(
      [...first.matchAll(/href="\/marketplace\/([a-z0-9-]+)"/g)].map((m) => m[1]),
    );
    const onSecond = [...second.body.matchAll(/<li><a href="\/marketplace\/([a-z0-9-]+)"/g)].map(
      (m) => m[1],
    );
    expect(onSecond.length).toBeGreaterThan(0);
    for (const s of onSecond) expect(seenFirst.has(s)).toBe(false);
    const sitemap = (await t.app.inject({ url: '/sitemap.xml' })).body;
    expect(sitemap).toContain('<loc>https://caime.example/marketplace</loc>');
    expect(sitemap).toContain('<loc>https://caime.example/marketplace/automation</loc>');
    expect(sitemap).toContain('<loc>https://caime.example/marketplace/zapier</loc>');
    expect(sitemap).toContain('https://caime.example/marketplace/weekly-digest</loc>');
    expect(sitemap).toContain('https://caime.example/marketplace/many-0</loc>');
  });

  it('the developers’ page writes the bar down, and links the marketplace', async () => {
    const page = (await visit('/developers')).body;
    expect(page).toContain('<section class="sheet" id="bar"');
    expect(page).toContain('The bar for the marketplace');
    expect(page).toContain('up to 5 screenshots at 8:5');
    expect(page).toContain('<a href="/marketplace">The marketplace</a>');
  });
});
