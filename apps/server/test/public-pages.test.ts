import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
    expect(r.body).toContain('id="panel-privacy"');
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
    }
    expect((await visit('/o/noor')).statusCode).toBe(404);
    // Its logo needs no sign-in; a person's photo only when they show it to everyone.
    expect((await t.app.inject({ url: `/v1/orgs/${orgId}/avatar` })).statusCode).toBe(404);
    expect((await t.app.inject({ url: `/v1/users/${noor.user.id}/avatar` })).statusCode).toBe(404);
    expect((await t.app.inject({ url: `/v1/users/${teen.user.id}/avatar` })).statusCode).toBe(404);
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
