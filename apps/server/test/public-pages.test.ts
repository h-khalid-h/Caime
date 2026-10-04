import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BUSINESS_VIEW_LABELS, BUSINESS_VIEWS } from '@caime/core/business';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let dir: string;
let noor: Client;
let teen: Client;
let orgId: string;
const PAGE = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'caime-public-'));
  writeFileSync(
    join(dir, 'index.html'),
    '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Caime</title><link rel="manifest" href="/manifest.webmanifest"></head><body><div id="root"></div><script src="/_expo/static/js/entry-abc.js" defer></script></body></html>',
  );
  mkdirSync(join(dir, '_expo', 'static', 'js'), { recursive: true });
  writeFileSync(join(dir, '_expo', 'static', 'js', 'entry-abc.js'), '1');
  t = await createTestApp({ WEB_DIR: dir, PUBLIC_URL: 'https://caime.example' });
  noor = await signup(t, { displayName: 'Noor Haddad', handle: 'noor' });
  teen = await signup(t, { displayName: 'Rami Young', handle: 'rami', birthDate: '2011-12-31' });
  await noor.req('PATCH', '/v1/me', { bio: 'Dentist in Cairo. Ask me about implants.' });
  const { org } = await noor.post('/v1/orgs', {
    country: 'EG',
    name: 'Nile Dental',
    handle: 'nile.dental',
    kind: 'clinic',
    about: 'A clinic on the corniche.',
    website: 'https://niledental.example',
    foundedYear: 1998,
  });
  orgId = org.id;
});
afterAll(async () => {
  await t.close();
  rmSync(dir, { recursive: true, force: true });
});

const visit = (url: string, headers: Record<string, string> = {}) =>
  t.app.inject({ method: 'GET', url, headers: { accept: PAGE, ...headers } });

describe('the readable web (R44)', () => {
  it('a visitor gets the landing page in the shell; someone signed in gets the app', async () => {
    const r = await visit('/');
    expect(r.statusCode).toBe(200);
    expect(r.headers['permissions-policy']).toContain('camera=(self)');
    expect(r.body).toContain('<title>Caime: Messaging that understands your relationships</title>');
    expect(r.body).toContain('<meta name="robots" content="index,follow">');
    expect(r.body).toContain('<link rel="canonical" href="https://caime.example/">');
    expect(r.body).toContain('<meta property="og:title"');
    expect(r.body).toContain('"@type":"SoftwareApplication"');
    expect(r.body).toContain('<div id="static">');
    expect(r.body).toContain('Connect in three taps.');
    // A spec sheet and a layer explorer, with no script of their own: radio buttons and CSS.
    expect(r.body).toContain('<dl class="spec">');
    expect(r.body.match(/<input type="radio" name="layer"/g)).toHaveLength(6);
    expect(r.body).toContain('<label for="layer-attention"');
    expect(r.body).toContain('id="panel-layer-privacy"');
    expect(r.body.split('<div id="static">')[1]!.split('</main>')[0]).not.toContain('<script');
    expect(r.body).toContain('href="/sign-up"');
    // The shell is intact around it, without the app's scripts: a visitor's page is a page.
    expect(r.body).toContain('<div id="root"></div>');
    expect(r.body).not.toContain('entry-abc.js');
    // A session cookie: the app, with nothing to index or read.
    const signedIn = await visit('/', { cookie: `caime_session=${noor.token}` });
    expect(signedIn.body).toContain('<meta name="robots" content="noindex">');
    expect(signedIn.body).not.toContain('<div id="static">');
  });

  it('a person’s page shows what they show to everyone, while they can be found by handle', async () => {
    const r = await visit('/@noor');
    expect(r.statusCode).toBe(200);
    expect(r.body).toContain('<title>Noor Haddad (@noor) · Caime</title>');
    expect(r.body).toContain('content="Dentist in Cairo. Ask me about implants."');
    expect(r.body).toContain('<meta property="og:type" content="profile">');
    expect(r.body).toContain('"@type":"Person"');
    expect(r.body).toContain('"memberOf":[{"@type":"Organization","name":"Nile Dental"');
    // Facts as a spec sheet: mono labels, one row each.
    expect(r.body).toContain('<dt class="mono">handle</dt><dd>@noor</dd>');
    expect(r.body).toContain(
      '<dt class="mono">with</dt><dd><a href="/o/nile.dental">Nile Dental</a></dd>',
    );
    // A visitor gets the page alone: no scripts to boot an app that would stand aside anyway;
    // the JSON-LD stays. Signed in, the app comes with it.
    expect(r.body).not.toContain('entry-abc.js');
    expect(r.body).toContain('href="/sign-up?link=%2F%40noor"');
    expect(r.body).toContain('<script type="application/ld+json">');
    expect(r.body).toContain('<meta name="caime-page" content="person">');
    const mine = await visit('/@noor', { cookie: `caime_session=${noor.token}` });
    expect(mine.body).toContain('entry-abc.js');
    // Their bio kept for connections: not on the page; a JSON-LD script is still a script, so
    // nothing of theirs can close it.
    await noor.req('PUT', '/v1/me/privacy', { fields: { bio: { kind: 'connections' } } });
    await noor.req('PATCH', '/v1/me', { bio: '</script><script>alert(1)</script>' });
    const quieter = await visit('/@noor');
    expect(quieter.body).not.toContain('alert(1)');
    expect(quieter.body).not.toContain('Dentist in Cairo');
    // Not findable by handle: no page, and told so as for nobody, for the app to take over.
    await noor.req('PUT', '/v1/me/privacy', { discoverByHandle: false });
    const gone = await visit('/@noor');
    expect(gone.statusCode).toBe(404);
    expect(gone.body).toContain('<meta name="robots" content="noindex">');
    expect(gone.body).toContain('Nobody by that handle');
    expect(gone.body).toContain('<div id="root"></div>');
    await noor.req('PUT', '/v1/me/privacy', { discoverByHandle: true });
    // Under 18: never a public page (R29).
    expect((await visit('/@rami')).statusCode).toBe(404);
    expect((await visit('/@rami')).body).not.toContain('Rami Young');
    // Nobody: a 404 that still boots the app; a bad handle the same.
    expect((await visit('/@nobody.here')).statusCode).toBe(404);
    expect((await visit('/@a')).statusCode).toBe(404);
  });

  it('an organization’s page, at /o/ and at its @handle, with its logo public', async () => {
    for (const path of ['/o/nile.dental', '/@nile.dental']) {
      const r = await visit(path);
      expect(r.statusCode, path).toBe(200);
      expect(r.body).toContain('<title>Nile Dental (@nile.dental) · Caime</title>');
      expect(r.body).toContain('content="A clinic on the corniche."');
      expect(r.body).toContain('"@type":"Organization"');
      expect(r.body).toContain('"foundingDate":"1998"');
      expect(r.body).toContain('"sameAs":["https://niledental.example"]');
      expect(r.body).toContain(`<link rel="canonical" href="https://caime.example${path}">`);
      // Its door (R53): whoever would write signs up, or in, and lands in the conversation.
      expect(r.body).toContain('href="/sign-up?link=%2Fo%2Fnile.dental%3Fwrite"');
      expect(r.body).toContain('href="/sign-in?link=%2Fo%2Fnile.dental%3Fwrite"');
    }
    expect((await visit('/o/noor')).statusCode).toBe(404);
    // Its logo needs no sign-in; a person's photo only when they show it to everyone.
    expect((await t.app.inject({ url: `/v1/orgs/${orgId}/avatar` })).statusCode).toBe(404);
    expect((await t.app.inject({ url: `/v1/users/${noor.user.id}/avatar` })).statusCode).toBe(404);
    expect((await t.app.inject({ url: `/v1/users/${teen.user.id}/avatar` })).statusCode).toBe(404);
  });

  it('the site about Caime: five pages, everyone’s, script-free, each a spec sheet', async () => {
    const pages: Record<string, string> = {
      business: 'Answer as the organization, and prove it’s you.',
      pricing: 'Free for people. Organizations pay for their team.',
      security: 'Each side of your life sees what you chose.',
      developers: 'An API that reaches only what it was given.',
      about: 'Made for the people in your life, not for a feed.',
    };
    for (const [name, h1] of Object.entries(pages)) {
      for (const headers of [{}, { cookie: `caime_session=${noor.token}` }] as Array<
        Record<string, string>
      >) {
        const r = await visit(`/${name}`, headers);
        expect(r.statusCode, name).toBe(200);
        expect(r.headers['cache-control']).toBe('public, max-age=600');
        expect(r.body, name).toContain(`<h1>${h1}</h1>`);
        expect(r.body).toContain('<meta name="robots" content="index,follow">');
        expect(r.body).toContain(`<link rel="canonical" href="https://caime.example/${name}">`);
        // The masthead's nav names where you are; the page never boots the app, signed in or not.
        expect(r.body).toContain(`<a href="/${name}" aria-current="page">`);
        expect(r.body).toContain('<a href="/sign-in">Sign in</a>');
        expect(r.body).toContain('<dl class="spec">');
        expect(r.body).not.toContain('entry-abc.js');
        expect(r.body).toContain('href="mailto:hello@cai.me"');
      }
    }
    // What the pages say is what the code does: the plans' numbers, the encryption's, the API's.
    const pricing = (await visit('/pricing')).body;
    expect(pricing).toContain('<dt class="mono">team</dt><dd>3 people</dd>');
    expect(pricing).toContain('<dt class="mono">team</dt><dd>100 people</dd>');
    expect(pricing).toContain('<dt class="mono">ai assist</dt><dd>200 actions a day</dd>');
    expect(pricing).toContain('<dt class="mono">files</dt><dd>100 GB</dd>');
    // Billing isn't connected here: the price is in the app, never made up.
    expect(pricing).toContain('price shown in the app');
    expect(pricing).not.toMatch(/€\d/);
    const business = (await visit('/business')).body;
    expect(business).toContain(
      BUSINESS_VIEWS.map((v) => BUSINESS_VIEW_LABELS[v].toLowerCase()).join(', '),
    );
    expect(business.match(/<input type="radio" name="step"/g)).toHaveLength(4);
    const security = (await visit('/security')).body;
    expect(security).toContain('Up to 64 people, 20 devices each.');
    expect(security).toContain('Ended sign-ins are kept 30 days, security records a year');
    expect(security.match(/<input type="radio" name="sees"/g)).toHaveLength(4);
    expect((await visit('/developers')).body).toContain('600 requests a minute per token.');
    expect((await visit('/about')).body).toContain('made by DATA C OÜ');
    // The landing page carries the same nav, and links on to the site.
    const home = (await visit('/')).body;
    expect(home).toContain('<a href="/" aria-current="page">Home</a>');
    expect(home).toContain('<a href="/business">For organizations</a>');
    // Not a page of the site: the app, as before.
    expect((await visit('/pricing2')).body).toContain('entry-abc.js');
    expect((await visit('/sitemap.xml')).body).toContain(
      '<loc>https://caime.example/pricing</loc>',
    );
  });

  it('the app’s own screens ask not to be indexed; robots and the sitemap say what is', async () => {
    const screen = await visit('/c/0193b2c4-0000-7000-8000-000000000000');
    expect(screen.statusCode).toBe(200);
    expect(screen.body).toContain('<meta name="robots" content="noindex">');
    expect(screen.body).not.toContain('<div id="static">');
    const robots = await t.app.inject({ url: '/robots.txt' });
    expect(robots.statusCode).toBe(200);
    expect(robots.body).toContain('Disallow: /v1/');
    expect(robots.body).toContain('Disallow: /c/');
    expect(robots.body).toContain('Sitemap: https://caime.example/sitemap.xml');
    const sitemap = await t.app.inject({ url: '/sitemap.xml' });
    expect(sitemap.statusCode).toBe(200);
    expect(sitemap.headers['content-type']).toMatch(/^application\/xml/);
    expect(sitemap.body).toContain('<loc>https://caime.example/</loc>');
    expect(sitemap.body).toContain('<loc>https://caime.example/help</loc>');
    expect(sitemap.body).toContain('<loc>https://caime.example/o/nile.dental</loc>');
    // People are never listed: a page is found by its handle, not in a directory.
    expect(sitemap.body).not.toContain('/@noor');
  });
});
