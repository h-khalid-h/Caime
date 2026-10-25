/**
 * Cai takes notes in a call (M16 F7, R82 under R85), between two browsers whose microphones speak
 * and pause (e2e/fake-speech.ts): asked while it rings, the ring itself asks ("Answer, Cai takes
 * notes" beside "Answer without Cai"); on, both see it; the asker's browser records each voice on
 * its own track and sends each utterance as it ends, which the speech stand-in hears; anyone stops
 * it; the call's line opens the notes, speaker by speaker, and each may delete their own words. A
 * second call answered without Cai never starts it. A meeting proposed with "Cai takes notes"
 * (M16 F7c) says so on its card, and its Join asks as it starts the call. Asked, Cai catches the
 * reader up on the notes and finds their follow-ups (M16 F7d). Recorded (R114, M17 I13b): asked as
 * itself, the ring says what's kept, the asker's browser sends the voices and a shared screen in
 * pieces, the server makes each seekable, both play them from the notes (a line opening the voices
 * at its moment, the screen in step), and either deletes the recording for everyone.
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
      await page.getByTestId('call-notes-take').click();
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

      // The call's line opens the notes: Cai's write-up once every word is heard (M16 F7e),
      // labelled as Cai's, for both of them, then what was said, speaker by speaker.
      await page.getByTestId('call-notes-open').click();
      const written = page.getByTestId('call-notes-written');
      await expect(written).toContainText('Suggested by Cai', { timeout: 45_000 });
      await expect(written).toContainText(/A call of \d+ lines, opened by /);
      await expect(written.getByTestId('call-notes-next')).toContainText('Follow up on the call');
      // Written up, there's nothing to ask for: the catch-up is for someone who came in later.
      await expect(page.getByTestId('call-notes-catch-up')).toHaveCount(0);
      const sheet = page.getByTestId('call-notes-lines');
      await expect(sheet).toBeVisible();
      await expect(sheet.getByText('Hi Noor, the contract is signed.').first()).toBeVisible();
      await expect(sheet.getByText('You').first()).toBeVisible();
      await expect(sheet.getByText('Sam Rivera').first()).toBeVisible();
      await page.screenshot({ path: 'e2e/screenshots/desktop-call-notes-sheet.png' });

      // Noor deletes her own words, a turn at a time (M17 F8a); Sam's stay.
      const mine = await page.getByTestId('call-notes-delete').count();
      expect(mine).toBeGreaterThan(0);
      const theirs = await sheet.getByText('Sam Rivera').count();
      await page.getByTestId('call-notes-delete').first().click();
      await expect(page.getByTestId('call-notes-delete')).toHaveCount(mine - 1);
      await expect(sheet.getByText('Sam Rivera').first()).toBeVisible();
      expect(await sheet.getByText('Sam Rivera').count()).toBeLessThanOrEqual(theirs);
      expect(problems(noor, sam)).toEqual([]);
    });

    test('a ring answered without Cai never starts it', async () => {
      const { page } = noor;
      await page.goto(`/c/${convo}`);
      await sam.page.goto('/');
      await page.getByTestId('call-voice').click();
      await expect(sam.page.getByTestId('call-incoming')).toBeVisible();
      await page.getByTestId('call-notes').click();
      await page.getByTestId('call-notes-take').click();
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

    test('recorded: asked as itself, the voices and a shown screen kept, played, deleted for everyone', async () => {
      test.setTimeout(180_000);
      const { page } = noor;
      await page.goto(`/c/${convo}`);
      await sam.page.goto('/');
      await page.getByTestId('call-voice').click();
      await expect(sam.page.getByTestId('call-incoming')).toBeVisible();

      // Noor asks Cai to record: the ring says what's kept, and its Answer says it records.
      // Cai offers both, each saying what it keeps.
      await page.getByTestId('call-notes').click();
      await expect(page.getByTestId('call-notes-record')).toContainText('kept 30 days');
      await page.getByTestId('call-notes-record').click();
      await expect(page.getByTestId('call-notes-asking')).toHaveText(
        'Asking Sam to let Cai record',
      );
      await expect(sam.page.getByTestId('call-incoming-notes')).toHaveText(
        'Noor asks Cai to record this call: the voices and any screen shown, kept 30 days for everyone in it.',
      );
      await expect(sam.page.getByTestId('call-accept-with-notes')).toHaveAccessibleName(
        'Answer, Cai records',
      );
      await sam.page.screenshot({ path: 'e2e/screenshots/desktop-call-record-ring.png' });
      await sam.page.getByTestId('call-accept-with-notes').click();
      await expect(page.getByTestId('call-notes-on')).toHaveText('Cai is recording', {
        timeout: 20_000,
      });
      await expect(sam.page.getByTestId('call-notes-on')).toHaveText('Cai is recording');

      const callId = await page.evaluate(async (c) => {
        const r = await fetch('/v1/calls/live', { headers: { 'x-caime-client': 'web' } });
        const { call } = (await r.json()) as { call: { id: string; conversationId: string } };
        return call.conversationId === c ? call.id : '';
      }, convo);
      expect(callId).not.toBe('');
      type Part = { kind: string; state: string; bytes: number; durationMs: number | null };
      const recording = () =>
        page.request
          .get(`/v1/calls/${callId}/notes`, { headers: CLIENT })
          .then((r) => r.json())
          .then((b: { recording: { state: string; parts: Part[] } | null }) => b.recording);

      // Noor shows her screen: a part of its own, beside the voices, each sent in pieces.
      await page.getByTestId('call-share').click();
      await expect(sam.page.getByTestId('call-theirs')).toContainText('sharing their screen');
      await page.screenshot({ path: 'e2e/screenshots/desktop-call-recording.png' });
      await expect
        .poll(
          async () => {
            const parts = (await recording())?.parts ?? [];
            return ['voices', 'screen'].every((k) =>
              parts.some((p) => p.kind === k && p.bytes > 0),
            );
          },
          { timeout: 40_000 },
        )
        .toBe(true);
      await page.getByTestId('call-share').click();
      await page.getByTestId('call-hangup').click();
      await expect(page.getByTestId('call-screen')).toHaveCount(0);

      // Made seekable once over, both play them from the notes.
      await expect
        .poll(async () => (await recording())?.parts.map((p) => p.state), { timeout: 45_000 })
        .toEqual(['ready', 'ready']);
      await page.getByTestId('call-notes-open').first().click();
      const voices = page.getByTestId('call-recording-voices');
      await expect(voices).toBeVisible();
      await expect(page.getByTestId('call-recording-screen')).toBeVisible();
      await expect(page.getByTestId('call-recording-until')).toBeVisible();
      // Its length comes from its own index: it seeks without being played through.
      const length = await voices.evaluate(
        (el: HTMLMediaElement) =>
          new Promise<number>((done) => {
            if (el.readyState >= 1) done(el.duration);
            else el.addEventListener('loadedmetadata', () => done(el.duration), { once: true });
          }),
      );
      expect(Number.isFinite(length)).toBe(true);
      expect(length).toBeGreaterThan(5);
      // A line of the notes, and a topic of Cai's write-up, open the voices at their moment
      // (M17 I13c).
      const playsFrom = async (testID: string) => {
        const from = page.getByTestId(testID).first();
        await expect(from).toBeVisible({ timeout: 30_000 });
        await from.click();
        await expect
          .poll(() => voices.evaluate((el: HTMLMediaElement) => !el.paused && el.currentTime > 0))
          .toBe(true);
        await voices.evaluate((el: HTMLMediaElement) => el.pause());
      };
      await playsFrom('call-notes-play-from');
      await playsFrom('call-notes-topic-play');
      await page.screenshot({ path: 'e2e/screenshots/desktop-call-recording-sheet.png' });
      // What a part takes, an hour of it, as recorded here (the fake camera's moving pattern is
      // the worst a screen does; a still sheet takes far less).
      const sizes = ((await recording())?.parts ?? []).map((p) => ({
        kind: p.kind,
        seconds: (p.durationMs ?? 0) / 1000,
        mbAnHour: p.durationMs
          ? Math.round(((p.bytes * 3600) / (p.durationMs / 1000) / 1e6) * 10) / 10
          : null,
      }));
      test.info().annotations.push({ type: 'recording sizes', description: JSON.stringify(sizes) });
      console.log('recording sizes', JSON.stringify(sizes));

      // Noor, who asked, keeps it past its day against their storage, then stops keeping it
      // (M17 I13d); Sam, who didn't ask, is offered neither.
      await page.getByTestId('call-recording-keep').click();
      await expect(page.getByTestId('call-recording-kept')).toHaveText(
        'Kept against your storage.',
      );
      await expect(page.getByTestId('call-recording-until')).toHaveCount(0);
      await page.getByTestId('call-recording-let-go').click();
      await expect(page.getByTestId('call-recording-until')).toBeVisible();
      await expect(page.getByTestId('call-recording-kept')).toHaveCount(0);

      // Sam deletes it for everyone; the notes stay.
      await sam.page.goto(`/c/${convo}`);
      await sam.page.getByTestId('call-notes-open').first().click();
      await expect(sam.page.getByTestId('call-recording-until')).toBeVisible();
      await expect(sam.page.getByTestId('call-recording-keep')).toHaveCount(0);
      await sam.page.getByTestId('call-recording-delete').click();
      await sam.page.getByTestId('call-recording-delete-confirm').click();
      await expect(sam.page.getByTestId('call-recording-deleted')).toBeVisible();
      await expect(page.getByTestId('call-recording-deleted')).toBeVisible({ timeout: 20_000 });
      expect((await recording())?.state).toBe('deleted');
      expect(problems(noor, sam)).toEqual([]);
    });
  });
