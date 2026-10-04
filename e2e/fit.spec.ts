/**
 * The app fits: a 320-px phone and a desktop at 200% zoom (640 CSS pixels) show the main
 * screens without a horizontal scroll, and the dark scheme draws them too (REVIEW-2026-10, P2).
 */
import { expect, test } from '@playwright/test';
import { apiSignUp, CLIENT, newPerson, visible } from './helpers';

const suffix = Math.random().toString(36).slice(2, 7);

/** Nothing wider than the window: a horizontal scroll on a phone is a layout that broke. */
const overflow = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const d = document.documentElement;
    return Math.max(0, d.scrollWidth - d.clientWidth);
  });

test.describe
  .serial('the app fits (320 px, 200%, dark)', () => {
    let conversation = '';

    test('a 320-px phone shows Chats, a conversation, People and Settings without a sideways scroll', async ({
      browser,
    }) => {
      const narrow = await browser.newContext({ viewport: { width: 320, height: 568 } });
      const me = await apiSignUp(narrow, 'Fit Tester', `fit.${suffix}`);
      const other = await browser.newContext({ viewport: { width: 320, height: 568 } });
      const them = await apiSignUp(other, 'Other Fit', `fit.other.${suffix}`);
      // Connected, with a message each way, so the conversation and the lists have content.
      const asked = await other.request.post('/v1/connections/requests', {
        headers: CLIENT,
        data: { toUserId: me.id },
      });
      expect(asked.ok(), await asked.text()).toBe(true);
      const { requestId } = (await asked.json()) as { requestId: string };
      const accepted = await narrow.request.post(`/v1/connections/requests/${requestId}/accept`, {
        headers: CLIENT,
        data: {},
      });
      expect(accepted.ok(), await accepted.text()).toBe(true);
      conversation = ((await accepted.json()) as { conversationId: string }).conversationId;
      for (const [ctx, body] of [
        [
          other,
          'A long first line that has to wrap on a narrow phone, with a link https://example.com/somewhere/long',
        ],
        [narrow, 'Short.'],
      ] as const) {
        const sent = await ctx.request.post(`/v1/conversations/${conversation}/messages`, {
          headers: CLIENT,
          data: { clientId: crypto.randomUUID(), kind: 'text', body },
        });
        expect(sent.ok(), await sent.text()).toBe(true);
      }
      const { page, errors } = await newPerson(narrow);
      for (const path of ['/', `/c/${conversation}`, '/people', '/actions', '/settings']) {
        await page.goto(path);
        await page.waitForLoadState('networkidle');
        expect(await overflow(page), path).toBe(0);
      }
      await page.goto(`/c/${conversation}`);
      await expect(visible(page, 'Short.')).toBeVisible();
      await page.screenshot({
        path: 'e2e/screenshots/phone-320-conversation.png',
        animations: 'disabled',
      });
      expect(errors).toEqual([]);
      await other.close();
      await narrow.close();
      void them;
    });

    test('a desktop at 200% zoom (640 CSS px) and the dark scheme', async ({ browser }) => {
      const zoomed = await browser.newContext({
        viewport: { width: 640, height: 480 },
        deviceScaleFactor: 2,
        colorScheme: 'dark',
      });
      await apiSignUp(zoomed, 'Zoom Tester', `fit.zoom.${suffix}`);
      const { page, errors } = await newPerson(zoomed);
      for (const path of ['/', '/people', '/settings', '/settings/notifications']) {
        await page.goto(path);
        await page.waitForLoadState('networkidle');
        expect(await overflow(page), path).toBe(0);
      }
      await page.goto('/');
      await expect(visible(page, 'Chats')).toBeVisible();
      // Dark: the app's root paints dark, not the light default.
      const bg = await page.evaluate(() => {
        const root = document.querySelector('#root > div') as HTMLElement | null;
        return root
          ? getComputedStyle(root).backgroundColor
          : getComputedStyle(document.body).backgroundColor;
      });
      const [r, g, b] = bg.match(/\d+/g)?.map(Number) ?? [255, 255, 255];
      expect((r ?? 255) + (g ?? 255) + (b ?? 255)).toBeLessThan(200);
      await page.screenshot({ path: 'e2e/screenshots/dark-640-chats.png', animations: 'disabled' });
      expect(errors).toEqual([]);
      await zoomed.close();
    });
  });
