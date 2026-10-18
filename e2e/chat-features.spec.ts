/**
 * R88 on a phone: each place keeps its head while its list scrolls, finds what's typed among its
 * own list at once (Arabic as it's folded), and hands the words to Search or to Cai; the
 * composer is one line high and grows to five, no more; and a conversation's photos, files,
 * camera and stickers work end to end: sent from the phone, seen on the other side, a photo
 * opened full screen in Caime and paged through, a file opened with the session.
 */
import { randomUUID } from 'node:crypto';
import { type BrowserContext, expect, type Page, test } from '@playwright/test';
import { apiSignUp, CLIENT, newPerson, photo, visible } from './helpers';

const suffix = Math.random().toString(36).slice(2, 7);
const AI_STUB = `http://127.0.0.1:${Number(process.env.E2E_AI_STUB_PORT ?? 8799)}`;

test.describe
  .serial('the places and the conversation on a phone (R88)', () => {
    let noorCtx: BrowserContext;
    let alexCtx: BrowserContext;
    let noor: { page: Page; errors: string[] };
    let alex: { page: Page; errors: string[] };
    let convo: string;

    test.beforeAll(async ({ browser }) => {
      // A phone: its size, and a finger (a coarse pointer, which offers the camera).
      noorCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
      alexCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const n = await apiSignUp(noorCtx, 'Noor Places', `noor.places.${suffix}`);
      const a = await apiSignUp(alexCtx, 'Alex Places', `alex.places.${suffix}`);
      const asked = await alexCtx.request.post('/v1/connections/requests', {
        headers: CLIENT,
        data: { toUserId: n.id, relationship: { sphere: 'work', role: 'colleague' } },
      });
      const { requestId } = (await asked.json()) as { requestId: string };
      const accepted = await noorCtx.request.post(`/v1/connections/requests/${requestId}/accept`, {
        headers: CLIENT,
        data: {},
      });
      convo = ((await accepted.json()) as { conversationId: string }).conversationId;
      // Enough conversations that Chats scrolls on a phone, one of them named in Arabic.
      const names = [
        'أحمد والأصدقاء',
        'Garden club',
        ...Array.from({ length: 12 }, (_, i) => `Book club ${i + 1}`),
      ];
      for (const title of names) {
        const made = await noorCtx.request.post('/v1/conversations', {
          headers: CLIENT,
          data: { kind: 'group', title, memberIds: [a.id] },
        });
        expect(made.ok(), await made.text()).toBe(true);
      }
      const said = await alexCtx.request.post(`/v1/conversations/${convo}/messages`, {
        headers: CLIENT,
        data: { clientId: randomUUID(), body: 'The venue contract is signed.' },
      });
      expect(said.ok(), await said.text()).toBe(true);
      // Noor is an adult with AI assist on: Cai can be asked.
      const on = await noorCtx.request.patch('/v1/me', {
        headers: CLIENT,
        data: { aiEnabled: true },
      });
      expect(on.ok(), await on.text()).toBe(true);
      noor = await newPerson(noorCtx);
      alex = await newPerson(alexCtx);
    });

    test.afterAll(async () => {
      await noorCtx.close();
      await alexCtx.close();
    });

    test('Chats keeps its head as the list scrolls, and finds what’s typed in it', async () => {
      const { page } = noor;
      await page.goto('/chats');
      await page.getByTestId('inbox-all').filter({ visible: true }).click();
      await expect(visible(page, 'Book club 12')).toBeVisible();
      const head = page.getByTestId('page-head').filter({ visible: true });
      const before = await head.boundingBox();
      // Scrolled well down: the search and the chips went with the list, the head stayed.
      await page.mouse.move(195, 600);
      await page.mouse.wheel(0, 3000);
      await expect(page.getByTestId('chats-search').filter({ visible: true })).not.toBeInViewport();
      expect(await head.boundingBox()).toEqual(before);
      await expect(page.getByTestId('new-chat').filter({ visible: true })).toBeInViewport();
      await page.screenshot({ path: 'e2e/screenshots/phone-chats-scrolled.png' });
      await page.mouse.wheel(0, -3000);

      // What's typed finds among every conversation at once, on the device; Arabic as folded.
      const search = page.getByTestId('chats-search').filter({ visible: true });
      await search.fill('garden');
      await expect(visible(page, 'Garden club')).toBeVisible();
      await expect(page.getByText('Book club 3').filter({ visible: true })).toHaveCount(0);
      await search.fill('احمد');
      await expect(visible(page, 'أحمد والأصدقاء')).toBeVisible();
      await expect(page.getByText('Garden club').filter({ visible: true })).toHaveCount(0);
      await search.fill('nothing like this');
      await expect(page.getByTestId('chats-search-none').filter({ visible: true })).toBeVisible();
      await page.screenshot({ path: 'e2e/screenshots/phone-chats-search.png' });

      // The same words search everything.
      await search.fill('venue');
      await page.getByTestId('chats-search-everything').filter({ visible: true }).click();
      await page.waitForURL('**/search?q=venue');
      await expect(page.getByTestId('search-input')).toHaveValue('venue');
      await expect(
        page.getByRole('button', { name: /^Alex Places, / }).filter({ hasText: /venue/ }),
      ).toBeVisible();
      expect(noor.errors).toEqual([]);
    });

    test('Ask Cai from Chats answers in Search at once, asked once', async () => {
      const { page } = noor;
      await page.request.delete(`${AI_STUB}/requests`);
      await page.goto('/chats');
      const search = page.getByTestId('chats-search').filter({ visible: true });
      await search.fill('where is the venue contract?');
      await page.getByTestId('chats-search-ask').filter({ visible: true }).click();
      await page.waitForURL(/\/search\?q=.*&ask=1$/);
      const answer = page.getByTestId('search-cai-answer').filter({ visible: true });
      await expect(answer).toContainText('It says: The venue contract is signed.');
      const calls = (await (await page.request.get(`${AI_STUB}/requests`)).json()) as {
        calls: string[];
      };
      expect(calls.calls.filter((c) => c === 'search-answer')).toHaveLength(1);
      await page.screenshot({ path: 'e2e/screenshots/phone-ask-cai-from-chats.png' });
      expect(noor.errors).toEqual([]);
    });

    test('People finds someone as typed, whatever the chips say', async () => {
      const { page } = noor;
      await page.goto('/people');
      const search = page.getByTestId('people-search').filter({ visible: true });
      await search.fill('ALEX');
      await expect(
        page.getByRole('button', { name: /^Alex Places/ }).filter({ visible: true }),
      ).toBeVisible();
      await search.fill('nobody here');
      await expect(visible(page, 'No one matches.')).toBeVisible();
      await page.getByTestId('people-search-clear').filter({ visible: true }).click();
      await expect(search).toHaveValue('');
      expect(noor.errors).toEqual([]);
    });

    test('the composer is a line high, grows to five lines and scrolls after that', async () => {
      const { page } = noor;
      await page.goto(`/c/${convo}`);
      const row = page.getByTestId('composer-row').filter({ visible: true });
      const input = page.getByTestId('composer-input').filter({ visible: true });
      await expect(input).toBeVisible();
      // One line: the 40-point box, with its padding.
      expect((await row.boundingBox())?.height).toBeLessThanOrEqual(54);
      expect((await input.boundingBox())?.height).toBeLessThanOrEqual(41);
      // Twelve lines: five shown, the rest scrolled inside it.
      await input.fill(Array.from({ length: 12 }, (_, i) => `Line ${i + 1}`).join('\n'));
      await expect.poll(async () => (await input.boundingBox())?.height ?? 0).toBeGreaterThan(100);
      expect((await input.boundingBox())?.height).toBeLessThanOrEqual(22 * 5 + 18 + 1);
      await page.screenshot({ path: 'e2e/screenshots/phone-composer-five-lines.png' });
      await input.fill('');
      await expect.poll(async () => (await input.boundingBox())?.height ?? 0).toBeLessThan(42);
      expect(noor.errors).toEqual([]);
    });

    test('photos sent from the phone arrive, open full screen in Caime and page through', async () => {
      const { page } = noor;
      await page.goto(`/c/${convo}`);
      await alex.page.goto(`/c/${convo}`);
      await page.getByTestId('composer-attach').filter({ visible: true }).click();
      const chooser = page.waitForEvent('filechooser');
      await page.getByTestId('attach-photos').click();
      await (await chooser).setFiles([
        {
          name: 'dunes.png',
          mimeType: 'image/png',
          buffer: photo(800, 600, [233, 196, 106], [214, 79, 60]),
        },
        {
          name: 'sea.png',
          mimeType: 'image/png',
          buffer: photo(600, 800, [120, 180, 200], [40, 70, 130]),
        },
      ]);
      const mine = page.getByTestId('message-photo').filter({ visible: true });
      await expect(mine).toHaveCount(2);
      // The other side sees both, drawn.
      const theirs = alex.page.getByTestId('message-photo').filter({ visible: true });
      await expect(theirs).toHaveCount(2);
      await expect
        .poll(() =>
          theirs
            .first()
            .locator('img')
            .evaluate((i: HTMLImageElement) => i.naturalWidth),
        )
        .toBeGreaterThan(0);

      // Full screen in Caime, with the session: the photo, its count, the next one.
      await mine.first().click();
      const viewer = page.getByTestId('photo-viewer');
      await expect(viewer).toBeVisible();
      await expect(page.getByTestId('photo-viewer-count')).toHaveText('1 of 2');
      await expect
        .poll(() =>
          page
            .getByTestId('photo-viewer')
            .locator('img')
            .last()
            .evaluate((i: HTMLImageElement) => i.naturalWidth),
        )
        .toBeGreaterThan(0);
      await page.screenshot({ path: 'e2e/screenshots/phone-photo-viewer.png' });
      await page.getByTestId('photo-viewer-next').click();
      await expect(page.getByTestId('photo-viewer-count')).toHaveText('2 of 2');
      await expect(viewer).toContainText('sea.png');
      await page.keyboard.press('Escape');
      await expect(viewer).toHaveCount(0);
      expect([...noor.errors, ...alex.errors]).toEqual([]);
    });

    test('a video sent from the phone plays where it is, and Chats says it’s a video (M16 E4b)', async () => {
      const { page } = noor;
      await page.goto(`/c/${convo}`);
      await alex.page.goto(`/c/${convo}`);
      // A second of a real video, made by the browser itself: a canvas recorded as WebM.
      const bytes = await page.evaluate(async () => {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 48;
        const g = canvas.getContext('2d');
        if (!g) throw new Error('no canvas');
        const recorder = new MediaRecorder(canvas.captureStream(10), { mimeType: 'video/webm' });
        const chunks: Blob[] = [];
        recorder.ondataavailable = (e) => chunks.push(e.data);
        const stopped = new Promise((done) => {
          recorder.onstop = done;
        });
        recorder.start();
        for (let i = 0; i < 10; i++) {
          g.fillStyle = `hsl(${i * 36}, 80%, 50%)`;
          g.fillRect(0, 0, 64, 48);
          await new Promise((done) => setTimeout(done, 100));
        }
        recorder.stop();
        await stopped;
        return Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer()));
      });
      await page.getByTestId('composer-attach').filter({ visible: true }).click();
      await expect(page.getByTestId('attach-photos')).toContainText('Photos and videos');
      const chooser = page.waitForEvent('filechooser');
      await page.getByTestId('attach-photos').click();
      await (await chooser).setFiles([
        { name: 'river.webm', mimeType: 'video/webm', buffer: Buffer.from(bytes) },
      ]);
      // It plays where it is, for both of them, from Caime's own address.
      for (const p of [page, alex.page]) {
        const video = p.getByTestId('message-video').filter({ visible: true }).last();
        await expect(video).toBeVisible({ timeout: 20_000 });
        await expect(video).toHaveAttribute('src', /\/v1\/files\//);
        await expect
          .poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState), { timeout: 15_000 })
          .toBeGreaterThan(0);
      }
      // Chats says what it is.
      await alex.page.goto('/chats');
      await expect(alex.page.getByText('🎥 Video').filter({ visible: true }).first()).toBeVisible();
      expect([...noor.errors, ...alex.errors]).toEqual([]);
    });

    test('a photo taken with the camera, a file and a sticker arrive too', async () => {
      const { page } = noor;
      // The camera: on a phone's browser, the camera's own chooser.
      await page.getByTestId('composer-attach').filter({ visible: true }).click();
      const shot = page.waitForEvent('filechooser');
      await page.getByTestId('attach-camera').click();
      const camera = await shot;
      expect(await camera.element().getAttribute('capture')).toBe('environment');
      await camera.setFiles({
        name: 'image.jpg',
        mimeType: 'image/png',
        buffer: photo(640, 480, [150, 200, 140], [60, 120, 90]),
      });
      await expect(alex.page.getByTestId('message-photo').filter({ visible: true })).toHaveCount(3);

      // A file: the other side opens it in a tab of its own, with the session.
      await page.getByTestId('composer-attach').filter({ visible: true }).click();
      const chooser = page.waitForEvent('filechooser');
      await page.getByTestId('attach-file').click();
      await (await chooser).setFiles({
        name: 'venue-contract.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('%PDF-1.4\n% the venue contract\n%%EOF\n'),
      });
      const file = alex.page.getByTestId('message-file').filter({ visible: true });
      await expect(file).toContainText('venue-contract.pdf');
      const fetched = alexCtx.waitForEvent('response', (r) =>
        /\/v1\/files\/[0-9a-f-]+$/.test(r.url()),
      );
      const opened = alexCtx.waitForEvent('page');
      await file.click();
      const tab = await opened;
      // A browser shows it in its viewer; headless Chromium has none and saves it, closing the
      // tab. Either way it was asked for with the session and came back as the PDF.
      const res = await fetched;
      expect(res.status()).toBe(200);
      expect(res.headers()['content-type']).toContain('application/pdf');
      if (!tab.isClosed()) await tab.close();

      // A sticker, from inside the box.
      await page.getByTestId('composer-stickers').filter({ visible: true }).click();
      await page.getByLabel('Send sticker: Caishy smiling').click();
      await expect(
        alex.page.getByRole('img', { name: 'Caishy smiling' }).filter({ visible: true }),
      ).toBeVisible();
      await page.screenshot({ path: 'e2e/screenshots/phone-conversation-media.png' });
      expect([...noor.errors, ...alex.errors]).toEqual([]);
    });
  });
