/**
 * Reading a conversation (M16 E3, review 2026-10-17 §7): it opens at the first unread with their
 * count on the line, the jump button counts what's below, a pill says the day while scrolling,
 * emoji alone are drawn big, a mention of the reader is marked, and the head says when the other
 * person was last here once they've gone.
 */
import { randomUUID } from 'node:crypto';
import { type BrowserContext, expect, type Page, test } from '@playwright/test';
import { apiSignUp, CLIENT, newPerson, visible } from './helpers';

const suffix = Math.random().toString(36).slice(2, 7);

test.describe
  .serial('reading a conversation (M16 E3)', () => {
    let noorCtx: BrowserContext;
    let alexCtx: BrowserContext;
    let noor: { page: Page; errors: string[] };
    let convo: string;
    let noorId: string;

    const say = async (body: string, extra: Record<string, unknown> = {}) => {
      const said = await alexCtx.request.post(`/v1/conversations/${convo}/messages`, {
        headers: CLIENT,
        data: { clientId: randomUUID(), body, ...extra },
      });
      expect(said.ok(), await said.text()).toBe(true);
    };

    test.beforeAll(async ({ browser }) => {
      noorCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      alexCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      noorId = (await apiSignUp(noorCtx, 'Noor Reads', `noor.reads.${suffix}`)).id;
      await apiSignUp(alexCtx, 'Alex Reads', `alex.reads.${suffix}`);
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
      noor = await newPerson(noorCtx);
    });

    test.afterAll(async () => {
      await noorCtx.close();
      await alexCtx.close();
    });

    test('opens at the first unread with their count, and the jump button counts what is below', async () => {
      for (let i = 1; i <= 30; i++) await say(`Line ${i} of the plan`);
      const { page } = noor;
      await page.goto(`/c/${convo}`);
      await expect(page.getByTestId('unread-line').filter({ visible: true })).toHaveText(
        '30 unread messages',
      );
      // At the first of them, not at the newest.
      await expect(visible(page, 'Line 1 of the plan')).toBeInViewport();
      await expect(visible(page, 'Line 30 of the plan')).not.toBeInViewport();
      const count = page.getByTestId('jump-count').filter({ visible: true });
      await expect(count).toHaveText('30');
      await page.getByRole('button', { name: /^Jump to the newest message/ }).click();
      await expect(visible(page, 'Line 30 of the plan')).toBeInViewport();
      await expect(page.getByTestId('jump-count')).toHaveCount(0);
      expect(noor.errors).toEqual([]);
    });

    test('scrolling says the day; emoji alone are big; a mention of the reader is marked', async () => {
      const { page } = noor;
      await say('👍');
      await say('@Noor Reads can you check the venue?', { mentions: [noorId] });
      await expect(page.getByTestId('message-big-emoji').filter({ visible: true })).toHaveText(
        /👍/,
      );
      await expect(page.getByTestId('mention-you').filter({ visible: true })).toHaveText(
        '@Noor Reads',
      );
      // Scrolled back through the plan, the pill says whose day it was.
      await visible(page, 'Line 20 of the plan').hover();
      await page.mouse.wheel(0, -600);
      await expect(page.getByTestId('date-pill').filter({ visible: true })).toHaveText('Today');
      expect(noor.errors).toEqual([]);
    });

    test('the head says when the other person was last here once they have gone', async () => {
      const alex = await newPerson(alexCtx);
      await alex.page.goto('/chats');
      const { page } = noor;
      const head = page
        .getByRole('button', { name: /Alex Reads, details/ })
        .filter({ visible: true });
      await expect(head).toContainText('Online');
      await alex.page.close();
      await expect(head).toContainText('Last seen just now', { timeout: 15_000 });
      expect(noor.errors).toEqual([]);
    });
  });
