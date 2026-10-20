/**
 * Cai takes notes in a call (M16 F7, R82 under R85), between two browsers whose microphones speak
 * and pause (e2e/fake-speech.ts): asked while it rings, the ring itself asks ("Answer, Cai takes
 * notes" beside "Answer without Cai"); on, both see it; the asker's browser records each voice on
 * its own track and sends each utterance as it ends, which the speech stand-in hears; anyone stops
 * it; the call's line opens the notes, speaker by speaker, and each may delete their own words. A
 * second call answered without Cai never starts it. A meeting proposed with "Cai takes notes"
 * (M16 F7c) says so on its card, and its Join asks as it starts the call. Asked, Cai catches the
 * reader up on the notes and finds their follow-ups (M16 F7d).
 */
import { type BrowserContext, expect, type Page, test } from '@playwright/test';
import { apiSignUp, CLIENT, newPerson, visible } from './helpers';

const stamp = Date.now().toString(36);

/**
 * What went wrong on either side, less the one race a call has by design: a connection's last
 * signal on its way as the other hangs up is refused as over (409), as the meetings spec allows.
 */
const late = (e: string) =>
  /^409 POST .*\/v1\/calls\/[0-9a-f-]+\/signal$/.test(e) ||
  e === 'console: Failed to load resource: the server responded with a status of 409 (Conflict)';
const problems = (...sides: Array<{ errors: string[] }>) =>
  sides.flatMap((side) => side.errors).filter((e) => !late(e));

test.describe
  .serial('Cai’s notes in a call', () => {
    let noorContext: BrowserContext;
    let samContext: BrowserContext;
    let noor: { page: Page; errors: string[] };
    let sam: { page: Page; errors: string[] };
    let convo: string;

    test.beforeAll(async ({ browser }) => {
      noorContext = await browser.newContext({ viewport: { width: 1280, height: 860 } });
      samContext = await browser.newContext({ viewport: { width: 1280, height: 860 } });
      await apiSignUp(noorContext, 'Noor Haddad', `noor.notes.${stamp}`);
      const samId = (await apiSignUp(samContext, 'Sam Rivera', `sam.notes.${stamp}`)).id;
      // Hearing what's said is AI assist, on the asker's allowance: Noor's is on.
      const on = await noorContext.request.patch('/v1/me', {
        headers: CLIENT,
        data: { aiEnabled: true },
      });
      expect(on.ok(), await on.text()).toBe(true);
      const asked = await noorContext.request.post('/v1/connections/requests', {
        headers: CLIENT,
        data: { toUserId: samId, relationship: { sphere: 'work', role: 'colleague' } },
      });
      const { requestId } = await asked.json();
      const accepted = await samContext.request.post(
        `/v1/connections/requests/${requestId}/accept`,
        { headers: CLIENT, data: {} },
      );
      convo = (await accepted.json()).conversationId;
      noor = await newPerson(noorContext);
      sam = await newPerson(samContext);
    });

    test.afterAll(async () => {
      await noorContext?.close();
      await samContext?.close();
    });

    test('asked while it rings, answered with Cai, heard, stopped, and read from the call’s line', async () => {
      test.setTimeout(150_000);
      const { page } = noor;
      await page.goto(`/c/${convo}`);
      await sam.page.goto('/');
      await page.getByTestId('call-voice').click();
      await expect(sam.page.getByTestId('call-incoming')).toBeVisible();

      // Noor asks before Sam answers: the ring then asks for her, and says so.
      await page.getByTestId('call-notes').click();
      await expect(page.getByTestId('call-notes-asking')).toHaveText(
        'Asking Sam to let Cai take notes',
      );
      await expect(sam.page.getByTestId('call-incoming-notes')).toHaveText(
        'Noor asks Cai to take notes in this call.',
      );
      // No plain Answer: each way in says what it does (R85 (1)).
      await expect(sam.page.getByTestId('call-accept')).toHaveCount(0);
      await expect(sam.page.getByTestId('call-accept-without-notes')).toHaveAccessibleName(
        'Answer without Cai',
      );
      await sam.page.screenshot({ path: 'e2e/screenshots/desktop-call-notes-ring.png' });
      await sam.page.getByTestId('call-accept-with-notes').click();

      // On, for both, the whole time (R52's indicator).
      await expect(page.getByTestId('call-notes-on')).toHaveText('Cai is taking notes', {
        timeout: 20_000,
      });
      await expect(sam.page.getByTestId('call-notes-on')).toHaveText('Cai is taking notes');
      await page.screenshot({ path: 'e2e/screenshots/desktop-call-notes-on.png' });

      // The microphones speak and pause: Noor's browser sends each utterance as it ends.
      const lines = () =>
        page.request
          .get(`/v1/calls/${callId}/notes`, { headers: CLIENT })
          .then((r) => r.json())
          .then((b: { lines?: Array<{ text: string | null }> }) => b.lines ?? []);
      const callId = await page.evaluate(async (c) => {
        const r = await fetch('/v1/calls/live', { headers: { 'x-caime-client': 'web' } });
        const { call } = (await r.json()) as { call: { id: string; conversationId: string } };
        return call.conversationId === c ? call.id : '';
      }, convo);
      expect(callId).not.toBe('');
      await expect
        .poll(async () => (await lines()).filter((l) => l.text).length, { timeout: 45_000 })
        .toBeGreaterThanOrEqual(2);

      // Anyone stops it, for everyone (R85 (2)).
      await sam.page.getByTestId('call-notes').click();
      await expect(page.getByTestId('call-notes-on')).toHaveCount(0);
      await expect(visible(page, 'Cai stopped taking notes.')).toBeVisible();
      await page.getByTestId('call-hangup').click();
      await expect(page.getByTestId('call-screen')).toHaveCount(0);

      // The call's line opens the notes, speaker by speaker.
      await page.getByTestId('call-notes-open').click();
      const sheet = page.getByTestId('call-notes-lines');
      await expect(sheet).toBeVisible();
      await expect(sheet.getByText('Hi Noor, the contract is signed.').first()).toBeVisible();
      await expect(sheet.getByText('You').first()).toBeVisible();
      await expect(sheet.getByText('Sam Rivera').first()).toBeVisible();
      // Asked, Cai catches Noor up on what was said, labelled as Cai's and kept nowhere, and
      // finds its follow-ups (M16 F7d): nothing here is anyone's to do.
      await page.getByTestId('call-notes-catch-up').click();
      const summary = page.getByTestId('call-notes-summary');
      await expect(summary).toContainText('Suggested by Cai');
      await expect(summary).toContainText(/Caught up on \d+ messages/);
      await page.getByTestId('call-notes-follow-ups').click();
      await expect(visible(page, 'Nothing new to follow up')).toBeVisible();
      await page.screenshot({ path: 'e2e/screenshots/desktop-call-notes-sheet.png' });

      // Noor deletes her own words; Sam's stay.
      const mine = await page.getByTestId('call-notes-delete').count();
      expect(mine).toBeGreaterThan(0);
      const before = await page.getByTestId('call-notes-line').count();
      await page.getByTestId('call-notes-delete').first().click();
      await expect(page.getByTestId('call-notes-line')).toHaveCount(before - 1);
      expect(problems(noor, sam)).toEqual([]);
    });

    test('a ring answered without Cai never starts it', async () => {
      const { page } = noor;
      await page.goto(`/c/${convo}`);
      await sam.page.goto('/');
      await page.getByTestId('call-voice').click();
      await expect(sam.page.getByTestId('call-incoming')).toBeVisible();
      await page.getByTestId('call-notes').click();
      await expect(sam.page.getByTestId('call-accept-without-notes')).toBeVisible();
      await sam.page.getByTestId('call-accept-without-notes').click();
      await expect(visible(page, 'Not this time: Cai isn’t taking notes.')).toBeVisible({
        timeout: 20_000,
      });
      await expect(page.getByTestId('call-notes-on')).toHaveCount(0);
      await page.getByTestId('call-hangup').click();
      await expect(page.getByTestId('call-screen')).toHaveCount(0);
      expect(problems(noor, sam)).toEqual([]);
    });
    test('a meeting that says Cai takes notes asks as its Join is pressed', async () => {
      const { page } = noor;
      // Noor proposes the meeting from the form, on Caime, with Cai's notes.
      await page.goto(`/c/${convo}`);
      await page.getByRole('button', { name: 'Share a photo, a file or a card' }).click();
      await page.getByTestId('kit-option-meeting').click();
      await page.getByLabel('Title').fill('Contract review');
      await page.getByLabel('When', { exact: true }).fill('in 5 minutes');
      await expect(page.getByTestId('kit-where-caime')).toBeChecked();
      await page.getByTestId('kit-notes').getByRole('switch').click();
      await page.getByTestId('kit-send').click();
      const mine = page.getByTestId('kit-meeting').filter({ hasText: 'Contract review' });
      await expect(mine).toContainText('Cai, once everyone in the call says yes');

      // Sam accepts; Noor's Join says what it does, with Cai or without (R85 (1)).
      await sam.page.goto(`/c/${convo}`);
      const theirs = sam.page
        .getByTestId('kit-meeting')
        .filter({ hasText: 'Contract review', visible: true });
      await theirs.getByRole('button', { name: 'Accept', exact: true }).click();
      await expect(mine).toContainText('Accepted');
      await expect(mine.getByTestId('kit-join')).toHaveCount(0);
      await page.screenshot({ path: 'e2e/screenshots/desktop-meeting-notes.png' });
      await mine.getByTestId('kit-join-with-notes').click();

      // Sam's ring asks for Noor, and Sam's own card now offers the same choice.
      await expect(sam.page.getByTestId('call-incoming-notes')).toHaveText(
        'Noor asks Cai to take notes in this call.',
      );
      await sam.page.getByTestId('call-accept-with-notes').click();
      await expect(page.getByTestId('call-notes-on')).toHaveText('Cai is taking notes', {
        timeout: 20_000,
      });
      await page.getByTestId('call-hangup').click();
      await expect(page.getByTestId('call-screen')).toHaveCount(0);
      expect(problems(noor, sam)).toEqual([]);
    });
  });
