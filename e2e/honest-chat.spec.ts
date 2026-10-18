/**
 * A chat that says what's true (M16 E1, review 2026-10-17 §7): a delete waits for its Undo, and
 * Undo puts the message back as it was, with nothing sent; once the Undo has passed, the other
 * side sees it deleted. A first load that fails says so, with Try again, never "nothing needs
 * you", the first-run screen or "the beginning of your conversation".
 */
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

    test.beforeAll(async ({ browser }) => {
      noorCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      alexCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const n = await apiSignUp(noorCtx, 'Noor Honest', `noor.honest.${suffix}`);
      await apiSignUp(alexCtx, 'Alex Honest', `alex.honest.${suffix}`);
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
        .getByLabel(/The door code is 4417, (Sent|Delivered|Read)$/)
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
      await expect(page.getByText('The door code is 4417').filter({ visible: true })).toHaveCount(
        0,
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
  });
