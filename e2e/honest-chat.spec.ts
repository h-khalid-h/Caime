/**
 * A chat that says what's true (M16 E1, review 2026-10-17 §7): a delete waits for its Undo, and
 * Undo puts the message back as it was, with nothing sent; once the Undo has passed, the other
 * side sees it deleted. A first load that fails says so, with Try again, never "nothing needs
 * you", the first-run screen or "the beginning of your conversation".
 *
 * Replies and reactions (M16 E2): a quoted reply names whom it quotes and a tap goes to it; who
 * reacted is named; a message of one's own in a group says who has read it.
 */
import { randomUUID } from 'node:crypto';
import { type BrowserContext, expect, type Page, test } from '@playwright/test';
import { apiSignUp, CLIENT, newPerson, visible } from './helpers';

const suffix = Math.random().toString(36).slice(2, 7);
const INBOX = /\/v1\/inbox\?view=all/;

test.describe
  .serial('a chat that says what is true (M16 E1)', () => {
    let noorCtx: BrowserContext;
    let alexCtx: BrowserContext;
    let noor: { page: Page; errors: string[] };
    let alex: { page: Page; errors: string[] };
    let convo: string;
    let alexId: string;

    test.beforeAll(async ({ browser }) => {
      noorCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      alexCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const n = await apiSignUp(noorCtx, 'Noor Honest', `noor.honest.${suffix}`);
      alexId = (await apiSignUp(alexCtx, 'Alex Honest', `alex.honest.${suffix}`)).id;
      const asked = await alexCtx.request.post('/v1/connections/requests', {
        headers: CLIENT,
        data: { toUserId: n.id, relationship: { sphere: 'friend' } },
      });
      const { requestId } = (await asked.json()) as { requestId: string };
      const accepted = await noorCtx.request.post(`/v1/connections/requests/${requestId}/accept`, {
        headers: CLIENT,
        data: {},
      });
      convo = ((await accepted.json()) as { conversationId: string }).conversationId;
      noor = await newPerson(noorCtx);
      alex = await newPerson(alexCtx);
    });

    test.afterAll(async () => {
      await noorCtx.close();
      await alexCtx.close();
    });

    test('a delete waits for its Undo; Undo puts it back, and past it the other side sees it gone', async () => {
      const { page } = noor;
      await page.goto(`/c/${convo}`);
      await page.getByTestId('composer-input').fill('The door code is 4417');
      await page.getByTestId('composer-send').click();
      const bubble = page
        .getByLabel(/The door code is 4417, .*(Sent|Delivered|Read)$/)
        .filter({ visible: true });
      await expect(bubble).toBeVisible();
      await alex.page.goto(`/c/${convo}`);
      await expect(visible(alex.page, 'The door code is 4417')).toBeVisible();

      // Deleted for everyone: gone here at once, with Undo; nothing is sent yet.
      const deleteForEveryone = async () => {
        await bubble.hover();
        await page.getByRole('button', { name: 'React', exact: true }).click();
        await page.getByTestId('message-delete-everyone').click();
        await expect(visible(page, 'Deleted for everyone')).toBeVisible();
      };
      await deleteForEveryone();
      // Gone from the conversation and from its row in Chats, while Undo is still offered.
      await expect(bubble).toHaveCount(0);
      await expect(page.getByText('The door code is 4417').filter({ visible: true })).toHaveCount(
        0,
        { timeout: 3000 },
      );
      await page.getByRole('button', { name: 'Undo' }).filter({ visible: true }).click();
      await expect(visible(page, 'The door code is 4417')).toBeVisible();
      // Past the Undo's time, the server still has it as written: Undo sent nothing.
      await new Promise((r) => setTimeout(r, 7000));
      const kept = await alexCtx.request.get(`/v1/conversations/${convo}/messages`, {
        headers: CLIENT,
      });
      expect(JSON.stringify(await kept.json())).toContain('The door code is 4417');
      await expect(visible(alex.page, 'The door code is 4417')).toBeVisible();

      // Deleted again and let be: once the Undo has passed, Alex sees it deleted.
      await deleteForEveryone();
      await expect(visible(alex.page, 'Message deleted')).toBeVisible({ timeout: 15_000 });
      await expect(
        alex.page.getByText('The door code is 4417').filter({ visible: true }),
      ).toHaveCount(0);
      expect(noor.errors).toEqual([]);
      expect(alex.errors).toEqual([]);
    });

    test('a first load that fails says so, and Try again brings the day', async () => {
      // A fresh launch, nothing kept from before (the cache would show the last inbox instead).
      const page = await noorCtx.newPage();
      await page.addInitScript(() => localStorage.removeItem('caime.cache.v1'));
      await page.route(INBOX, (route) =>
        route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({
            error: { code: 'internal', message: 'Caime is busy right now.' },
          }),
        }),
      );
      await page.goto('/');
      const failed = page.getByTestId('home-load-failed').filter({ visible: true });
      await expect(failed).toBeVisible({ timeout: 20_000 });
      await expect(failed).toContainText('Your day couldn’t load');
      await expect(failed).toContainText('Caime is busy right now.');
      await expect(
        page.getByText('Nothing needs you right now.').filter({ visible: true }),
      ).toHaveCount(0);
      await page.unroute(INBOX);
      await failed.getByRole('button', { name: 'Try again' }).click();
      await expect(page.getByTestId('home-load-failed')).toHaveCount(0);
      await expect(page.getByTestId('home-summary')).not.toHaveText(' ');
      await page.close();
    });
    const say = async (
      ctx: BrowserContext,
      conversation: string,
      body: string,
      replyToId?: string,
    ) => {
      const said = await ctx.request.post(`/v1/conversations/${conversation}/messages`, {
        headers: CLIENT,
        data: { clientId: randomUUID(), body, ...(replyToId ? { replyToId } : {}) },
      });
      expect(said.ok(), await said.text()).toBe(true);
      return ((await said.json()) as { message: { id: string } }).message.id;
    };

    test('a reply names whom it quotes, a tap goes to it, and who reacted is named', async () => {
      const asked = await say(noorCtx, convo, 'Can you bring the chairs?');
      await say(alexCtx, convo, 'Yes, all six.', asked);
      // To Alex the quote is Noor's; to Noor, whose words they were, it's "You".
      await alex.page.goto(`/c/${convo}`);
      const theirs = alex.page.getByTestId('message-quote').filter({ visible: true }).last();
      await expect(theirs).toContainText('Noor Honest');
      await expect(theirs).toContainText('Can you bring the chairs?');
      const { page } = noor;
      await page.goto(`/c/${convo}`);
      const quote = page.getByTestId('message-quote').filter({ visible: true }).last();
      await expect(quote).toContainText('You');
      await quote.click();
      await expect(page.getByTestId('message-highlighted').filter({ visible: true })).toContainText(
        'Can you bring the chairs?',
      );
      // Answering one's own words says so in a whole sentence, in every language.
      await page
        .getByLabel(/Can you bring the chairs\?, .*(Sent|Delivered|Read)$/)
        .filter({ visible: true })
        .hover();
      await page.getByRole('button', { name: 'Reply', exact: true }).click();
      await expect(visible(page, 'Replying to yourself')).toBeVisible();

      // Both react; holding the reaction names who, Noor as "You".
      for (const ctx of [alexCtx, noorCtx]) {
        const reacted = await ctx.request.post(`/v1/messages/${asked}/reactions`, {
          headers: CLIENT,
          data: { emoji: '👍' },
        });
        expect(reacted.ok(), await reacted.text()).toBe(true);
      }
      const chip = page
        .getByRole('button', { name: '👍 2, including you' })
        .filter({ visible: true });
      await expect(chip).toBeVisible();
      await chip.click({ delay: 700 });
      await expect(page.getByTestId('reacted-by').filter({ visible: true })).toContainText(
        'You and Alex Honest',
      );
      await page.keyboard.press('Escape');
      expect(noor.errors).toEqual([]);
      expect(alex.errors).toEqual([]);
    });

    test('a message of one’s own in a group says who has read it', async () => {
      const made = await noorCtx.request.post('/v1/conversations', {
        headers: CLIENT,
        data: { kind: 'group', title: `Chairs ${suffix}`, memberIds: [alexId] },
      });
      expect(made.ok(), await made.text()).toBe(true);
      const group = ((await made.json()) as { conversation: { id: string } }).conversation.id;
      await say(noorCtx, group, 'Six chairs, Saturday at ten');
      const { page } = noor;
      await page.goto(`/c/${group}`);
      const bubble = page
        .getByLabel(/Six chairs, Saturday at ten, .*(Sent|Delivered|Read)$/)
        .filter({ visible: true });
      const info = async () => {
        await bubble.hover();
        await page.getByRole('button', { name: 'React', exact: true }).click();
        return page.getByTestId('message-info').filter({ visible: true });
      };
      // Alex hasn't opened it: not read, whether or not it has reached a device of theirs.
      await expect(await info()).toContainText('Alex Honest');
      await expect(page.getByTestId('info-read')).toHaveCount(0);
      await page.keyboard.press('Escape');
      await alex.page.goto(`/c/${group}`);
      await expect(visible(alex.page, 'Six chairs, Saturday at ten')).toBeVisible();
      await expect(bubble).toHaveAccessibleName(/, Read$/, { timeout: 15_000 });
      await info();
      await expect(page.getByTestId('info-read').filter({ visible: true })).toContainText(
        'Alex Honest',
      );
      await page.keyboard.press('Escape');
      expect(noor.errors).toEqual([]);
      expect(alex.errors).toEqual([]);
    });
  });
