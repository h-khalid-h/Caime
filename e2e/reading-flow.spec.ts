/**
 * Reading a conversation (M16 E3, review 2026-10-17 §7): it opens at the first unread with their
 * count on the line, the jump button counts what's below, a pill says the day while scrolling,
 * emoji alone are drawn big, a mention of the reader is marked, and the head says when the other
 * person was last here once they've gone. A conversation marked unread keeps a dot until it's
 * opened, and a group's message answered privately is quoted in the chat and leads back (E3b).
 */
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
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

    test('search inside the conversation finds a message and jumps to it (M16 E6)', async () => {
      await say(`The plumber comes Thursday at nine ${suffix}`);
      for (let i = 0; i < 25; i++) await say(`Later line ${i}`);
      const { page } = noor;
      await page.goto(`/c/${convo}`);
      await page.getByTestId('chat-search').filter({ visible: true }).click();
      await page.getByTestId('chat-search-input').filter({ visible: true }).fill('plumber');
      const hit = page.getByTestId('chat-search-results').filter({ visible: true });
      await expect(hit).toContainText('Alex Reads');
      await expect(hit).toContainText('plumber');
      await page.screenshot({ path: 'e2e/screenshots/desktop-chat-search.png' });
      await hit.getByRole('button').first().click();
      await expect(page.getByTestId('message-highlighted').filter({ visible: true })).toContainText(
        'The plumber comes Thursday',
      );
      // Nothing there: said so, never an empty sheet.
      await page.getByTestId('chat-search').filter({ visible: true }).click();
      await page.getByTestId('chat-search-input').filter({ visible: true }).fill('zebra');
      await expect(page.getByTestId('chat-search-none').filter({ visible: true })).toHaveText(
        'Nothing found for “zebra”.',
      );
      expect(noor.errors).toEqual([]);
    });

    test('the conversation exports as WhatsApp’s text, its importer’s lines (M16 E7)', async () => {
      const { page } = noor;
      await page.goto(`/c/${convo}`);
      const download = page.waitForEvent('download');
      await page.getByTestId('chat-export').filter({ visible: true }).click();
      const file = await download;
      expect(file.suggestedFilename()).toMatch(/^caime-chat/);
      const text = await readFile(await file.path(), 'utf8');
      expect(text).toMatch(
        new RegExp(
          `^\\d{4}-\\d{2}-\\d{2}, \\d{2}:\\d{2} - Alex Reads: The plumber comes Thursday at nine ${suffix}$`,
          'm',
        ),
      );
      expect(text).toMatch(/ - Alex Reads: Later line 24\n$/);
      expect(noor.errors).toEqual([]);
    });

    test('messages chosen together are copied in order, deleted with one Undo and forwarded (M16 E8)', async () => {
      await noorCtx.grantPermissions(['clipboard-read', 'clipboard-write']);
      const listed = await noorCtx.request.get(`/v1/conversations/${convo}/messages`, {
        headers: CLIENT,
      });
      const { messages } = (await listed.json()) as {
        messages: Array<{ body: string | null; seq: number }>;
      };
      const seqOf = (body: string) => messages.find((m) => m.body === body)?.seq as number;
      const { page } = noor;
      await page.goto(`/c/${convo}`);
      const count = page.getByTestId('select-count').filter({ visible: true });
      const choose = async (body: string) => {
        await visible(page, body).hover();
        await page.getByRole('button', { name: 'React', exact: true }).click();
        await page.getByTestId('message-select').click();
      };
      const toggle = (body: string) =>
        page
          .getByTestId(`select-${seqOf(body)}`)
          .filter({ visible: true })
          .click();

      // Chosen from a message's actions, then a tap on others takes them or lets them go.
      await choose('Later line 23');
      await expect(count).toHaveText('1 selected');
      await toggle('Later line 22');
      await toggle('Later line 24');
      await expect(count).toHaveText('3 selected');
      await toggle('Later line 24');
      await expect(count).toHaveText('2 selected');
      await expect(page.getByTestId('composer-input').filter({ visible: true })).toHaveCount(0);
      await page.screenshot({ path: 'e2e/screenshots/desktop-select-many.png' });

      // Copied in the order they were said, each under who said it; the choosing ends.
      await page.getByTestId('select-copy').filter({ visible: true }).click();
      await expect(visible(page, 'Copied')).toBeVisible();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
        'Alex Reads: Later line 22\nAlex Reads: Later line 23',
      );
      await expect(page.getByTestId('selection-bar').filter({ visible: true })).toHaveCount(0);
      await expect(page.getByTestId('composer-input').filter({ visible: true })).toBeVisible();

      // Deleted for me together, and one Undo puts both back.
      await choose('Later line 21');
      await toggle('Later line 20');
      await page.getByTestId('select-delete').filter({ visible: true }).click();
      await expect(visible(page, '2 messages deleted for you')).toBeVisible();
      await expect(
        page.getByText('Later line 21', { exact: true }).filter({ visible: true }),
      ).toHaveCount(0);
      await page.getByRole('button', { name: 'Undo' }).filter({ visible: true }).click();
      await expect(visible(page, 'Later line 21')).toBeVisible();
      await expect(visible(page, 'Later line 20')).toBeVisible();

      // Forwarded together into a group, in the order they were said.
      const made = await noorCtx.request.post('/v1/conversations', {
        headers: CLIENT,
        data: { kind: 'group', title: `Forward circle ${suffix}`, memberIds: [alexId] },
      });
      const group = ((await made.json()) as { conversation: { id: string } }).conversation.id;
      await choose('Later line 19');
      await toggle('Later line 18');
      await page.getByTestId('select-forward').filter({ visible: true }).click();
      await page.getByTestId('forward-find').fill('Forward circle');
      await page.getByTestId('forward-to').filter({ hasText: 'Forward circle' }).first().click();
      await page.getByTestId('forward-send').click();
      await expect(
        page.getByText('Forwarded', { exact: true }).filter({ visible: true }),
      ).toBeVisible();
      const there = await noorCtx.request.get(`/v1/conversations/${group}/messages`, {
        headers: CLIENT,
      });
      const bodies = (
        (await there.json()) as { messages: Array<{ body: string | null; seq: number }> }
      ).messages
        .sort((a, b) => a.seq - b.seq)
        .map((m) => m.body)
        .filter((b) => b?.startsWith('Later line'));
      expect(bodies).toEqual(['Later line 18', 'Later line 19']);
      expect(noor.errors).toEqual([]);
    });

    test('a message written now is sent later, or at once from its line (M16 E8b)', async () => {
      const { page } = noor;
      await page.goto(`/c/${convo}`);
      const words = `See you at the reunion ${suffix}`;
      await page.getByTestId('composer-input').filter({ visible: true }).fill(words);
      await page.getByTestId('composer-attach').filter({ visible: true }).click();
      await page.getByTestId('attach-later').click();
      // Three days on, at the hour the sheet offers: always ahead, wherever the run is.
      const day = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
      await page.getByTestId('later-sheet-day').fill(day);
      await page.getByTestId('later-sheet-done').click();
      await expect(visible(page, 'Kept to send later')).toBeVisible();
      await expect(page.getByTestId('composer-input').filter({ visible: true })).toHaveValue('');
      const line = page.getByTestId('scheduled-line').filter({ visible: true });
      await expect(line).toHaveText('1 message to send later');
      // Alex has nothing yet: it's Noor's alone until it goes.
      const before = await alexCtx.request.get(`/v1/conversations/${convo}/messages`, {
        headers: CLIENT,
      });
      expect(JSON.stringify(await before.json())).not.toContain(words);
      await line.click();
      const list = page.getByTestId('scheduled-list').filter({ visible: true });
      await expect(list).toContainText(words);
      await page.screenshot({ path: 'e2e/screenshots/desktop-send-later.png' });
      await list.getByTestId('scheduled-send-now').click();
      await expect(visible(page, 'Sent')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(visible(page, words)).toBeVisible();
      await expect(page.getByTestId('scheduled-line').filter({ visible: true })).toHaveCount(0);
      const after = await alexCtx.request.get(`/v1/conversations/${convo}/messages`, {
        headers: CLIENT,
      });
      expect(JSON.stringify(await after.json())).toContain(words);
      expect(noor.errors).toEqual([]);
    });

    test('someone Noor knows is sent as a contact that opens their profile (M16 E8c)', async ({
      browser,
    }) => {
      const samCtx = await browser.newContext();
      const samHandle = `sam.known.${suffix}`;
      const samId = (await apiSignUp(samCtx, 'Sam Known', samHandle)).id;
      const asked = await samCtx.request.post('/v1/connections/requests', {
        headers: CLIENT,
        data: { toUserId: noorId, relationship: { sphere: 'friend' } },
      });
      const { requestId } = (await asked.json()) as { requestId: string };
      await noorCtx.request.post(`/v1/connections/requests/${requestId}/accept`, {
        headers: CLIENT,
        data: {},
      });
      await samCtx.close();
      const { page } = noor;
      await page.goto(`/c/${convo}`);
      await page.getByTestId('composer-attach').filter({ visible: true }).click();
      await page.getByTestId('attach-contact').click();
      // Alex is here already, so only Sam is offered.
      await expect(page.getByTestId(`pick-alex.reads.${suffix}`)).toHaveCount(0);
      await page.getByTestId(`pick-${samHandle}`).filter({ visible: true }).click();
      const card = page.getByTestId('contact-card').filter({ visible: true }).last();
      await expect(card).toContainText('Sam Known');
      await expect(card).toContainText(`@${samHandle}`);
      // Kept as Sam's id alone; Alex reads Sam as Sam's profile shows Sam to Alex.
      const seen = await alexCtx.request.get(`/v1/conversations/${convo}/messages`, {
        headers: CLIENT,
      });
      const { messages } = (await seen.json()) as {
        messages: Array<{ kind: string; payload: unknown }>;
      };
      expect(messages.filter((m) => m.kind === 'contact').map((m) => m.payload)).toEqual([
        { userId: samId },
      ]);
      expect((await alexCtx.request.get(`/v1/people/${samId}`, { headers: CLIENT })).ok()).toBe(
        true,
      );
      await page.screenshot({ path: 'e2e/screenshots/desktop-contact-sent.png' });
      await card.click();
      await expect(page).toHaveURL(new RegExp(`/p/${samId}`));
      expect(noor.errors).toEqual([]);
    });

    test('a plan or an amount being written offers its card, filled, on a tap (M17 I9a)', async () => {
      const { page } = noor;
      await page.goto(`/c/${convo}`);
      const box = page.getByTestId('composer-input').filter({ visible: true });
      await box.fill("Let's meet Friday at 3pm");
      const offer = page.getByTestId('card-offer').filter({ visible: true });
      await expect(offer).toContainText('Make it a Meeting card');
      await expect(offer).toContainText('3:00');
      await page.screenshot({ path: 'e2e/screenshots/desktop-card-offer.png' });
      await offer.getByTestId('card-offer-take').click();
      // The card opens filled from the words, and nothing is sent until it's sent.
      await expect(page.getByLabel('Title')).toHaveValue('Meeting');
      await expect(page.getByLabel('When', { exact: true })).toHaveValue('Friday at 3pm');
      await expect(visible(page, /^Fri, .*3:00/)).toBeVisible();
      await page.getByLabel('Title').fill(`Catch-up ${suffix}`);
      await page.getByTestId('kit-send').click();
      await expect(
        page.getByTestId('kit-meeting').filter({ hasText: `Catch-up ${suffix}`, visible: true }),
      ).toContainText('Proposed');
      // Taken once, it isn't offered again for the same words.
      await expect(page.getByTestId('card-offer').filter({ visible: true })).toHaveCount(0);

      // An amount asked for offers a Pay card that asks; its × puts it aside.
      await box.fill('Send me 200 EGP for the tickets');
      await expect(offer).toContainText('Make it a Pay card');
      await expect(offer).toContainText('Ask to be paid');
      await offer.getByTestId('card-offer-take').click();
      await expect(page.getByRole('radio', { name: 'Ask to be paid' })).toBeChecked();
      await expect(page.getByLabel('Amount', { exact: true })).toHaveValue('200');
      await page.keyboard.press('Escape');
      await box.fill("I'll send you 50 EGP tonight");
      await expect(offer).toContainText('I’m paying');
      await offer.getByTestId('card-offer-close').click();
      await expect(page.getByTestId('card-offer').filter({ visible: true })).toHaveCount(0);
      // Nothing was sent but the card.
      const said = await alexCtx.request.get(`/v1/conversations/${convo}/messages`, {
        headers: CLIENT,
      });
      const text = JSON.stringify(await said.json());
      expect(text).not.toContain('Send me 200 EGP');
      expect(text).not.toContain("I'll send you 50 EGP");
      await box.fill('');

      // Alex's plan offers Noor a card to answer it with, at the time Alex said (M17 I9b).
      await say("Let's meet Saturday at 11am");
      await expect(visible(page, "Let's meet Saturday at 11am")).toBeVisible();
      const answer = page.getByTestId('card-offer').filter({ visible: true });
      await expect(answer).toContainText('Answer with a Meeting card');
      await expect(answer).toContainText('11:00');
      await answer.getByTestId('card-offer-take').click();
      await expect(page.getByLabel('Title')).toHaveValue('Meeting');
      await expect(visible(page, /^Sat, .*11:00/)).toBeVisible();
      await page.getByLabel('Title').fill(`Brunch ${suffix}`);
      await page.getByTestId('kit-send').click();
      const card = page
        .getByTestId('kit-meeting')
        .filter({ hasText: `Brunch ${suffix}`, visible: true });
      await expect(card).toContainText('Proposed');
      // It answers Alex's words, and isn't offered again.
      const after = (await (
        await alexCtx.request.get(`/v1/conversations/${convo}/messages`, { headers: CLIENT })
      ).json()) as {
        messages: Array<{
          id: string;
          body: string | null;
          kind: string;
          replyTo: { id: string } | null;
        }>;
      };
      const plan = after.messages.find((m) => m.body === "Let's meet Saturday at 11am");
      const sent = after.messages.filter((m) => m.kind === 'kit').at(-1);
      expect(sent?.replyTo?.id).toBe(plan?.id);
      await expect(page.getByTestId('card-offer').filter({ visible: true })).toHaveCount(0);
      expect(noor.errors).toEqual([]);
    });
  });
