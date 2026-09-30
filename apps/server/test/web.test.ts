import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brotliCompressSync, brotliDecompressSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './helpers';

let t: TestApp;
let dir: string;
const PAGE = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'caime-web-'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Caime</title>');
  mkdirSync(join(dir, '_expo', 'static', 'js', 'web'), { recursive: true });
  writeFileSync(join(dir, '_expo', 'static', 'js', 'entry-abc.js'), 'console.log(1)');
  writeFileSync(join(dir, '_expo', 'static', 'js', 'web', 'search-def.js'), 'console.log(2)');
  mkdirSync(join(dir, 'assets'), { recursive: true });
  writeFileSync(join(dir, 'assets', 'font-123.ttf'), 'font');
  mkdirSync(join(dir, 'fonts'), { recursive: true });
  writeFileSync(join(dir, 'fonts', 'inter-latin-400-normal.woff2'), 'woff2');
  t = await createTestApp({ WEB_DIR: dir });
});
afterAll(async () => {
  await t.close();
  rmSync(dir, { recursive: true, force: true });
});

const get = (url: string, accept = PAGE) =>
  t.app.inject({ method: 'GET', url, headers: { accept } });

describe('the web app on the API origin', () => {
  it('serves the app for any page, including handles with dots', async () => {
    // A handle nobody has is a 404 that still boots the app (R44); the rest is the app, 200.
    for (const [url, status] of [
      ['/', 200],
      ['/spaces', 200],
      ['/o/nile.dental', 404],
      ['/o/datac.io', 404],
      ['/connect?h=sara.ali', 200],
    ] as const) {
      const r = await get(url);
      expect(r.statusCode, url).toBe(status);
      expect(r.headers['content-type'], url).toMatch(/^text\/html/);
      expect(r.headers['cache-control'], url).toBe('no-cache');
      expect(r.headers['content-security-policy'], url).toContain("default-src 'self'");
    }
  });

  it('serves bundles for a year, and a missing file is a 404, never the app', async () => {
    const js = await get('/_expo/static/js/entry-abc.js', '*/*');
    expect(js.statusCode).toBe(200);
    expect(js.headers['cache-control']).toContain('immutable');
    expect(js.headers['content-encoding']).toBeUndefined();
    // A bundle compressed at build time (scripts/precompress.mjs) goes as it is to a browser
    // that takes Brotli, marked so a shared cache keeps the variants apart.
    writeFileSync(
      join(dir, '_expo', 'static', 'js', 'entry-abc.js.br'),
      brotliCompressSync(Buffer.from('console.log(1)')),
    );
    const br = await t.app.inject({
      method: 'GET',
      url: '/_expo/static/js/entry-abc.js',
      headers: { accept: '*/*', 'accept-encoding': 'br, gzip' },
    });
    expect(br.statusCode).toBe(200);
    expect(br.headers['content-encoding']).toBe('br');
    expect(br.headers.vary).toMatch(/accept-encoding/i);
    expect(br.headers['cache-control']).toContain('immutable');
    expect(brotliDecompressSync(br.rawPayload).toString()).toBe('console.log(1)');
    // The web fonts, named by face and subset, for a year too.
    const font = await get('/fonts/inter-latin-400-normal.woff2', '*/*');
    expect(font.statusCode).toBe(200);
    expect(font.headers['cache-control']).toContain('immutable');
    const missing = await get('/_expo/static/js/gone-123.js', '*/*');
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error.code).toBe('not_found');
    expect((await get('/logo.png', 'image/avif,image/webp,*/*')).statusCode).toBe(404);
  });

  it('lists what the build is made of, for the app to be kept for offline', async () => {
    const r = await get('/app-files.json', 'application/json');
    expect(r.statusCode).toBe(200);
    expect(r.headers['cache-control']).toBe('no-cache');
    // Its scripts, and its fonts and images.
    expect(r.json()).toEqual({
      files: [
        '/_expo/static/js/entry-abc.js',
        '/_expo/static/js/web/search-def.js',
        '/assets/font-123.ttf',
        '/fonts/inter-latin-400-normal.woff2',
      ],
    });
  });

  it('keeps the API answering in JSON', async () => {
    const r = await get('/v1/nothing-here');
    expect(r.statusCode).toBe(404);
    expect(r.json().error.code).toBe('not_found');
  });
});
