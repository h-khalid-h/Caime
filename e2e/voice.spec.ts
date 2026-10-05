/**
 * A voice note (PRD §46, docs/SPEECH.md): recorded in the composer against Chromium's fake
 * microphone, sent with its length, played from the bubble, and turned into words by the speech
 * stand-in once the sender has AI assist on, shown under the note and found by search.
 */
import { expect, test } from '@playwright/test';
import { apiSignUp, CLIENT, newPerson, visible } from './helpers';

const suffix = Math.random().toString(36).slice(2, 7);
const AI_STUB = `http://127.0.0.1:${Number(process.env.E2E_AI_STUB_PORT ?? 8799)}`;

test.describe
  .serial('voice notes', () => {
    test('recorded, sent, played, and read into words with AI assist on', async ({ browser }) => {
      test.setTimeout(180_000);
      const noorCtx = await browser.newContext({
        viewport: { width: 390, height: 844 },
        permissions: ['microphone'],
      });
      const alexCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const noor = await apiSignUp(noorCtx, 'Noor Voice', `noor.voice.${suffix}`);
      await apiSignUp(alexCtx, 'Alex Voice', `alex.voice.${suffix}`);
      const asked = await alexCtx.request.post('/v1/connections/requests', {
        headers: CLIENT,
        data: { toUserId: noor.id, relationship: { sphere: 'work', role: 'colleague' } },
      });
      const { requestId } = (await asked.json()) as { requestId: string };
      const acc = await noorCtx.request.post(`/v1/connections/requests/${requestId}/accept`, {
        headers: CLIENT,
        data: {},
      });
      const convo = ((await acc.json()) as { conversationId: string }).conversationId;
      // Noor is an adult with AI assist on: her notes are read into words.
      const on = await noorCtx.request.patch('/v1/me', {
        headers: CLIENT,
        data: { aiEnabled: true },
      });
      expect(on.ok(), await on.text()).toBe(true);
      await noorCtx.request.delete(`${AI_STUB}/requests`);

      const { page, errors } = await newPerson(noorCtx);
      await page.goto(`/c/${convo}`);
      await page.getByTestId('composer-voice').click();
      const recorder = page.getByTestId('voice-recorder');
      await expect(recorder).toBeVisible();
      await expect(recorder).toContainText('Recording');
      // Two seconds of the fake microphone's tone.
      await page.waitForTimeout(2_200);
      await page.getByTestId('voice-stop').click();
      await expect(recorder).toContainText('Ready to send');
      await page.getByTestId('voice-send').click();

      // The note is in the conversation with its length, and plays.
      const note = page.getByTestId('voice-note').filter({ visible: true }).first();
      await expect(note).toBeVisible({ timeout: 20_000 });
      await expect(note.getByTestId('voice-length')).toContainText(/0:0[1-9]/);
      // Its words come from the speech stand-in, labelled as Caime's, and are searchable.
      await expect(visible(page, 'Hi Noor, the contract is signed.')).toBeVisible({
        timeout: 30_000,
      });
      // Then it plays (pressed once the bubble has settled: a press during its slide-in is
      // cancelled by the pointer moving, as any real one would be).
      await page.waitForTimeout(600);
      await note.getByTestId('voice-play').click();
      await expect(note.getByRole('button', { name: 'Pause' })).toBeVisible({ timeout: 10_000 });
      await expect(
        page.getByTestId('voice-transcript').filter({ visible: true }).first(),
      ).toContainText('Transcript · Suggested by Caime');
      const calls = (await (await noorCtx.request.get(`${AI_STUB}/requests`)).json()) as {
        calls: string[];
      };
      expect(calls.calls).toContain('transcribe');
      await page.goto('/search');
      await page.getByTestId('search-input').fill('contract is signed');
      await expect(
        page
          .getByRole('button', { name: /^Noor Voice, / })
          .filter({ hasText: /contract is signed/ }),
      ).toBeVisible({ timeout: 20_000 });
      expect(errors.filter((e) => !e.includes('404'))).toEqual([]);

      // Alex, with AI assist off, sends one too: it stays a note, nothing is sent anywhere.
      await noorCtx.request.delete(`${AI_STUB}/requests`);
      const alex = await newPerson(alexCtx);
      await alex.page.goto(`/c/${convo}`);
      await alex.page.getByTestId('composer-voice').click();
      await expect(alex.page.getByTestId('voice-recorder')).toContainText('Recording');
      await alex.page.waitForTimeout(1_500);
      await alex.page.getByTestId('voice-stop').click();
      await alex.page.getByTestId('voice-send').click();
      await expect(
        alex.page.getByTestId('voice-note').filter({ visible: true }).nth(1),
      ).toBeVisible({
        timeout: 20_000,
      });
      await alex.page.waitForTimeout(4_000);
      const after = (await (await noorCtx.request.get(`${AI_STUB}/requests`)).json()) as {
        calls: string[];
      };
      expect(after.calls).not.toContain('transcribe');
      expect(alex.page.getByTestId('voice-transcript')).toHaveCount(1);
    });
  });
