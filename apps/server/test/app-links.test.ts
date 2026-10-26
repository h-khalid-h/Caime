/**
 * The phone apps' claim on the domain (R35): Apple's and Android's files from the configuration
 * alone, JSON on every name, the links' paths from core's one list, and nothing under
 * `/.well-known/` ever served as the app's page, configured or not.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { APP_IDS, APP_LINK_PREFIXES } from '@caime/core/api';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './helpers';

const PAGE = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';
const PRINT = Array.from({ length: 32 }, (_, i) => (i * 7).toString(16).padStart(2, '0')).join(':');
let dir: string;
let claimed: TestApp;
let plain: TestApp;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'caime-links-'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Caime</title>');
  claimed = await createTestApp({
    WEB_DIR: dir,
    PUBLIC_URL: 'https://caime.example',
    APPLE_TEAM_ID: 'AB12CD34EF',
    APPLE_APP_ID: '6740012345',
    ANDROID_CERT_SHA256: ` ${PRINT.toLowerCase()} , ${PRINT.replace(/^00/, 'ff')}`,
  });
  plain = await createTestApp({ WEB_DIR: dir, PUBLIC_URL: 'https://caime.example' });
});
afterAll(async () => {
  await claimed.close();
  await plain.close();
  rmSync(dir, { recursive: true, force: true });
});

const get = (t: TestApp, url: string, accept = '*/*', host = 'caime.example') =>
  t.app.inject({ method: 'GET', url, headers: { accept, host } });

describe('the phone apps’ links (R35)', () => {
  it('Apple’s file names the app, opens its paths in it, and lets it use the passkeys made here', async () => {
    const res = await get(claimed, '/.well-known/apple-app-site-association');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.headers['cache-control']).toBe('public, max-age=3600');
    const app = `AB12CD34EF.${APP_IDS.ios}`;
    expect(res.json()).toEqual({
      applinks: {
        details: [{ appIDs: [app], components: APP_LINK_PREFIXES.map((p) => ({ '/': `${p}*` })) }],
      },
      webcredentials: { apps: [app] },
    });
  });

  it('Android’s names the package and every signing certificate, upper case', async () => {
    const res = await get(claimed, '/.well-known/assetlinks.json');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([
      {
        relation: [
          'delegate_permission/common.handle_all_urls',
          'delegate_permission/common.get_login_creds',
        ],
        target: {
          namespace: 'android_app',
          package_name: APP_IDS.android,
          sha256_cert_fingerprints: [PRINT.toUpperCase(), PRINT.replace(/^00/, 'FF').toUpperCase()],
        },
      },
    ]);
  });

  it('answer on any name the service has, never sent to the canonical one', async () => {
    const res = await get(claimed, '/.well-known/assetlinks.json', '*/*', 'caime.datac.example');
    expect(res.statusCode).toBe(200);
  });

  it('are missing, not the app’s page, until the ids are set; so is anything else there', async () => {
    for (const url of [
      '/.well-known/apple-app-site-association',
      '/.well-known/assetlinks.json',
      '/.well-known/nothing-here',
    ])
      for (const accept of ['*/*', PAGE]) {
        const res = await get(plain, url, accept);
        expect(res.statusCode, `${url} ${accept}`).toBe(404);
        expect(res.headers['content-type']).toContain('application/json');
      }
    // A page of the app still is one.
    expect((await get(plain, '/@noor', PAGE)).headers['content-type']).toContain('text/html');
  });

  it('refuse a malformed team id or fingerprint at start rather than claim wrongly', async () => {
    await expect(createTestApp({ APPLE_TEAM_ID: 'too-short' })).rejects.toThrow();
    await expect(createTestApp({ ANDROID_CERT_SHA256: 'AB:CD' })).rejects.toThrow();
  });
});

describe('the App Store’s banner (R120)', () => {
  it('is on every page once the App Store lists Caime, and nowhere before', async () => {
    const listed = await claimed.app.inject({ url: '/', headers: { accept: PAGE } });
    expect(listed.body).toContain('<meta name="apple-itunes-app" content="app-id=6740012345">');
    const before = await plain.app.inject({ url: '/', headers: { accept: PAGE } });
    expect(before.body).not.toContain('apple-itunes-app');
  });
});
