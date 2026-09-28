import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config';
import { type PageFacts, renderPage } from '../src/lib/pages';
import { createTestApp } from './helpers';

const BASE = 'http://localhost:8787';
/** A page's words, however its lines wrap. */
const read = (html: string) => html.replace(/\s+/g, ' ');

describe('About, and Caime’s own privacy, terms and help pages', () => {
  it('serves each page to anyone, as a page with nothing but itself in it', async () => {
    const t = await createTestApp();
    try {
      const about = await t.app.inject({ method: 'GET', url: '/v1/about' });
      expect(about.json()).toEqual({
        privacyUrl: `${BASE}/privacy`,
        termsUrl: `${BASE}/terms`,
        helpUrl: `${BASE}/help`,
      });
      const pages = {
        privacy: [
          '<h1>Privacy</h1>',
          'Caime is for people 13 and older, from the day they turn 13',
          // A handle let go of is held (lib/handles.ts), and the page says for how long.
          'A handle you stop using, by changing it or deleting your account, is kept from everyone for a year, you included',
          'What stays: your handle, kept from everyone for a year (the handle and the days alone, never that it was yours)',
        ],
        terms: ['<h1>Terms</h1>', 'You need to be 13 or older'],
        help: ['<h1>Help</h1>', `${BASE}/@<em>yourhandle</em>`],
      };
      for (const [name, says] of Object.entries(pages)) {
        const res = await t.app.inject({ method: 'GET', url: `/${name}` });
        expect(res.statusCode, name).toBe(200);
        expect(res.headers['content-type']).toBe('text/html; charset=utf-8');
        // Nothing runs, nothing is loaded from anywhere, and it's never framed.
        expect(res.headers['content-security-policy']).toBe(
          "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
        );
        expect(res.headers['x-content-type-options']).toBe('nosniff');
        for (const s of [...says, 'DATA C OÜ', 'href="mailto:hello@cai.me"'])
          expect(read(res.body), `${name}: ${s}`).toContain(s);
        expect(res.body).toContain(`<a href="/${name}" aria-current="page">`);
        if (name === 'privacy')
          expect(read(res.body)).toContain(
            'a public server that tells a device its own (Google&rsquo;s).',
          );
        expect(res.body).not.toMatch(/<script|<iframe|\son[a-z]+=/i);
        expect((await t.app.inject({ method: 'HEAD', url: `/${name}` })).statusCode).toBe(200);
      }
    } finally {
      await t.close();
    }
  });

  it('says who runs it, how to reach them and from what age, as the environment says', async () => {
    const t = await createTestApp({
      LEGAL_NAME: 'Nile & Sons <Ltd>',
      CONTACT_EMAIL: 'privacy@nile.example',
      MINIMUM_AGE: '16',
    });
    try {
      const privacy = read((await t.app.inject({ method: 'GET', url: '/privacy' })).body);
      expect(privacy).toContain(
        'Caime is run by Nile &amp; Sons &lt;Ltd&gt;, which is responsible',
      );
      expect(privacy).not.toContain('<Ltd>');
      expect(privacy).toContain('href="mailto:privacy@nile.example"');
      expect(privacy).toContain('Caime is for people 16 and older, from the day they turn 16');
      expect(privacy).not.toContain('DATA C');
      const terms = read((await t.app.inject({ method: 'GET', url: '/terms' })).body);
      expect(terms).toContain('between you and Nile &amp; Sons &lt;Ltd&gt; (&ldquo;we&rdquo;)');
      expect(terms).toContain('You need to be 16 or older');
    } finally {
      await t.close();
    }
  });

  it('says how calls connect and how long records are kept, as this Caime does', async () => {
    const facts: PageFacts = {
      legalName: 'Nile',
      contactEmail: 'hi@nile.example',
      minimumAge: 13,
      publicUrl: BASE,
      stun: 'google',
      relay: false,
    };
    const privacy = (over: Partial<PageFacts>) =>
      read(renderPage('privacy', { ...facts, ...over }));
    expect(privacy({})).toContain('a public server that tells a device its own (Google&rsquo;s).');
    expect(privacy({})).not.toContain('relay');
    expect(privacy({ stun: 'other' })).toContain('a public server that tells a device its own.');
    expect(privacy({ stun: 'none' })).not.toContain('public server');
    expect(privacy({ relay: true })).toContain('the call goes through Caime&rsquo;s relay instead');
    expect(privacy({})).toContain(
      'Security records are kept for a year, and a device&rsquo;s sign-in for 30 days after it ended.',
    );
    const t = await createTestApp({
      STUN_URLS: 'stun:stun.nile.example:3478',
      TURN_URLS: 'turn:turn.nile.example:3478',
      TURN_SECRET: 'a-secret-long-enough',
    });
    try {
      const page = read((await t.app.inject({ method: 'GET', url: '/privacy' })).body);
      expect(page).toContain('a public server that tells a device its own.');
      expect(page).toContain('the call goes through Caime&rsquo;s relay instead');
    } finally {
      await t.close();
    }
  });

  it('sends people to a page published somewhere else, and About links there too', async () => {
    const t = await createTestApp({
      PRIVACY_URL: 'https://policies.example/privacy',
      HELP_URL: 'https://help.example/caime',
      // Set to its own page, it's still the page, never a loop.
      TERMS_URL: `${BASE}/terms`,
    });
    try {
      expect((await t.app.inject({ method: 'GET', url: '/v1/about' })).json()).toEqual({
        privacyUrl: 'https://policies.example/privacy',
        termsUrl: `${BASE}/terms`,
        helpUrl: 'https://help.example/caime',
      });
      const privacy = await t.app.inject({ method: 'GET', url: '/privacy' });
      expect(privacy.statusCode).toBe(302);
      expect(privacy.headers.location).toBe('https://policies.example/privacy');
      expect((await t.app.inject({ method: 'GET', url: '/help' })).headers.location).toBe(
        'https://help.example/caime',
      );
      const terms = await t.app.inject({ method: 'GET', url: '/terms' });
      expect(terms.statusCode).toBe(200);
      expect(terms.body).toContain('<h1>Terms</h1>');
    } finally {
      await t.close();
    }
  });

  it('is the page however it’s spelled, and never sends people round in a loop', async () => {
    const t = await createTestApp({
      // This very page, written another way: a query, another scheme, a slash at the end.
      TERMS_URL: 'https://localhost/terms/?lang=en',
      PRIVACY_URL: 'https://policies.example/privacy',
    });
    try {
      const terms = await t.app.inject({ method: 'GET', url: '/terms?lang=en' });
      expect(terms.statusCode).toBe(200);
      expect(terms.body).toContain('<h1>Terms</h1>');
      for (const [url, to] of [
        ['/terms/', '/terms'],
        ['/Help', '/help'],
        ['/PRIVACY/?x=1', '/privacy'],
      ]) {
        const res = await t.app.inject({ method: 'GET', url });
        expect(res.statusCode, url).toBe(301);
        expect(res.headers.location, url).toBe(to);
      }
      // Anything else unknown is still unknown.
      expect((await t.app.inject({ method: 'GET', url: '/helpers' })).statusCode).toBe(404);
      expect((await t.app.inject({ method: 'POST', url: '/help/' })).statusCode).toBe(404);
      // Behind a proxy that doesn't pass on the address people used, it's still this page.
      const proxied = await t.app.inject({
        method: 'GET',
        url: '/terms',
        headers: { host: '127.0.0.1:3000' },
      });
      expect(proxied.statusCode).toBe(200);
    } finally {
      await t.close();
    }
  });

  it('serves pages set to each other here, and sends a page set to one that goes on to it', async () => {
    const t = await createTestApp({
      // Each other's: sending people on would send them round for ever.
      PRIVACY_URL: `${BASE}/terms`,
      TERMS_URL: `${BASE}/privacy`,
      // On to a page that's published elsewhere: there, through it.
      HELP_URL: `${BASE}/Privacy/`,
    });
    try {
      for (const name of ['privacy', 'terms']) {
        const res = await t.app.inject({ method: 'GET', url: `/${name}` });
        expect(res.statusCode, name).toBe(200);
      }
      const help = await t.app.inject({ method: 'GET', url: '/help' });
      expect(help.statusCode).toBe(302);
      expect(help.headers.location).toBe(`${BASE}/Privacy/`);
    } finally {
      await t.close();
    }
    const chain = await createTestApp({
      PRIVACY_URL: `${BASE}/terms`,
      TERMS_URL: 'https://policies.example/terms',
    });
    try {
      const privacy = await chain.app.inject({ method: 'GET', url: '/privacy' });
      expect(privacy.statusCode).toBe(302);
      expect(privacy.headers.location).toBe(`${BASE}/terms`);
      expect((await chain.app.inject({ method: 'GET', url: '/terms' })).headers.location).toBe(
        'https://policies.example/terms',
      );
    } finally {
      await chain.close();
    }
  });

  it('takes only an http(s) address for each, a name, and an email address', () => {
    const env = { DATABASE_URL: 'postgres://caime@localhost/caime', PUBLIC_URL: `${BASE}/` };
    expect(loadConfig(env).aboutLinks).toEqual({
      privacyUrl: `${BASE}/privacy`,
      termsUrl: `${BASE}/terms`,
      helpUrl: `${BASE}/help`,
    });
    for (const TERMS_URL of ['javascript:alert(1)', '/terms', 'cai.me/terms'])
      expect(() => loadConfig({ ...env, TERMS_URL }), TERMS_URL).toThrow(/TERMS_URL/);
    expect(() => loadConfig({ ...env, LEGAL_NAME: '  ' })).toThrow(/LEGAL_NAME/);
    expect(() => loadConfig({ ...env, CONTACT_EMAIL: 'hello' })).toThrow(/CONTACT_EMAIL/);
  });
});
