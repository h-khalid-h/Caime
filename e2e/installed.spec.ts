/**
 * Caime where people already look (R120, ROADMAP M19): the installed web app counts what needs
 * you on its icon and says where it runs, what another app shares lands in the conversation chosen
 * and is sent only by the tap, the manifest is written in the installer's language, and the page
 * for getting Caime leads with the way that works on the device it's read on.
 */
import { randomUUID } from 'node:crypto';
import { type BrowserContext, expect, type Page, test } from '@playwright/test';
import { apiSignUp, CLIENT, newPerson, visible } from './helpers';

const suffix = Math.random().toString(36).slice(2, 7);

test.describe
  .serial('Caime as an app (R120)', () => {
    let noorCtx: BrowserContext;
    let alexCtx: BrowserContext;
    let noor: { page: Page; errors: string[] };
    let convo: string;

    test.beforeAll(async ({ browser }) => {
      noorCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      alexCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const noorId = (await apiSignUp(noorCtx, 'Noor Installed', `noor.installed.${suffix}`)).id;
      await apiSignUp(alexCtx, 'Alex Installed', `alex.installed.${suffix}`);
      const asked = await alexCtx.request.post('/v1/connections/requests', {
        headers: CLIENT,
        data: { toUserId: noorId, relationship: { sphere: 'friend' } },
      });
      const { requestId } = (await asked.json()) as { requestId: string };
      const accepted = await noorCtx.request.post(`/v1/connections/requests/${requestId}/accept`, {
        headers: CLIENT,
        data: {},
      });
      convo = ((await accepted.json()) as { conversationId: string }).conversationId;
      // A friend's question: it needs Noor.
      const said = await alexCtx.request.post(`/v1/conversations/${convo}/messages`, {
        headers: CLIENT,
        data: { clientId: randomUUID(), body: 'Are you coming to the lantern market tonight?' },
      });
      expect(said.ok()).toBe(true);
      // The browser's Badging API, as an installed app has it, recorded.
      await noorCtx.addInitScript(() => {
        const w = window as unknown as { __badges: number[] };
        w.__badges = [];
        const nav = navigator as unknown as Record<string, unknown>;
        nav.setAppBadge = (n?: number) => {
          w.__badges.push(n ?? 0);
          return Promise.resolve();
        };
        nav.clearAppBadge = () => {
          w.__badges.push(0);
          return Promise.resolve();
        };
      });
      noor = await newPerson(noorCtx);
    });

    test.afterAll(async () => {
      await noorCtx.close();
      await alexCtx.close();
    });

    test('what needs you is counted on the icon, and the app says where it runs', async () => {
      const { page, errors } = noor;
      const told = page.waitForRequest(
        (r) => r.url().endsWith('/v1/auth/sessions/current/surface') && r.method() === 'PUT',
      );
      await page.goto('/');
      expect((await told).postDataJSON()).toEqual({ surface: 'browser' });
      await expect
        .poll(() =>
          page.evaluate(() => (window as unknown as { __badges: number[] }).__badges.at(-1)),
        )
        .toBe(1);
      expect(errors).toEqual([]);
    });

    test('what another app shares goes to the conversation chosen, on the tap', async () => {
      const { page, errors } = noor;
      const link = 'https://example.com/lantern-market';
      await page.goto(
        `/share?title=${encodeURIComponent('Lantern market')}&text=${encodeURIComponent(
          `Opens at eight ${link}`,
        )}&url=${encodeURIComponent(link)}`,
      );
      const sheet = page.getByTestId('share-find');
      await expect(sheet).toBeVisible();
      await page.getByTestId('share-to').filter({ hasText: 'Alex Installed' }).click();
      const sent = page.waitForResponse(
        (r) =>
          r.url().endsWith(`/v1/conversations/${convo}/messages`) &&
          r.request().method() === 'POST',
      );
      await page.getByTestId('share-send').click();
      expect((await sent).ok()).toBe(true);
      // Back where Caime starts; the words are in the conversation, the title once and the link once.
      await expect(page).toHaveURL(/\/$/);
      await page.goto(`/c/${convo}`);
      await expect(visible(page, `Opens at eight ${link}`)).toBeVisible();
      await expect(visible(page, 'Lantern market')).toBeVisible();
      expect(errors).toEqual([]);
    });

    test('the manifest speaks the installer’s language; the page for getting Caime fits the device', async () => {
      const ar = (await (
        await noorCtx.request.get('/manifest.webmanifest', { headers: { 'accept-language': 'ar' } })
      ).json()) as { lang: string; dir: string; share_target: { action: string } };
      expect(ar).toMatchObject({ lang: 'ar', dir: 'rtl', share_target: { action: '/share' } });
      const { page } = noor;
      await page.goto('/download');
      await expect(page.getByRole('heading', { name: 'Caime, wherever you are.' })).toBeVisible();
      // A Windows browser (the desktop project's): the browser's own install leads, no store yet.
      await expect(
        page.getByText('In Edge or Chrome, choose Install Caime in the address bar').first(),
      ).toBeVisible();
      await expect(
        page.locator('a[href*="apps.apple.com"], a[href*="play.google.com"]'),
      ).toHaveCount(0);
    });
  });
