/**
 * Reading a conversation (M16 E3, review 2026-10-17 §7): it opens at the first unread with their
 * count on the line, the jump button counts what's below, a pill says the day while scrolling,
 * emoji alone are drawn big, a mention of the reader is marked, and the head says when the other
 * person was last here once they've gone. A conversation marked unread keeps a dot until it's
 * opened, and a group's message answered privately is quoted in the chat and leads back (E3b).
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
    let alexId: string;

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
      alexId = (await apiSignUp(alexCtx, 'Alex Reads', `alex.reads.${suffix}`)).id;
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
      // At the first of them, not at the newest. The newest is the bubble, the last of its words
      // on the page: on a desktop the Chats row beside the conversation says them too.
      const newest = page.getByText('Line 30 of the plan').filter({ visible: true }).last();
      await expect(visible(page, 'Line 1 of the plan')).toBeInViewport();
      await expect(newest).not.toBeInViewport();
      const count = page.getByTestId('jump-count').filter({ visible: true });
      await expect(count).toHaveText('30');
      await page.getByRole('button', { name: /^Jump to the newest message/ }).click();
      await expect(newest).toBeInViewport();
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

    test('marked unread in Chats keeps a dot until the conversation is opened', async () => {
      const { page } = noor;
      // Read to its end first (scrolled back for the pill, the last two never came into view),
      // so the row offers to mark it unread.
      const read = await noorCtx.request.post(`/v1/conversations/${convo}/receipts`, {
        headers: CLIENT,
        data: { read: 1_000_000 },
      });
      expect(read.ok(), await read.text()).toBe(true);
      await page.goto('/chats');
      const row = page.getByTestId(`conversation-${convo}`).filter({ visible: true });
      await row.click({ delay: 700 });
      await page.getByTestId('row-unread').click();
      await expect(row.getByTestId('badge-dot')).toBeVisible();
      // Opening it is coming back to it: the mark goes, on the server too.
      const unmarked = page.waitForResponse(
        (r) => r.url().endsWith(`/v1/conversations/${convo}`) && r.request().method() === 'PATCH',
      );
      await row.click();
      await expect(page.getByTestId('composer-input').filter({ visible: true })).toBeVisible();
      await unmarked;
      await page.goto('/chats');
      await expect(
        page
          .getByTestId(`conversation-${convo}`)
          .filter({ visible: true })
          .getByTestId('badge-dot'),
      ).toHaveCount(0);
      expect(noor.errors).toEqual([]);
    });

    test('a group’s message answered privately is quoted in the chat, and leads back to it', async () => {
      const made = await noorCtx.request.post('/v1/conversations', {
        headers: CLIENT,
        data: { kind: 'group', title: `Cake ${suffix}`, memberIds: [alexId] },
      });
      expect(made.ok(), await made.text()).toBe(true);
      const group = ((await made.json()) as { conversation: { id: string } }).conversation.id;
      const said = await alexCtx.request.post(`/v1/conversations/${group}/messages`, {
        headers: CLIENT,
        data: { clientId: randomUUID(), body: 'Who brings the cake?' },
      });
      expect(said.ok(), await said.text()).toBe(true);
      const { page } = noor;
      await page.goto(`/c/${group}`);
      // The bubble, whose name goes on to its time; the Chats row beside it says the words too.
      await page
        .getByLabel(/Who brings the cake\?, \d/)
        .filter({ visible: true })
        .hover();
      await page.getByRole('button', { name: 'React', exact: true }).click();
      await page.getByTestId('message-reply-privately').click();
      await expect(page).toHaveURL(new RegExp(`/c/${convo}`));
      await expect(
        visible(page, `Replying privately to Alex Reads in Cake ${suffix}`),
      ).toBeVisible();
      await page.getByTestId('composer-input').fill('I will, quietly');
      await page.getByTestId('composer-send').click();
      const quote = page.getByTestId('message-private-quote').filter({ visible: true }).last();
      await expect(quote).toContainText('Who brings the cake?');
      await expect(quote).toContainText(`Cake ${suffix}`);
      await quote.click();
      await expect(page).toHaveURL(new RegExp(`/c/${group}`));
      await expect(page.getByTestId('message-highlighted').filter({ visible: true })).toContainText(
        'Who brings the cake?',
      );
      expect(noor.errors).toEqual([]);
    });

    test('the head says when the other person was last here once they have gone', async () => {
      const alex = await newPerson(alexCtx);
      await alex.page.goto('/chats');
      // The chat with Alex (the last test ended in the group).
      const { page } = noor;
      await page.goto(`/c/${convo}`);
      const head = page
        .getByRole('button', { name: /Alex Reads, details/ })
        .filter({ visible: true });
      await expect(head).toContainText('Online');
      await alex.page.close();
      await expect(head).toContainText('Last seen just now', { timeout: 15_000 });
      expect(noor.errors).toEqual([]);
    });
  });
