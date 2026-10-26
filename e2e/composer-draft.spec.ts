/**
 * A sent message leaves the box for good (the owner's report of 2026-10-26: "the sent message text
 * or part of it remains as draft in the composer even after being sent and even after I refreshed
 * the page"). A pause while writing saves the draft to the account, and the account's draft comes
 * back in the conversation's view; the send clears it there too, so neither a reload nor coming
 * back to the conversation puts the words, or the part saved at the pause, back in the box.
 */
import { randomUUID } from 'node:crypto';
import { type BrowserContext, expect, type Page, test } from '@playwright/test';
import { apiSignUp, CLIENT, newPerson, visible } from './helpers';

const suffix = Math.random().toString(36).slice(2, 7);

test.describe
  .serial('a sent message leaves the box', () => {
    let noorCtx: BrowserContext;
    let alexCtx: BrowserContext;
    let noor: { page: Page; errors: string[] };
    let convo: string;

    test.beforeAll(async ({ browser }) => {
      noorCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      alexCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const noorId = (await apiSignUp(noorCtx, 'Noor Drafts', `noor.drafts.${suffix}`)).id;
      await apiSignUp(alexCtx, 'Alex Drafts', `alex.drafts.${suffix}`);
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
      const said = await alexCtx.request.post(`/v1/conversations/${convo}/messages`, {
        headers: CLIENT,
        data: { clientId: randomUUID(), body: 'Are you on your way?' },
      });
      expect(said.ok()).toBe(true);
      noor = await newPerson(noorCtx);
    });

    test.afterAll(async () => {
      await noorCtx.close();
      await alexCtx.close();
    });

    test('neither a reload nor coming back puts the sent words, or the part saved at a pause, back', async () => {
      const { page, errors } = noor;
      await page.goto(`/c/${convo}`);
      await expect(visible(page, 'Are you on your way?')).toBeVisible();
      const box = page.getByTestId('composer-input');
      // A pause: the draft is saved to the account, and the view read again carries it.
      const saved = page.waitForResponse(
        (r) =>
          r.url().endsWith(`/v1/conversations/${convo}`) &&
          r.request().method() === 'PATCH' &&
          (r.request().postData() ?? '').includes('Running late'),
      );
      const viewDrafts: Array<string | null> = [];
      page.on('response', (r) => {
        if (!r.url().endsWith(`/v1/conversations/${convo}`) || r.request().method() !== 'GET')
          return;
        void r
          .json()
          .then((v: { conversation: { me: { draft: string | null } } }) =>
            viewDrafts.push(v.conversation.me.draft),
          )
          .catch(() => {});
      });
      await box.fill('Running late');
      expect((await saved).ok()).toBe(true);
      await expect.poll(() => viewDrafts.includes('Running late')).toBe(true);

      await box.fill('Running late, there in ten minutes');
      await page.getByTestId('composer-send').click();
      await expect(visible(page, 'Running late, there in ten minutes')).toBeVisible();
      await expect(box).toHaveValue('');

      // Coming back to the conversation.
      await page.goto('/chats');
      await page.goto(`/c/${convo}`);
      await expect(visible(page, 'Running late, there in ten minutes')).toBeVisible();
      await expect(page.getByTestId('composer-input')).toHaveValue('');

      // A reload, from the copy the device kept.
      await page.reload();
      await expect(visible(page, 'Running late, there in ten minutes')).toBeVisible();
      await expect(page.getByTestId('composer-input')).toHaveValue('');
      // Held a moment, past the view read again after the reload.
      await page.waitForTimeout(2000);
      await expect(page.getByTestId('composer-input')).toHaveValue('');

      // And the account keeps no draft there.
      const view = await noorCtx.request.get(`/v1/conversations/${convo}`, { headers: CLIENT });
      expect(
        ((await view.json()) as { conversation: { me: { draft: string | null } } }).conversation.me
          .draft,
      ).toBeNull();
      expect(errors).toEqual([]);
    });
  });
