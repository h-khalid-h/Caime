/**
 * Caime where people already look (R120): the installed web app's manifest in the language of
 * whoever installs it, with one window, its shortcuts and its share target, and the stores only
 * once they list Caime (a store's link comes from the configuration alone and is null before);
 * and where people use Caime, said by the app once a launch and counted by product metrics.
 */
import { APP_IDS } from '@caime/core/api';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { productMetrics } from '../src/lib/product-metrics';
import { storeLinks } from '../src/lib/stores';
import { createTestApp, signup, type TestApp } from './helpers';

let plain: TestApp;
let listed: TestApp;

beforeAll(async () => {
  plain = await createTestApp({ PUBLIC_URL: 'https://caime.example' });
  listed = await createTestApp({
    PUBLIC_URL: 'https://caime.example',
    APPLE_APP_ID: '6740012345',
    PLAY_LISTED: 'true',
    MICROSOFT_STORE_ID: '9NCAIME00001',
  });
});
afterAll(async () => {
  await plain.close();
  await listed.close();
});

const manifest = (t: TestApp, headers: Record<string, string> = {}) =>
  t.app.inject({ method: 'GET', url: '/manifest.webmanifest', headers });

describe('the installed web app (R120)', () => {
  it('is one window with shortcuts and a share target, in the installer’s language', async () => {
    const res = await manifest(plain, { 'accept-language': 'en-GB,en;q=0.9' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/^application\/manifest\+json/);
    expect(res.headers.vary).toMatch(/Accept-Language/);
    const m = res.json();
    expect(m).toMatchObject({
      id: '/',
      name: 'Caime',
      lang: 'en',
      dir: 'ltr',
      display: 'standalone',
      start_url: '/',
      launch_handler: { client_mode: ['focus-existing', 'auto'] },
      share_target: {
        action: '/share',
        method: 'GET',
        params: { title: 'title', text: 'text', url: 'url' },
      },
    });
    expect(m.shortcuts.map((s: { url: string }) => s.url)).toEqual([
      '/chats',
      '/search',
      '/actions',
    ]);
    expect(m.icons.some((i: { purpose: string }) => i.purpose === 'maskable')).toBe(true);
    // Nothing listed yet: no store is named.
    expect(m.related_applications).toBeUndefined();

    const ar = (await manifest(plain, { 'accept-language': 'ar-EG,ar;q=0.9' })).json();
    expect(ar).toMatchObject({ lang: 'ar', dir: 'rtl' });
    expect(ar.description).not.toBe(m.description);
    expect(ar.shortcuts[0].name).not.toBe(m.shortcuts[0].name);
    // `?lang=` wins over the browser's.
    expect((await plain.app.inject({ url: '/manifest.webmanifest?lang=fr' })).json().lang).toBe(
      'fr',
    );
  });

  it('names the phone apps once the stores list them, and links nothing before', async () => {
    const m = (await manifest(listed)).json();
    expect(m.related_applications).toEqual([
      {
        platform: 'play',
        url: `https://play.google.com/store/apps/details?id=${APP_IDS.android}`,
        id: APP_IDS.android,
      },
      { platform: 'itunes', url: 'https://apps.apple.com/app/id6740012345', id: 'id6740012345' },
    ]);
    expect(m.prefer_related_applications).toBe(false);
    expect(storeLinks(listed.ctx.config)).toEqual({
      appStore: 'https://apps.apple.com/app/id6740012345',
      googlePlay: `https://play.google.com/store/apps/details?id=${APP_IDS.android}`,
      microsoftStore: 'https://apps.microsoft.com/detail/9NCAIME00001',
      desktop: null,
    });
    expect(storeLinks(plain.ctx.config)).toEqual({
      appStore: null,
      googlePlay: null,
      microsoftStore: null,
      desktop: null,
    });
    await expect(createTestApp({ APPLE_APP_ID: 'not-a-number' })).rejects.toThrow();
  });
});

describe('where people use Caime (R120)', () => {
  it('the app says it once a launch; the window’s people are counted by it', async () => {
    const ines = await signup(plain, { displayName: 'Ines Browser' });
    const omar = await signup(plain, { displayName: 'Omar Installed' });
    const sara = await signup(plain, { displayName: 'Sara Phone' });
    await ines.put('/v1/auth/sessions/current/surface', { surface: 'browser' });
    await omar.put('/v1/auth/sessions/current/surface', { surface: 'installed' });
    await sara.put('/v1/auth/sessions/current/surface', { surface: 'ios' });
    // Said again, the same: nothing written.
    await sara.put('/v1/auth/sessions/current/surface', { surface: 'ios' });
    const said = await plain.ctx.db
      .selectFrom('sessions')
      .select(['user_id', 'surface'])
      .where('user_id', 'in', [ines.user.id, omar.user.id, sara.user.id])
      .execute();
    expect(Object.fromEntries(said.map((r) => [r.user_id, r.surface]))).toEqual({
      [ines.user.id]: 'browser',
      [omar.user.id]: 'installed',
      [sara.user.id]: 'ios',
    });
    // A session's last sight takes the database's clock: the window ends at it, now.
    plain.clock.set(new Date(Date.now() + 1000).toISOString());
    const { surfaces } = (await productMetrics(plain.ctx, 7)).growth;
    expect(surfaces.people).toMatchObject({
      browser: 1,
      installed: 1,
      ios: 1,
      desktop: 0,
      android: 0,
    });
    // Two of the three on an app installed on the device.
    expect(surfaces.installed).toMatchObject({ count: 2, of: 3 });
    // Anything but a surface Caime knows is refused.
    const odd = await ines.req('PUT', '/v1/auth/sessions/current/surface', { surface: 'toaster' });
    expect(odd.statusCode).toBe(400);
  });
});
