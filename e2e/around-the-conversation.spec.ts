/**
 * What surrounds a conversation, end to end: a relationship that changes and keeps its history,
 * search that opens the message it found, stickers, a message written offline that sends when
 * the network returns, actions and alerts, spaces, organizations, settings that follow you, and AI
 * assist. One pair of people is shared by these tests (sign-ups are rate limited per address), so
 * they run in order.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { type BrowserContext, expect, type Page, request, test } from '@playwright/test';
import {
  ADMIN_TOKEN,
  apiSignUp,
  CLIENT,
  METRICS_TOKEN,
  newPerson,
  PASSWORD,
  photo,
  publishTxt,
  visible,
} from './helpers';

const stamp = Date.now().toString(36).slice(-6);
/** The Messages API stand-in the server talks to (playwright.config.ts). */
const AI_STUB_REQUESTS = `http://127.0.0.1:${Number(process.env.E2E_AI_STUB_PORT ?? 8799)}/requests`;

test.describe
  .serial('around the conversation', () => {
    let noorContext: BrowserContext;
    let alexContext: BrowserContext;
    let noor: { page: Page; errors: string[] };
    let alex: { page: Page; errors: string[] };
    let noorId: string;
    let alexId: string;
    let convo: string;
    /** Someone new, from the link test on: the organization's customer. */
    let linaContext: BrowserContext | undefined;
    let lina: { page: Page; errors: string[] };

    test.beforeAll(async ({ browser }) => {
      noorContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      alexContext = await browser.newContext({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
      });
      noorId = (await apiSignUp(noorContext, 'Noor Haddad', `noor.${stamp}`)).id;
      alexId = (await apiSignUp(alexContext, 'Alex Chen', `alex.${stamp}`)).id;
      const request = await noorContext.request.post('/v1/connections/requests', {
        headers: CLIENT,
        data: {
          toUserId: alexId,
          relationship: { sphere: 'work', role: 'colleague', orgName: 'DATA C' },
        },
      });
      const { requestId } = await request.json();
      const accepted = await alexContext.request.post(
        `/v1/connections/requests/${requestId}/accept`,
        { headers: CLIENT, data: {} },
      );
      convo = (await accepted.json()).conversationId;
      noor = await newPerson(noorContext);
      alex = await newPerson(alexContext);
    });

    test.afterAll(async () => {
      await noorContext?.close();
      await alexContext?.close();
      await linaContext?.close();
    });

    test('a relationship changes, and its history says how', async () => {
      const { page, errors } = noor;
      await page.goto(`/p/${alexId}`);
      await expect(visible(page, 'Colleague · DATA C')).toBeVisible();
      await expect(visible(page, 'Added “Colleague · DATA C”')).toBeVisible();
      await page.getByRole('button', { name: 'Change', exact: true }).click();
      await page.getByRole('button', { name: 'Manager', exact: true }).click();
      await page.getByTestId('relationship-save').click();
      await expect(visible(page, '“Colleague · DATA C” became “Manager · DATA C”')).toBeVisible();
      await expect(visible(page, 'Manager · DATA C')).toBeVisible();
      // One change is one line, not an addition and a change.
      await expect(page.getByText('Added “Manager · DATA C”')).toHaveCount(0);
      await expect(page.getByText('How do you know Alex?')).toBeHidden();
      await page.screenshot({ path: 'e2e/screenshots/desktop-person-history.png' });
      expect(errors).toEqual([]);
    });

    test('search finds a message and opens the conversation at it', async () => {
      const { page, errors } = noor;
      // The one to find, then enough after it that it's out of view and off the first page.
      const found = 'The venue contract is signed';
      for (const body of [found, ...Array.from({ length: 55 }, (_, i) => `Update ${i + 1}`)]) {
        const res = await alexContext.request.post(`/v1/conversations/${convo}/messages`, {
          headers: CLIENT,
          data: { clientId: randomUUID(), body },
        });
        expect(res.ok()).toBe(true);
      }
      await page.goto('/search');
      await page.getByTestId('search-input').fill('venue');
      // Matches are emphasised in the snippet, and no marker shows.
      const hit = page.getByRole('button', { name: new RegExp(`^Alex Chen, ${found} · `) });
      await expect(hit.locator('text=venue').first()).toBeVisible();
      await expect(page.getByText(/[«»\uE000\uE001]/)).toHaveCount(0);
      await hit.click();
      await page.waitForURL(`**/c/${convo}?seq=*`);
      const message = page.getByTestId('message-highlighted');
      await expect(message).toContainText(found);
      await expect(message).toBeInViewport();
      expect(errors).toEqual([]);
    });

    test('a sticker arrives live', async () => {
      await alex.page.goto(`/c/${convo}`);
      await noor.page.goto(`/c/${convo}`);
      await expect(visible(alex.page, 'Update 55')).toBeVisible();
      await noor.page.getByRole('button', { name: 'Stickers', exact: true }).click();
      await noor.page.getByLabel('Send sticker: Caishy smiling').click();
      await expect(
        alex.page.getByRole('img', { name: 'Caishy smiling' }).filter({ visible: true }),
      ).toBeVisible();
      await alex.page.screenshot({ path: 'e2e/screenshots/phone-sticker.png' });
      expect([...noor.errors, ...alex.errors]).toEqual([]);
    });

    test('a message written offline sends when the network returns', async () => {
      const { page } = alex;
      await alexContext.setOffline(true);
      await expect(visible(page, /^Offline\./)).toBeVisible();
      await page.getByTestId('composer-input').fill('Sent from the tunnel');
      await page.getByTestId('composer-send').click();
      await expect(visible(page, 'Offline. 1 message will send when you’re back.')).toBeVisible();
      await expect(
        page.getByLabel(/Sent from the tunnel, .*(queued|sending)$/).filter({ visible: true }),
      ).toBeVisible();
      await alexContext.setOffline(false);
      await expect(visible(noor.page, 'Sent from the tunnel')).toBeVisible();
      await expect(
        page.getByLabel(/Sent from the tunnel, .*(sent|delivered|read)$/).filter({ visible: true }),
      ).toBeVisible();
      await expect(page.getByText(/^Offline\./).filter({ visible: true })).toHaveCount(0);
      // While offline the browser logs the failed requests; nothing else may go wrong.
      const offlineNoise = /ERR_INTERNET_DISCONNECTED|WebSocket|Failed to load resource/;
      expect(alex.errors.filter((e) => !offlineNoise.test(e))).toEqual([]);
      alex.errors.length = 0; // The page lives on into the next tests; its offline noise doesn't.
      expect(noor.errors).toEqual([]);
    });

    test('a message sent while the page is still connecting arrives', async () => {
      // Hold the socket back until after a message is sent: the first page was read before it,
      // and the socket wasn't listening yet, so only catching up on connect can bring it.
      const { page, errors } = await newPerson(noorContext);
      let release = () => {};
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      await page.routeWebSocket(/\/v1\/realtime/, async (ws) => {
        await held;
        ws.connectToServer();
      });
      const firstPage = page.waitForResponse(
        (r) => r.url().includes(`/v1/conversations/${convo}/messages`) && r.ok(),
      );
      await page.goto(`/c/${convo}`);
      await firstPage;
      const body = `Sent while connecting ${stamp}`;
      const sent = await alexContext.request.post(`/v1/conversations/${convo}/messages`, {
        headers: CLIENT,
        data: { clientId: randomUUID(), body },
      });
      expect(sent.ok()).toBe(true);
      release();
      await expect(visible(page, body)).toBeVisible();
      await page.close();
      expect(errors).toEqual([]);
    });

    test('an action is added, finished and undone; a request lands in Actions and Alerts', async () => {
      const { page, errors } = noor;
      await page.goto('/actions');
      await page.getByTestId('add-task').click();
      await page.getByLabel('What needs doing').fill('Renew passport by Friday');
      await expect(visible(page, /^From “.*Friday”$/)).toBeVisible();
      await page.getByRole('button', { name: 'Add', exact: true }).click();
      const done = page.getByRole('checkbox', { name: 'Complete Renew passport by Friday' });
      await expect(done).toBeVisible();
      await done.click();
      await expect(visible(page, 'Nothing on your plate')).toBeVisible();
      await page.getByRole('button', { name: 'Undo', exact: true }).click();
      await expect(done).toBeVisible();

      // Alex asks Noor for something in their conversation.
      const asked = await alexContext.request.post('/v1/tasks', {
        headers: CLIENT,
        data: {
          title: 'Review the venue floor plan',
          assigneeId: noorId,
          shared: true,
          conversationId: convo,
        },
      });
      expect(asked.ok(), await asked.text()).toBe(true);
      await page.getByRole('tab', { name: /^Asked me, 1$/ }).click();
      await expect(visible(page, 'Review the venue floor plan')).toBeVisible();
      await expect(visible(page, 'Alex Chen asked you')).toBeVisible();

      // And it's in Alerts, which reads it.
      await page.getByRole('link', { name: /^Alerts, \d+$/ }).click();
      await expect(visible(page, 'Alex Chen asked you')).toBeVisible();
      await expect(page.getByRole('link', { name: 'Alerts', exact: true })).toBeVisible();
      await page.screenshot({ path: 'e2e/screenshots/desktop-alerts.png' });
      expect(errors).toEqual([]);
    });

    test('the keyboard moves between conversations, edits, searches and lists its shortcuts', async () => {
      const { page, errors } = noor;
      // A second conversation with Alex (a topic), so there is somewhere to move to.
      const topic = await noorContext.request.post('/v1/conversations', {
        headers: CLIENT,
        data: { kind: 'direct', userId: alexId, title: 'Venue' },
      });
      expect(topic.ok(), await topic.text()).toBe(true);
      const topicId: string = (await topic.json()).conversation.id;
      await noorContext.request.post(`/v1/conversations/${topicId}/messages`, {
        headers: CLIENT,
        data: { clientId: randomUUID(), body: 'Floor plan attached soon' },
      });
      const inbox = await (await noorContext.request.get('/v1/inbox')).json();
      const order: string[] = inbox.sections.flatMap((s: any) => s.items.map((i: any) => i.id));
      expect(order).toEqual(expect.arrayContaining([convo, topicId]));

      // Alt+↓ and Alt+↑ walk the inbox in its order, even from the message box.
      const path = () => new URL(page.url()).pathname;
      await page.goto(`/c/${order[0]}`);
      await page.getByTestId('composer-input').click();
      await page.keyboard.press('Alt+ArrowDown');
      await expect.poll(path).toBe(`/c/${order[1]}`);
      await page.keyboard.press('Alt+ArrowUp');
      await expect.poll(path).toBe(`/c/${order[0]}`);

      // ↑ in an empty message box edits the last message you sent.
      await page.goto(`/c/${topicId}`);
      const box = page.getByTestId('composer-input');
      await box.click();
      await page.keyboard.press('ArrowUp');
      await expect(page.getByLabel('Edit message')).toHaveValue('Floor plan attached soon');
      await box.fill('Floor plan attached');
      await page.keyboard.press('Enter');
      await expect(visible(page, 'Floor plan attached')).toBeVisible();
      await expect(page.getByText('Floor plan attached soon')).toHaveCount(0);

      // ? lists the shortcuts (outside a text field); Ctrl+K opens search.
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await page.keyboard.press('Shift+Slash');
      await expect(visible(page, 'Keyboard shortcuts')).toBeVisible();
      await expect(visible(page, 'Previous conversation')).toBeVisible();
      await page.waitForTimeout(400); // the fade-in, for the screenshot only
      await page.screenshot({ path: 'e2e/screenshots/desktop-shortcuts.png' });
      // Escape closes it once its fade-in has finished (react-native-web's Modal).
      await expect(async () => {
        await page.keyboard.press('Escape');
        await expect(page.getByText('Previous conversation')).toBeHidden({ timeout: 500 });
      }).toPass();
      await page.keyboard.press('Control+KeyK');
      await expect.poll(path).toBe('/search');
      await expect(page.getByTestId('search-input')).toBeFocused();
      expect(errors).toEqual([]);
    });

    test('a card fits the relationship, and moves when the other person answers it', async () => {
      await noor.page.goto(`/c/${convo}`);
      await alex.page.goto(`/c/${convo}`);
      const { page } = noor;
      await page.getByRole('button', { name: 'Share a photo, a file or a card' }).click();
      // Noor knows Alex from work: Approval and Review are offered, invoices are not.
      await expect(page.getByTestId('kit-option-approval')).toBeVisible();
      await expect(page.getByTestId('kit-option-document_review')).toBeVisible();
      await expect(page.getByTestId('kit-option-invoice')).toHaveCount(0);
      await page.getByTestId('kit-option-meeting').click();
      await page.getByLabel('Title').fill('Venue walkthrough');
      await page.getByLabel('When').fill('Friday 3pm');
      await expect(visible(page, /^Fri, .*3:00/)).toBeVisible();
      await page.getByRole('button', { name: '45 min', exact: true }).click();
      await page.getByLabel('Where (optional)').fill('Cairo Opera House');
      await page.getByTestId('kit-send').click();

      const mine = page.getByTestId('kit-meeting').filter({ hasText: 'Venue walkthrough' });
      await expect(mine).toContainText('Proposed');
      await expect(mine).toContainText('45 min');
      // Noor proposed it; only Alex can answer.
      await expect(mine.getByRole('button', { name: 'Accept' })).toHaveCount(0);

      const theirs = alex.page
        .getByTestId('kit-meeting')
        .filter({ hasText: 'Venue walkthrough', visible: true });
      await theirs.getByRole('button', { name: 'Accept', exact: true }).click();
      await expect(theirs).toContainText('Accepted');
      await expect(mine).toContainText('Accepted');
      await page.screenshot({ path: 'e2e/screenshots/desktop-kit-meeting.png' });
      await alex.page.screenshot({ path: 'e2e/screenshots/phone-kit-meeting.png' });
      expect([...noor.errors, ...alex.errors]).toEqual([]);
    });

    test('on a phone, the details open from the header; disappearing messages are announced', async () => {
      await noor.page.goto(`/c/${convo}`);
      const { page } = alex;
      await page.goto(`/c/${convo}`);
      await page.getByRole('button', { name: /, details$/ }).click();
      await expect(visible(page, 'About this conversation')).toBeVisible();
      await page.getByRole('radio', { name: '7 days', exact: true }).click();
      await expect(visible(page, 'Messages disappear after 7 days')).toBeVisible();
      await page.screenshot({ path: 'e2e/screenshots/phone-details.png' });
      await page.getByRole('button', { name: 'Close panel' }).click();
      await expect(visible(page, 'You set messages to disappear after 7 days')).toBeVisible();
      await expect(
        visible(noor.page, 'Alex Chen set messages to disappear after 7 days'),
      ).toBeVisible();
      expect([...noor.errors, ...alex.errors]).toEqual([]);
    });

    test('the Minimal style swaps the characters for simple icons', async () => {
      const { page, errors } = alex;
      await page.goto('/search');
      await expect(page.getByTestId('guide-character').filter({ visible: true })).toBeVisible();
      await page.goto('/settings/appearance');
      await page.getByRole('radio', { name: /^Minimal,/ }).click();
      await page.goto('/search');
      await expect(page.getByTestId('guide-icon').filter({ visible: true })).toBeVisible();
      await expect(page.getByTestId('guide-character')).toHaveCount(0);
      await page.screenshot({ path: 'e2e/screenshots/phone-search-minimal.png' });
      await page.goto('/actions');
      await page.getByRole('tab', { name: /^Done/ }).click();
      await expect(visible(page, 'Nothing finished yet')).toBeVisible();
      await expect(page.getByTestId('guide-icon').filter({ visible: true })).toBeVisible();
      await page.screenshot({ path: 'e2e/screenshots/phone-actions-minimal.png' });
      expect(errors).toEqual([]);
    });

    test('Arabic messages align right, English left', async () => {
      const arabic = 'هل تستطيع إرسال التقرير غدًا؟';
      const english = 'Can you send the report tomorrow?';
      await noor.page.goto(`/c/${convo}`);
      for (const body of [arabic, english]) {
        const sent = await alexContext.request.post(`/v1/conversations/${convo}/messages`, {
          headers: CLIENT,
          data: { clientId: randomUUID(), body },
        });
        expect(sent.ok(), await sent.text()).toBe(true);
      }
      // The browser finds the direction itself (dir="auto"); the alignment is ours, and it is
      // what iOS needs, where text otherwise aligns to the device's language.
      const align = async (text: string) => {
        const el = visible(noor.page, text);
        await expect(el).toBeVisible();
        return el.evaluate((node) => getComputedStyle(node).textAlign);
      };
      expect(await align(arabic)).toBe('right');
      expect(await align(english)).not.toBe('right');
      expect(noor.errors).toEqual([]);
    });

    test('a space keeps a team together: its people, General, and conversations for everyone', async () => {
      const { page, errors } = noor;
      await page.goto('/spaces');
      await expect(visible(page, 'Keep a group together')).toBeVisible();
      await page.getByTestId('spaces-new').click();
      await page.getByTestId('space-name').fill('Venue team');
      await page.getByTestId('space-kind-team').click();
      await page.getByTestId(`pick-alex.${stamp}`).click();
      await page.getByTestId('space-create').click();
      await expect(visible(page, 'Team · 2 people')).toBeVisible();
      await expect(page.getByTestId('space-conversation-General')).toContainText(
        'You started the space “Venue team”',
      );

      // On the phone it's under Spaces; Alex starts a conversation for everyone in it.
      const phone = alex.page;
      await phone.goto('/spaces');
      await phone.getByTestId('space-row-Venue team').filter({ visible: true }).click();
      await phone.getByTestId('space-new-conversation').filter({ visible: true }).click();
      await phone.getByTestId('space-conversation-title').fill('Budget');
      await phone.getByTestId('space-conversation-create').click();
      await expect(visible(phone, 'Venue team · Budget')).toBeVisible();
      // A team's conversations offer work cards, as a colleague's would.
      await phone.getByRole('button', { name: 'Share a photo, a file or a card' }).click();
      await expect(phone.getByTestId('kit-option-approval')).toBeVisible();
      await expect(async () => {
        await phone.keyboard.press('Escape');
        await expect(phone.getByTestId('kit-option-approval')).toBeHidden({ timeout: 500 });
      }).toPass();
      await phone.getByTestId('composer-input').fill('Budget draft is in the drive.');
      await phone.getByTestId('composer-send').click();

      // Noor is in it already, and sees it arrive on the space.
      await expect(page.getByTestId('space-conversation-Budget')).toContainText(
        'Alex Chen: Budget draft is in the drive.',
      );
      // Noor makes Alex an admin.
      await page
        .getByRole('button', { name: /^Alex Chen/ })
        .filter({ visible: true })
        .click();
      await page.getByTestId('space-toggle-admin').click();
      await expect(visible(page, 'Alex Chen is an admin')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Alex Chen, Admin' })).toBeVisible();
      // The sheet has faded out (its backdrop is a "Close" button).
      await expect(page.getByRole('button', { name: 'Close', exact: true })).toHaveCount(0);
      await page.screenshot({ path: 'e2e/screenshots/desktop-space.png' });
      await phone.goto('/spaces');
      await expect(
        phone.getByTestId('space-row-Venue team').filter({ visible: true }),
      ).toBeVisible();
      await phone.screenshot({ path: 'e2e/screenshots/phone-spaces.png' });
      expect([...errors, ...alex.errors]).toEqual([]);
    });

    test('an organization: its profile, the DNS record that verifies it, and its team', async () => {
      const { page, errors } = noor;
      const handle = `nile.dental.${stamp}`;
      await page.goto('/you');
      await page.getByTestId('settings-orgs').filter({ visible: true }).click();
      await page.getByTestId('org-create-start').click();
      await page.getByTestId('org-name').fill(`Nile Dental ${stamp}`);
      await expect(page.getByTestId('org-handle')).toHaveValue(handle);
      await page.getByTestId('org-kind-clinic').click();
      await page.getByTestId('org-create').click();
      await expect(page).toHaveURL(new RegExp(`/o/${handle.replaceAll('.', '\\.')}$`));
      // A handle's dots don't read as a file: reloading it still opens the app.
      await page.reload();
      await expect(visible(page, `Clinic or practice · @${handle}`)).toBeVisible();
      await expect(page.getByTestId('org-unverified')).toBeVisible();

      // A domain of its own each run: a verified domain belongs to one organization.
      const domain = `niledental-${stamp}.example`;
      await page.getByTestId('org-domain').fill(`https://www.NileDental-${stamp}.example/about`);
      await page.getByTestId('org-domain-set').click();
      await expect(page.getByTestId('org-record-name')).toHaveText(`_caishy-verify.${domain}`);
      await expect(page.getByTestId('org-record-value')).toHaveText(/^caishy-verify=[\w-]{20,}$/);
      // Nothing is published at that name: it says so, and stays unverified.
      const checked = page.waitForResponse((r) => r.url().endsWith('/domain/check'));
      await page.getByTestId('org-domain-check').click();
      expect((await checked).status()).toBe(422);
      await expect(visible(page, /couldn’t find the record yet/)).toBeVisible();
      await expect(page.getByTestId('org-unverified')).toBeVisible();
      // Published among the domain's other records, it verifies.
      const value = (await page.getByTestId('org-record-value').textContent()) ?? '';
      await publishTxt(`_caishy-verify.${domain}`, ['v=spf1 -all', value]);
      await page.getByTestId('org-domain-check').click();
      await expect(page.getByTestId('org-verified')).toHaveText(`Verified · ${domain}`);

      // The team is made of connections.
      await page.getByTestId('org-add-people').click();
      await page.getByTestId(`pick-alex.${stamp}`).click();
      await page.getByTestId('org-add-confirm').click();
      await expect(visible(page, 'Team · 2')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Close', exact: true })).toHaveCount(0);
      await page.screenshot({ path: 'e2e/screenshots/desktop-organization.png' });

      // Alex finds it among theirs and sees the team, but not the verification controls.
      const phone = alex.page;
      await phone.goto('/orgs');
      await phone.getByTestId(`org-row-${handle}`).click();
      await expect(visible(phone, 'Alex Chen (you)')).toBeVisible();
      await expect(phone.getByTestId('org-domain-check')).toHaveCount(0);
      await phone.screenshot({ path: 'e2e/screenshots/phone-organization.png' });
      // The one failed call is the check that found no record.
      expect(errors.filter((e) => !/422|domain\/check/.test(e))).toEqual([]);
      errors.length = 0; // The page lives on into the next tests; that expected 422 doesn't.
      expect(alex.errors).toEqual([]);
    });

    test('an @handle link opens its person or organization, even after signing up first', async ({
      browser,
    }) => {
      const { page, errors } = noor;
      const origin = new URL(page.url()).origin;
      await page.goto(`/@alex.${stamp}`);
      await expect(page).toHaveURL(new RegExp(`/p/${alexId}$`));
      await page.goto(`/@nile.dental.${stamp}`);
      await expect(page).toHaveURL(new RegExp(`/o/nile\\.dental\\.${stamp}$`));
      await page.goto(`/@nobody.${stamp}`);
      await expect(visible(page, `No one here goes by @nobody.${stamp}`)).toBeVisible();
      // A browser without a share sheet copies the link instead of doing nothing.
      await page.goto('/connect');
      await page.getByRole('button', { name: `Share @noor.${stamp}` }).click();
      await expect(visible(page, 'Link copied')).toBeVisible();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
        `${origin}/@noor.${stamp}`,
      );

      // A Caishy link in a message opens here, not in another tab.
      const sent = await alexContext.request.post(`/v1/conversations/${convo}/messages`, {
        headers: CLIENT,
        data: { clientId: randomUUID(), body: `Our clinic: ${origin}/@nile.dental.${stamp}` },
      });
      expect(sent.ok()).toBe(true);
      await page.goto(`/c/${convo}`);
      await page
        .getByRole('link', { name: `${origin}/@nile.dental.${stamp}` })
        .filter({ visible: true })
        .click();
      await expect(page).toHaveURL(new RegExp(`/o/nile\\.dental\\.${stamp}$`));
      expect(page.context().pages()).toHaveLength(1);

      // Someone new opens Noor's link, signs up, and lands on Noor, ready to connect.
      const invited = async () =>
        (
          await (
            await noorContext.request.get('/v1/admin/metrics?days=28', {
              headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
            })
          ).json()
        ).metrics.growth.invited.count as number;
      const invitedBefore = await invited();
      linaContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
      lina = await newPerson(linaContext);
      const linaHandle = `lina.${stamp}`;
      await lina.page.goto(`/@noor.${stamp}`);
      await expect(lina.page.getByTestId('welcome-link')).toHaveText(
        `Create an account or sign in to see @noor.${stamp}`,
      );
      await lina.page.screenshot({ path: 'e2e/screenshots/phone-link-welcome.png' });
      await lina.page.getByTestId('welcome-sign-up').click();
      await lina.page.getByTestId('signup-name').fill('Lina Farah');
      await lina.page.getByTestId('signup-handle').fill(linaHandle);
      await lina.page.getByTestId('signup-email').fill(`${linaHandle}@example.com`);
      await lina.page.getByTestId('signup-password').fill('a long enough passphrase');
      await lina.page.getByTestId('signup-birth-year').fill('1990');
      await expect(lina.page.getByText('Available')).toBeVisible();
      await lina.page.getByTestId('signup-submit').click();
      await lina.page.waitForURL('**/onboarding');
      // The operator counts that Noor's link brought someone (PRD §82); nobody is told.
      expect(await invited()).toBe(invitedBefore + 1);
      await lina.page.getByText('Copy the codes').click();
      await lina.page.getByTestId('onboarding-codes-next').click();
      await lina.page.getByTestId('onboarding-rules-next').click();
      await expect(visible(lina.page, `You came here for @noor.${stamp}.`)).toBeVisible();
      await lina.page.getByTestId('onboarding-link').click();
      await expect(lina.page).toHaveURL(new RegExp(`/p/${noorId}$`));
      await expect(lina.page.getByTestId('person-connect')).toBeVisible();
      await lina.page.screenshot({ path: 'e2e/screenshots/phone-link-signup.png' });
      // Back goes home, not to the way in.
      await lina.page.goBack();
      await expect(lina.page).toHaveURL(/\/$/);
      // The one failed call is the handle nobody has.
      expect(errors.filter((e) => !/handles\/nobody\.|status of 404/.test(e))).toEqual([]);
      errors.length = 0;
      expect(lina.errors).toEqual([]);
    });

    test('a customer writes to an organization, and its team answers as the organization', async () => {
      const handle = `nile.dental.${stamp}`;
      const orgName = `Nile Dental ${stamp}`;
      const customer = lina.page;
      await customer.goto(`/@${handle}`);
      await customer.getByTestId('org-message').click();
      await expect(
        visible(customer, `Business · Verified · niledental-${stamp}.example`),
      ).toBeVisible();
      await customer.getByTestId('composer-input').fill('Can I book a cleaning on Thursday?');
      await customer.getByTestId('composer-send').click();

      // Noor, on the team, sees it waiting: on the rail and in the organization's inbox.
      const { page, errors } = noor;
      await page.goto('/');
      await expect(page.getByRole('link', { name: 'Business, 1' })).toBeVisible();
      await page.getByRole('link', { name: 'Business, 1' }).click();
      await page.getByTestId(`thread-row-lina.${stamp}`).click();
      await expect(page.getByTestId('thread-state')).toHaveText('New');
      await page
        .getByTestId('composer-input')
        .filter({ visible: true })
        .fill('Yes! We have 10:00 or 15:30 on Thursday. Which suits you?');
      await page.getByTestId('composer-send').filter({ visible: true }).click();
      await expect(page.getByTestId('thread-state')).toHaveText('Waiting on customer');
      await expect(page.getByTestId('thread-bar')).toContainText('You have it');
      await page.screenshot({ path: 'e2e/screenshots/desktop-business-inbox.png' });

      // The customer hears from the organization; nobody on its team is named.
      await expect(visible(customer, 'Which suits you?')).toBeVisible();
      await expect(customer.getByText('Noor Haddad')).toHaveCount(0);
      await customer.screenshot({ path: 'e2e/screenshots/phone-business-customer.png' });
      await customer.goto('/');
      await expect(visible(customer, orgName)).toBeVisible();
      await expect(visible(customer, 'Business')).toBeVisible();

      // Alex, on the team too, finds it in the inbox, not among their own chats.
      const phone = alex.page;
      await phone.goto('/');
      await expect(
        phone.getByTestId(`team-inbox-${handle}`).filter({ visible: true }),
      ).toContainText('Nobody is waiting');
      await expect(phone.getByText('Can I book a cleaning on Thursday?')).toHaveCount(0);

      // Resolved, it waits until the customer writes again.
      await page.getByTestId('thread-resolve').click();
      await expect(page.getByTestId('thread-state')).toHaveText('Resolved');
      expect([...errors, ...lina.errors, ...alex.errors]).toEqual([]);
    });

    test('an app’s bot answers a customer as the organization, and says it’s automated', async () => {
      const handle = `nile.dental.${stamp}`;
      const { page, errors } = noor;
      await page.goto(`/o/${handle}`);
      await page.getByTestId('org-app-add').click();
      await page.getByTestId('org-app-name').fill('Nile Assistant');
      await page.getByTestId('org-app-scope-messages:write').click();
      await page.getByTestId('org-app-create').click();
      const token = ((await page.getByTestId('org-app-token').textContent()) ?? '').trim();
      expect(token).toMatch(/^cai_[\w-]{32}$/);
      await page.screenshot({ path: 'e2e/screenshots/desktop-org-app-token.png' });
      await page.getByTestId('org-app-secrets-done').click();
      await expect(page.getByTestId('org-app-Nile Assistant')).toBeVisible();
      await expect(visible(page, 'Bot · an app’s, labelled automated')).toBeVisible();

      // The app answers through its token, as its bot, in the customer's conversation.
      const orgId = (await (await noorContext.request.get(`/v1/orgs/by-handle/${handle}`)).json())
        .org.id;
      const { conversationId } = await (
        await linaContext!.request.post(`/v1/orgs/${orgId}/conversations`, { headers: CLIENT })
      ).json();
      const sent = await noorContext.request.post(`/v1/conversations/${conversationId}/messages`, {
        headers: { authorization: `Bearer ${token}` },
        data: { clientId: randomUUID(), body: 'Thanks! A dentist will confirm your time shortly.' },
      });
      expect(sent.status()).toBe(201);
      // The token reaches nothing else.
      const elsewhere = await noorContext.request.get('/v1/me', {
        headers: { authorization: `Bearer ${token}` },
      });
      expect(elsewhere.status()).toBe(403);

      const customer = lina.page;
      await customer.goto(`/c/${conversationId}`);
      await expect(visible(customer, 'A dentist will confirm your time shortly.')).toBeVisible();
      await expect(
        customer.getByTestId('message-automated').filter({ visible: true }),
      ).toBeVisible();
      await customer.screenshot({ path: 'e2e/screenshots/phone-business-automated.png' });
      expect([...errors, ...lina.errors]).toEqual([]);
    });

    test('a plan says what it includes, and what an organization has room for', async () => {
      const { page, errors } = noor;
      await page.goto('/you');
      await expect(page.getByTestId('settings-plan')).toContainText('Personal · free forever');
      await page.getByTestId('settings-plan').click();
      await expect(page.getByTestId('plan-name')).toHaveText('Personal');
      await expect(page.getByTestId('plan-ai')).toContainText('0 of 10 in the last 24 hours');
      await expect(page.getByTestId('plan-files')).toContainText('0 of 5 GB');
      // Pro can be bought here, at Stripe's price for it.
      await expect(page.getByTestId('billing-price')).toHaveText('€6 a month');
      await page.getByRole('tab', { name: 'Yearly' }).click();
      await expect(page.getByTestId('billing-price')).toHaveText('€60 a year');
      await page.getByRole('tab', { name: 'Monthly' }).click();
      await page.screenshot({ path: 'e2e/screenshots/desktop-plan.png' });

      // Nile Dental is on Free: its one app is connected, and its team has room for one more.
      await page.goto(`/o/nile.dental.${stamp}`);
      await expect(page.getByTestId('org-plan')).toContainText('Free plan');
      await expect(page.getByTestId('org-plan')).toContainText('2 of 3 people · 1 of 1 app');
      await expect(page.getByTestId('org-apps-full')).toContainText(
        'The Free plan includes one app. Business has room for 100 people and 25 apps',
      );
      await expect(page.getByTestId('org-app-add')).toHaveCount(0);
      await page.getByTestId('org-add-people').click();
      await expect(page.getByTestId('org-add-room')).toHaveText(
        'Room for 1 more on the Free plan.',
      );
      await page.waitForTimeout(400); // the sheet's fade-in, for the screenshot only
      await page.screenshot({ path: 'e2e/screenshots/desktop-org-plan.png' });
      await page.keyboard.press('Escape');
      expect(errors).toEqual([]);
    });

    test('Pro, bought through Stripe and managed there', async () => {
      const { page, errors } = noor;
      await page.goto('/settings/plan');
      await page.getByTestId('billing-checkout').click();
      // Stripe's Checkout (its stand-in here): paid, and back.
      await page.waitForURL(/\/checkout\//);
      await page.getByRole('button', { name: 'Pay' }).click();
      await page.waitForURL(/\/settings\/plan\?billing=done/);
      await expect(page.getByTestId('plan-name')).toHaveText('Pro');
      const paid = page.getByTestId('billing-subscription');
      await expect(paid).toContainText('Pro · €6 a month');
      await expect(paid).toContainText('Renews on');
      await expect(page.getByTestId('plan-ai')).toContainText('of 200 in the last 24 hours');
      await page.screenshot({ path: 'e2e/screenshots/desktop-plan-pro.png' });
      // Cancelled in Stripe's portal, it stays on until what's paid for ends.
      await page.getByTestId('billing-manage').click();
      await page.waitForURL(/\/portal\//);
      await page.getByRole('button', { name: 'Cancel plan' }).click();
      await page.waitForURL(/\/settings\/plan$/);
      await expect(page.getByTestId('billing-subscription')).toContainText('Ends on');
      await expect(page.getByTestId('plan-name')).toHaveText('Pro');
      expect(errors).toEqual([]);
    });

    test('on Business, an organization sees how its inbox is doing', async () => {
      const { page, errors } = noor;
      const handle = `nile.dental.${stamp}`;
      // The operator moves it to Business (a deal of its own: billing never changes it).
      const upgraded = await noorContext.request.put(`/v1/admin/orgs/${handle}/plan`, {
        headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
        data: { plan: 'business' },
      });
      expect(upgraded.status()).toBe(200);
      await page.goto(`/o/${handle}`);
      await expect(page.getByTestId('org-plan')).toContainText('Business plan');
      await expect(page.getByTestId('org-app-add')).toBeVisible();
      // Lina wrote to it, and the team answered her.
      await expect(page.getByTestId('insight-conversations')).toContainText(
        /Customers\s*1\s*Up from 0/,
      );
      await expect(page.getByTestId('insight-reply')).toContainText('1 of 1 within an hour');
      await page.getByTestId('org-insights').scrollIntoViewIfNeeded();
      await page.screenshot({ path: 'e2e/screenshots/desktop-org-insights.png' });

      // The operator's metrics: counts by route, behind their own token.
      const scraped = await noorContext.request.get('/metrics', {
        headers: { authorization: `Bearer ${METRICS_TOKEN}` },
      });
      expect(scraped.status()).toBe(200);
      expect(await scraped.text()).toContain(
        'caishy_http_requests_total{method="GET",route="/v1/orgs/:id/insights",status="200"}',
      );
      expect((await noorContext.request.get('/metrics')).status()).toBe(401);
      expect(errors).toEqual([]);
    });

    test('a customer blocks an organization, and its team can no longer write to them', async () => {
      const handle = `nile.dental.${stamp}`;
      const orgName = `Nile Dental ${stamp}`;
      const customer = lina.page;
      await customer.goto(`/o/${handle}`);
      await customer.getByTestId('org-block').click();
      await customer.getByTestId('org-block-confirm').click();
      await expect(customer.getByTestId('org-blocked')).toContainText(`You blocked ${orgName}.`);
      await expect(customer.getByTestId('org-message')).toHaveCount(0);

      // The team finds it closed, with nothing to write in.
      const { page, errors } = noor;
      const orgId = (await (await noorContext.request.get(`/v1/orgs/by-handle/${handle}`)).json())
        .org.id;
      const { threads } = await (
        await noorContext.request.get(`/v1/orgs/${orgId}/inbox?view=resolved`)
      ).json();
      const conversationId = (threads as Array<{ closed: boolean; conversationId: string }>).find(
        (x) => x.closed,
      )?.conversationId;
      await page.goto(`/c/${conversationId}?inbox=${handle}`);
      await expect(page.getByTestId('thread-state')).toHaveText('Closed by the customer');
      await expect(page.getByTestId('thread-reopen')).toHaveCount(0);
      await expect(visible(page, 'The customer closed this conversation.')).toBeVisible();
      await expect(page.getByTestId('composer-input').filter({ visible: true })).toHaveCount(0);
      await page.screenshot({ path: 'e2e/screenshots/desktop-business-closed.png' });

      // The customer can open it again from the conversation itself.
      await customer.goto(`/c/${conversationId}`);
      await expect(visible(customer, `You blocked ${orgName}.`)).toBeVisible();
      await customer.screenshot({ path: 'e2e/screenshots/phone-org-blocked.png' });
      await customer.getByTestId('composer-unblock-org').click();
      await expect(customer.getByTestId('composer-input').filter({ visible: true })).toBeVisible();
      expect([...errors, ...lina.errors]).toEqual([]);
    });

    test('a verified organization writes to someone first, and it arrives as a request', async ({
      browser,
    }) => {
      const handle = `nile.dental.${stamp}`;
      const orgName = `Nile Dental ${stamp}`;
      const samContext = await browser.newContext({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
      });
      try {
        await apiSignUp(samContext, 'Sam Rivera', `sam.${stamp}`);
        const sam = await newPerson(samContext);
        const { page, errors } = noor;
        await page.goto(`/o/${handle}/inbox`);
        await page.getByTestId('business-write-first').click();
        await page.getByTestId('write-first-handle').fill(`@sam.${stamp}`);
        await page
          .getByTestId('write-first-body')
          .fill(
            `Hello Sam, this is ${orgName}. Your new patient forms are ready: https://niledental-${stamp}.example/forms`,
          );
        await page.screenshot({ path: 'e2e/screenshots/desktop-business-write-first.png' });
        await page.getByTestId('write-first-send').click();

        // It waits on Sam, and nobody on the team writes again until they answer.
        await expect(page.getByTestId('thread-state')).toHaveText('Request sent');
        await expect(page.getByTestId('request-outgoing')).toHaveText(
          `Sam Rivera will see this as a message request from ${orgName}.`,
        );
        await expect(visible(page, /^You can write again once they answer\.$/)).toBeVisible();
        await expect(page.getByTestId('composer-input').filter({ visible: true })).toHaveCount(0);

        // Sam finds it among their requests: from the organization, verified, its link inert.
        const phone = sam.page;
        await phone.goto('/');
        await visible(phone, 'Message requests · 1').click();
        await visible(phone, orgName).click();
        const banner = phone.getByTestId('request-incoming');
        await expect(banner).toContainText(`${orgName} wrote to you first`);
        await expect(banner).toContainText(`Verified · niledental-${stamp}.example`);
        await expect(phone.getByRole('link', { name: /\/forms$/ })).toHaveCount(0);
        await phone.screenshot({ path: 'e2e/screenshots/phone-business-request.png' });
        await banner.getByRole('button', { name: 'Accept' }).click();
        await expect(phone.getByRole('link', { name: /\/forms$/ })).toHaveCount(1);
        await phone
          .getByTestId('composer-input')
          .filter({ visible: true })
          .fill('Thanks, I’ll fill them in tonight.');
        await phone.getByTestId('composer-send').filter({ visible: true }).click();

        // Answered, it's an ordinary conversation with the team.
        await expect(page.getByTestId('thread-state')).toHaveText('Customer waiting');
        await expect(page.getByTestId('request-outgoing')).toHaveCount(0);
        await page
          .getByTestId('composer-input')
          .filter({ visible: true })
          .fill('Please bring your insurance card on Thursday.');
        await page.getByTestId('composer-send').filter({ visible: true }).click();

        // What the clinic asks of Sam is theirs to do, said in the clinic's name, not Noor's.
        const offer = phone.getByLabel('Suggestion: Bring insurance card');
        await expect(offer).toContainText(
          `${orgName} asked “Please bring your insurance card on Thursday.”`,
        );
        await expect(offer).not.toContainText('Noor');
        await phone.screenshot({ path: 'e2e/screenshots/phone-business-suggestion.png' });
        await offer.getByRole('button', { name: 'Add to actions' }).click();
        await expect(visible(phone, 'Added to your actions')).toBeVisible();
        expect([...errors, ...sam.errors]).toEqual([]);
      } finally {
        await samContext.close();
      }
    });

    test('someone under 18 writes to a verified organization, and its team knows', async ({
      browser,
    }) => {
      const handle = `nile.dental.${stamp}`;
      const teenContext = await browser.newContext({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
      });
      try {
        await apiSignUp(teenContext, 'Rami Young', `rami.${stamp}`, { birthYear: 2011 });
        const teen = await newPerson(teenContext);
        await teen.page.goto(`/@${handle}`);
        await expect(visible(teen.page, 'Its team will see you’re under 18.')).toBeVisible();
        await teen.page.getByTestId('org-message').click();
        await teen.page
          .getByTestId('composer-input')
          .filter({ visible: true })
          .fill('Can I book a check-up without a parent?');
        await teen.page.getByTestId('composer-send').filter({ visible: true }).click();

        // The team answers knowing it, and nothing about money is offered in it.
        const { page, errors } = noor;
        await page.goto(`/o/${handle}/inbox`);
        await page.getByTestId(`thread-row-rami.${stamp}`).click();
        await expect(page.getByTestId('thread-bar')).toContainText('Under 18');
        await page
          .getByRole('button', { name: 'Share a photo, a file or a card' })
          .filter({ visible: true })
          .click();
        await expect(page.getByTestId('kit-option-appointment')).toBeVisible();
        await expect(page.getByTestId('kit-option-invoice')).toHaveCount(0);
        await expect(page.getByTestId('kit-option-payment_request')).toHaveCount(0);
        await page.screenshot({
          path: 'e2e/screenshots/desktop-business-under-18.png',
          animations: 'disabled',
        });
        await page.keyboard.press('Escape');
        expect([...errors, ...teen.errors]).toEqual([]);
      } finally {
        await teenContext.close();
      }
    });

    test('every settings page opens, and a chosen theme follows you', async () => {
      const { page, errors } = noor;
      for (const [path, title] of [
        ['profile', 'Profile'],
        ['notifications', 'Notifications and priorities'],
        ['privacy', 'Privacy'],
        ['security', 'Security'],
        ['about', 'About Caishy'],
        ['plan', 'Plan'],
        ['developer', 'Developer'],
        ['connected', 'Connected apps'],
        ['appearance', 'Appearance'],
      ]) {
        await page.goto(`/settings/${path}`);
        await expect(
          page.getByRole('heading', { name: title }).filter({ visible: true }),
        ).toBeVisible();
      }
      const scheme = () => page.evaluate(() => document.documentElement.style.colorScheme);
      const saved = page.waitForResponse(
        (r) => r.url().endsWith('/v1/me') && r.request().method() === 'PATCH',
      );
      await page.getByRole('radio', { name: 'Dark', exact: true }).click();
      await expect.poll(scheme).toBe('dark');
      expect((await saved).ok()).toBe(true);
      // A fresh device: nothing stored locally, still signed in by its cookie.
      await page.evaluate(() => localStorage.clear());
      await page.reload();
      await expect.poll(scheme).toBe('dark');
      await page.screenshot({ path: 'e2e/screenshots/desktop-appearance-dark.png' });
      expect(errors).toEqual([]);
    });

    test('AI assist, once turned on: catch up, follow-ups, translate and rewrite', async () => {
      const { page, errors } = noor;
      const stub = async () =>
        ((await (await page.request.get(AI_STUB_REQUESTS)).json()) as { calls: string[] }).calls;
      // Off by default: nothing has reached the model, and the composer offers nothing.
      expect(await stub()).toEqual([]);
      await page.goto(`/c/${convo}`);
      await page.getByTestId('composer-input').fill('can u send the contract fri');
      await expect(page.getByTestId('composer-send')).toBeVisible();
      await expect(page.getByTestId('composer-rewrite')).toHaveCount(0);
      await page.getByTestId('composer-input').fill('');

      await page.goto('/settings/privacy');
      const saved = page.waitForResponse(
        (r) => r.url().endsWith('/v1/me') && r.request().method() === 'PATCH',
      );
      await page.getByTestId('ai-toggle').click();
      expect((await saved).ok()).toBe(true);

      for (const body of [
        'هل وصل العقد؟',
        'The printer needs the final logo files before Friday.',
        ...Array.from({ length: 8 }, (_, i) => `Venue note ${i + 1}`),
        'That’s all for now.',
      ]) {
        const res = await alexContext.request.post(`/v1/conversations/${convo}/messages`, {
          headers: CLIENT,
          data: { clientId: randomUUID(), body },
        });
        expect(res.ok()).toBe(true);
      }
      await page.goto(`/c/${convo}`);
      // Eleven just now, and whatever arrived unread before.
      const banner = visible(page, /^\d+ new messages$/);
      await expect(banner).toBeVisible();
      expect(Number((await banner.textContent())?.split(' ')[0])).toBeGreaterThanOrEqual(11);
      await page.getByTestId('catch-up-banner').click();
      const summary = page.getByTestId('assist-summary').filter({ visible: true });
      await expect(summary).toContainText('Suggested by Caishy');
      await expect(summary).toContainText(
        /Caught up on \d+ messages\. The latest is from Alex Chen\./,
      );
      await expect(page.getByText(/^\d+ new messages$/)).toHaveCount(0);

      await page.getByTestId('assist-find').filter({ visible: true }).click();
      await expect(visible(page, '1 follow-up to review')).toBeVisible();
      const offer = page.getByLabel('Suggestion: Send the final logo files');
      await expect(offer).toContainText('Suggested by Caishy');
      await expect(offer).toContainText('Alex wrote “The printer needs the final logo files');

      // The hover buttons beside a message open its actions (they used to vanish under the pointer).
      await visible(page, 'هل وصل العقد؟').hover();
      await page.getByRole('button', { name: 'React', exact: true }).click();
      await page.getByTestId('message-translate').click();
      const translation = page.getByTestId('message-translation');
      await expect(translation).toContainText('English · Suggested by Caishy');
      await expect(translation).toContainText('Did the contract arrive?');
      await translation.scrollIntoViewIfNeeded();
      await page.screenshot({ path: 'e2e/screenshots/desktop-ai-assist.png' });

      await page.getByTestId('composer-input').fill('can u send the contract fri');
      await page.getByTestId('composer-rewrite').click();
      await page.getByTestId('rewrite-formal').click();
      await expect(page.getByTestId('rewrite-suggestion')).toHaveText(
        'Could you send me the contract by Friday?',
      );
      await page.getByTestId('rewrite-use').click();
      await expect(page.getByTestId('composer-input')).toHaveValue(
        'Could you send me the contract by Friday?',
      );
      await page.getByTestId('composer-send').click();
      await expect(page.getByTestId('composer-input')).toHaveValue('');
      // Sent as written after the tap, from Noor, and nothing was sent before it.
      await expect
        .poll(async () => {
          const res = await alexContext.request.get(`/v1/conversations/${convo}/messages?limit=1`);
          const [last] = (await res.json()).messages as Array<{ body: string; senderId: string }>;
          return last && `${last.senderId === noorId ? 'Noor' : 'someone else'}: ${last.body}`;
        })
        .toBe('Noor: Could you send me the contract by Friday?');

      await offer.getByRole('button', { name: 'Add to actions' }).click();
      await expect(visible(page, 'Added to your actions')).toBeVisible();
      expect(await stub()).toEqual(['catch-up', 'actions', 'translate', 'rewrite']);
      expect(errors).toEqual([]);
    });

    test('a checklist both of them tick, and a place shared where it fits', async () => {
      const { page, errors } = noor;
      await page.goto(`/c/${convo}`);
      await alex.page.goto(`/c/${convo}`);
      await page.getByRole('button', { name: 'Share a photo, a file or a card' }).click();
      // Noor knows Alex from work: a checklist fits, sharing where she is doesn't (yet).
      await expect(page.getByTestId('kit-option-location')).toHaveCount(0);
      await page.getByTestId('kit-option-checklist').click();
      await page.getByLabel('List name').fill('Venue prep');
      await page.getByTestId('checklist-item-input-0').fill('Chairs');
      await page.getByTestId('checklist-item-input-1').fill('Sound check');
      await page.getByTestId('kit-send').click();
      const mine = page.getByTestId('kit-checklist').filter({ hasText: 'Venue prep' });
      await expect(mine).toContainText('0 of 2');

      // Alex ticks one and adds one; Noor sees both as they happen.
      const theirs = alex.page
        .getByTestId('kit-checklist')
        .filter({ hasText: 'Venue prep', visible: true });
      await theirs.getByRole('checkbox', { name: 'Chairs' }).click();
      await theirs.getByTestId('checklist-add').fill('Flowers');
      await theirs.getByTestId('checklist-add').press('Enter');
      await expect(mine).toContainText('1 of 3');
      await expect(mine.getByRole('checkbox', { name: 'Chairs' })).toBeChecked();
      await mine.getByRole('checkbox', { name: 'Sound check' }).click();
      await mine.getByRole('checkbox', { name: 'Flowers' }).click();
      await expect(theirs).toContainText('Done');
      await page.screenshot({ path: 'e2e/screenshots/desktop-kit-checklist.png' });

      // They're friends too, now: Noor shares where she is, once.
      const friend = await noorContext.request.post('/v1/relationships', {
        headers: CLIENT,
        data: { userId: alexId, sphere: 'friend', role: 'friend' },
      });
      expect(friend.status()).toBe(201);
      const { relationship } = await friend.json();
      await noorContext.request.post(`/v1/relationships/${relationship.id}/primary`, {
        headers: CLIENT,
      });
      await noorContext.grantPermissions(['geolocation']);
      await noorContext.setGeolocation({ latitude: 30.0444, longitude: 31.2357, accuracy: 15 });
      await page.reload();
      await page.getByRole('button', { name: 'Share a photo, a file or a card' }).click();
      await page.getByTestId('kit-option-location').click();
      await page.getByTestId('location-here').click();
      await expect(page.getByTestId('location-found')).toHaveText('Found you, within 15 m.');
      await page.getByTestId('location-label').fill('The venue');
      await page.getByTestId('kit-send').click();
      const shared = alex.page
        .getByTestId('message-location')
        .filter({ hasText: 'The venue', visible: true });
      await expect(shared).toContainText('Within 15 m');
      await alex.page.screenshot({ path: 'e2e/screenshots/phone-kit-location.png' });
      expect([...errors, ...alex.errors]).toEqual([]);
    });

    test('an album they both add photos to, and only take their own out of', async () => {
      const { page, errors } = noor;
      await page.goto(`/c/${convo}`);
      await alex.page.goto(`/c/${convo}`);
      // Friends now (the test before): an album fits.
      await page.getByRole('button', { name: 'Share a photo, a file or a card' }).click();
      await page.getByTestId('kit-option-shared_album').click();
      await page.getByLabel('Album name').fill('Venue day');
      await page.getByTestId('kit-send').click();
      const mine = page.getByTestId('kit-shared_album').filter({ hasText: 'Venue day' });
      await expect(mine).toContainText('0 photos');
      await expect(mine).toContainText('Nothing in it yet. Everyone here can add photos.');

      // Alex adds two from the phone, Noor one from her desk; each sees the other's.
      const theirs = alex.page
        .getByTestId('kit-shared_album')
        .filter({ hasText: 'Venue day', visible: true });
      const addFrom = async (p: Page, card: typeof mine, files: Array<[string, Buffer]>) => {
        const chooser = p.waitForEvent('filechooser');
        await card.getByTestId('album-add').click();
        await (await chooser).setFiles(
          files.map(([name, buffer]) => ({ name, mimeType: 'image/png', buffer })),
        );
      };
      await addFrom(alex.page, theirs, [
        ['stage.png', photo(240, 180, [233, 196, 106], [214, 79, 60])],
        ['hall.png', photo(240, 180, [120, 180, 200], [40, 70, 130])],
      ]);
      await expect(theirs).toContainText('2 photos');
      await expect(mine).toContainText('2 photos');
      await addFrom(page, mine, [['tables.png', photo(240, 180, [150, 200, 140], [60, 120, 90])]]);
      await expect(theirs).toContainText('3 photos');
      await expect(mine.getByTestId('album-preview').locator('img')).toHaveCount(3);

      // In the album, Alex can take out the two they added, not Noor's.
      await theirs.getByTestId('album-preview').click();
      const sheet = alex.page.getByTestId('album-sheet-photos').filter({ visible: true });
      await expect(sheet.locator('img')).toHaveCount(3);
      await expect(sheet.getByRole('button', { name: /out of the album$/ })).toHaveCount(2);
      await expect(
        sheet.getByRole('button', { name: 'Take photo 1 out of the album' }),
      ).toHaveCount(0);
      // The sheet slides up on a phone; the picture is of it in place.
      await expect(sheet).toBeInViewport({ ratio: 1 });
      await alex.page.screenshot({
        path: 'e2e/screenshots/phone-kit-album.png',
        animations: 'disabled',
      });
      // Taken out by mistake, it goes back in; the toast shows above the sheet, not under it.
      await sheet.getByRole('button', { name: 'Take photo 2 out of the album' }).click();
      await expect(mine).toContainText('2 photos');
      await alex.page.getByRole('button', { name: 'Undo' }).click();
      await expect(mine).toContainText('3 photos');
      await expect(sheet.locator('img')).toHaveCount(3);
      await sheet.getByRole('button', { name: 'Take photo 1 out of the album' }).click();
      await expect(mine).toContainText('2 photos');

      // Noor closes it: nobody adds more, and what's in it stays.
      await mine.getByRole('button', { name: 'Close the album' }).click();
      await expect(mine).toContainText('Closed');
      await expect(mine.getByTestId('album-add')).toHaveCount(0);
      await alex.page.keyboard.press('Escape');
      await expect(theirs).toContainText('Closed');
      await expect(theirs.getByTestId('album-add')).toHaveCount(0);
      await page.screenshot({ path: 'e2e/screenshots/desktop-kit-album.png' });
      expect([...errors, ...alex.errors]).toEqual([]);
    });

    test('a token of her own sends a message for Noor, and says it came through it', async () => {
      const { page, errors } = noor;
      await page.goto('/settings/developer');
      await page.getByTestId('token-new').click();
      await page.getByTestId('token-name').fill('Reminders script');
      await page.getByTestId('token-scope-messages:write').click();
      await page.getByRole('tab', { name: '30 days' }).click();
      await page.getByTestId('token-create').click();
      const token = ((await page.getByTestId('token-value').textContent()) ?? '').trim();
      expect(token).toMatch(/^cap_[\w-]{32}$/);
      await page.screenshot({ path: 'e2e/screenshots/desktop-developer-token.png' });
      await page.getByTestId('token-done').click();
      await expect(page.getByTestId('token-Reminders script')).toContainText('never used');

      // Her script sends as her; Alex sees it came through it.
      const sent = await alexContext.request.post(`/v1/conversations/${convo}/messages`, {
        headers: { authorization: `Bearer ${token}` },
        data: { clientId: randomUUID(), body: 'Reminder: rehearsal at 6.' },
      });
      expect(sent.status()).toBe(201);
      await alex.page.goto(`/c/${convo}`);
      const bubble = alex.page
        .getByLabel(/sent via Reminders script, Reminder: rehearsal at 6\./)
        .filter({ visible: true });
      await expect(bubble.getByTestId('message-sent-via')).toHaveText('via Reminders script ·');
      // It can't reach her account; revoked, it can't do anything.
      const settings = await alexContext.request.patch('/v1/me', {
        headers: { authorization: `Bearer ${token}` },
        data: { displayName: 'Not Noor' },
      });
      expect(settings.status()).toBe(403);
      await page.getByTestId('token-revoke-Reminders script').click();
      await expect(page.getByTestId('token-Reminders script')).toHaveCount(0);
      const after = await alexContext.request.post(`/v1/conversations/${convo}/messages`, {
        headers: { authorization: `Bearer ${token}` },
        data: { clientId: randomUUID(), body: 'Too late.' },
      });
      expect(after.status()).toBe(401);
      expect([...errors, ...alex.errors]).toEqual([]);
    });

    test('an app Noor made acts for Alex once he lets it in, and stops when he removes it', async ({
      browser,
      baseURL,
    }) => {
      const { page, errors } = noor;
      // Noor registers her app. It runs in a browser, so it proves itself with PKCE: no secret.
      await page.goto('/settings/developer');
      await page.getByTestId('oauth-app-new').click();
      await page.getByTestId('oauth-app-name').fill('Weekly digest');
      await page.getByTestId('oauth-app-website').fill('https://digest.example');
      await page.getByTestId('oauth-app-redirects').fill('https://digest.example/callback');
      await page.getByTestId('oauth-app-create').click();
      const clientId = ((await page.getByTestId('oauth-app-client-id').textContent()) ?? '').trim();
      expect(clientId).toMatch(/^app_[\w-]{16}$/);
      await expect(page.getByTestId('oauth-app-secret')).toHaveCount(0);
      await page.screenshot({ path: 'e2e/screenshots/desktop-developer-oauth-app.png' });
      await page.getByTestId('oauth-app-done').click();
      await expect(page.getByTestId('oauth-app-Weekly digest')).toBeVisible();

      // Its link reaches Alex signed out, on his phone; signing in brings him back to it.
      const verifier = randomBytes(32).toString('base64url');
      const authorize = `/oauth/authorize?${new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: 'https://digest.example/callback',
        scope: 'messages:read messages:write',
        state: 'digest-7',
        code_challenge: createHash('sha256').update(verifier).digest('base64url'),
        code_challenge_method: 'S256',
      })}`;
      const phone = await browser.newContext({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
      });
      // The app's own page, where Caishy sends him back.
      await phone.route('https://digest.example/**', (r) =>
        r.fulfill({ contentType: 'text/html', body: '<p>Connected to Caishy</p>' }),
      );
      const app = await newPerson(phone);
      await app.page.goto(authorize);
      await expect(app.page.getByTestId('welcome-link')).toHaveText(
        'An app asked to act for you. Sign in to answer it',
      );
      await app.page.getByTestId('welcome-sign-in').click();
      await app.page.getByTestId('signin-identifier').fill(`alex.${stamp}`);
      await app.page.getByTestId('signin-password').fill(PASSWORD);
      await app.page.getByTestId('signin-submit').click();
      const asked = app.page.getByTestId('oauth-consent');
      await expect(asked).toContainText('Weekly digest wants to act for you');
      await expect(asked).toContainText(
        `Made by Noor Haddad (@noor.${stamp}) · https://digest.example`,
      );
      await expect(asked).toContainText('Send messages as you, marked with what sent them');
      await expect(asked).toContainText('Then you’ll go back to digest.example.');
      await app.page.screenshot({ path: 'e2e/screenshots/phone-oauth-consent.png' });
      await app.page.getByTestId('oauth-allow').click();
      await app.page.waitForURL(/^https:\/\/digest\.example\/callback\?/);
      const back = new URL(app.page.url());
      expect(back.searchParams.get('state')).toBe('digest-7');

      // The app trades the code from its own server: no cookies, no Caishy client header. Its
      // OAuth library finds where on its own (RFC 8414).
      const digest = await request.newContext({ baseURL });
      const found = await (await digest.get('/.well-known/oauth-authorization-server')).json();
      expect(found.authorization_endpoint).toBe(`${baseURL}/oauth/authorize`);
      const traded = await digest.post(found.token_endpoint, {
        form: {
          grant_type: 'authorization_code',
          code: back.searchParams.get('code') ?? '',
          redirect_uri: 'https://digest.example/callback',
          client_id: clientId,
          code_verifier: verifier,
        },
      });
      expect(traded.status(), await traded.text()).toBe(200);
      const { access_token: token } = (await traded.json()) as { access_token: string };
      const sent = await digest.post(`/v1/conversations/${convo}/messages`, {
        headers: { authorization: `Bearer ${token}` },
        data: { clientId: randomUUID(), body: 'Your week: 3 conversations, 1 thing to do.' },
      });
      expect(sent.status()).toBe(201);
      await page.goto(`/c/${convo}`);
      // Newest first in the page: find the message by what it says it is.
      const digestMessage = page
        .getByLabel(/^sent via Weekly digest, Your week: 3 conversations, 1 thing to do\./)
        .filter({ visible: true });
      await expect(digestMessage.getByTestId('message-sent-via')).toHaveText('via Weekly digest ·');

      // Alex finds it among his connected apps and ends it; its token stops at once.
      await app.page.goto('/settings/connected');
      await expect(app.page.getByTestId('connected-Weekly digest')).toContainText(
        'Made by Noor Haddad',
      );
      await app.page.screenshot({ path: 'e2e/screenshots/phone-connected-apps.png' });
      await app.page.getByTestId('connected-remove-Weekly digest').click();
      await expect(app.page.getByTestId('connected-none')).toBeVisible();
      const after = await digest.get(`/v1/conversations/${convo}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      expect(after.status()).toBe(401);

      // Someone new follows the same link: the account they make ends on the app's question.
      const theirs = await browser.newContext({ viewport: { width: 390, height: 844 } });
      await theirs.route('https://digest.example/**', (r) =>
        r.fulfill({ contentType: 'text/html', body: '<p>Not connected</p>' }),
      );
      const fresh = await newPerson(theirs);
      const freshHandle = `omar.oauth.${stamp}`;
      await fresh.page.goto(authorize);
      await fresh.page.getByTestId('welcome-sign-up').click();
      await fresh.page.getByTestId('signup-name').fill('Omar Nabil');
      await fresh.page.getByTestId('signup-handle').fill(freshHandle);
      await fresh.page.getByTestId('signup-email').fill(`${freshHandle}@example.com`);
      await fresh.page.getByTestId('signup-password').fill(PASSWORD);
      await fresh.page.getByTestId('signup-birth-year').fill('1990');
      await expect(fresh.page.getByText('Available')).toBeVisible();
      await fresh.page.getByTestId('signup-submit').click();
      await fresh.page.waitForURL('**/onboarding');
      await fresh.page.getByText('Copy the codes').click();
      await fresh.page.getByTestId('onboarding-codes-next').click();
      await fresh.page.getByTestId('onboarding-rules-next').click();
      await expect(visible(fresh.page, 'An app asked to act for you.')).toBeVisible();
      await fresh.page.getByTestId('onboarding-link').click();
      await expect(fresh.page.getByTestId('oauth-consent')).toContainText(
        'Weekly digest wants to act for you',
      );
      await fresh.page.getByTestId('oauth-deny').click();
      await fresh.page.waitForURL(/^https:\/\/digest\.example\/callback\?/);
      expect(new URL(fresh.page.url()).searchParams.get('error')).toBe('access_denied');

      await digest.dispose();
      await phone.close();
      await theirs.close();
      expect([...errors, ...app.errors, ...fresh.errors]).toEqual([]);
    });

    test('the clinic’s AI agent answers first, says it’s an AI, and hands over to a person', async () => {
      const handle = `nile.dental.${stamp}`;
      const orgName = `Nile Dental ${stamp}`;
      const agentName = `${orgName} Assistant`;
      const { page, errors } = noor;
      await page.goto(`/o/${handle}`);
      await page.getByTestId('org-agent-setup').click();
      await expect(page.getByTestId('org-agent-name')).toHaveValue(agentName);
      await page
        .getByTestId('org-agent-knowledge')
        .fill(
          'We are open Sunday to Thursday 9am to 6pm and Saturday 9am to 1pm. A check-up costs 400 EGP. To book, call 02 2345 6789.',
        );
      // Tried first: nothing reaches anyone.
      await page.getByTestId('org-agent-question').fill('How much does a check-up cost?');
      await page.getByTestId('org-agent-try').click();
      const tried = page.getByTestId('org-agent-tried');
      await expect(tried).toContainText('Answers · nothing was sent');
      await expect(tried).toContainText('A check-up costs 400 EGP.');
      await page.screenshot({ path: 'e2e/screenshots/desktop-org-agent.png' });
      await page.getByTestId('org-agent-save').click();
      await expect(page.getByTestId('org-agent')).toContainText('Answers first');
      await expect(visible(page, 'AI agent · says so in everything it writes')).toBeVisible();

      // Lina knows before she writes that an AI answers first, and its answer says so.
      const customer = lina.page;
      await customer.goto(`/@${handle}`);
      await expect(customer.getByTestId('org-agent-line')).toHaveText(
        `${agentName}, its AI agent, answers first and says so. Ask for a person any time.`,
      );
      await customer.getByTestId('org-message').click();
      const write = async (text: string) => {
        await customer.getByTestId('composer-input').filter({ visible: true }).fill(text);
        await customer.getByTestId('composer-send').filter({ visible: true }).click();
      };
      await write('Are you open on Saturday?');
      const answer = customer
        .getByLabel(/AI agent, Hi, I’m Nile Dental .+’s AI agent\. We are open Sunday/)
        .filter({ visible: true });
      await expect(answer.getByTestId('message-automated')).toHaveText('AI agent ·');
      await customer.screenshot({ path: 'e2e/screenshots/phone-business-ai-agent.png' });

      // Asked for a person, it hands over, and the team sees why the customer is waiting.
      await write('Can I talk to a person about my filling?');
      await expect(
        visible(customer, `I’ve passed this to the team at ${orgName}. Someone will answer here.`),
      ).toBeVisible();
      await page.goto(`/o/${handle}/inbox`);
      await expect(page.getByTestId(`thread-row-lina.${stamp}`)).toContainText('Handed over by AI');
      await page.screenshot({ path: 'e2e/screenshots/desktop-business-handed-over.png' });

      // Removed, it leaves the team; what it wrote stays.
      await page.goto(`/o/${handle}`);
      await page.getByTestId('org-agent').click();
      await page.getByTestId('org-agent-remove').click();
      await page.getByTestId('org-agent-remove-confirm').click();
      await expect(page.getByTestId('org-agent-setup')).toBeVisible();
      expect([...errors, ...lina.errors]).toEqual([]);
    });

    test('a location shared live follows its sharer until they stop', async () => {
      const { page, errors } = noor;
      await noorContext.setGeolocation({ latitude: 30.0444, longitude: 31.2357, accuracy: 15 });
      await page.goto(`/c/${convo}`);
      await alex.page.goto(`/c/${convo}`);
      await page.getByRole('button', { name: 'Share a photo, a file or a card' }).click();
      await page.getByTestId('kit-option-location').click();
      await page.getByTestId('location-here').click();
      await expect(page.getByTestId('location-found')).toHaveText('Found you, within 15 m.');
      await page.getByRole('tab', { name: '15 min' }).click();
      await page.getByTestId('kit-send').click();

      // Noor sees she's sharing for as long as she is, with a way to stop.
      const sharing = page.getByTestId('live-location-sharing');
      await expect(sharing).toContainText('Sharing your location live · until');
      const theirs = alex.page
        .getByTestId('message-location')
        .filter({ hasText: 'Live location', visible: true });
      await expect(theirs).toContainText(/Live until .+ · updated just now/);
      await expect(theirs).toContainText('Within 15 m');

      // She moves; Alex sees where she is now.
      await noorContext.setGeolocation({ latitude: 30.0561, longitude: 31.2394, accuracy: 30 });
      await expect(theirs).toContainText('Within 30 m');
      await alex.page.screenshot({ path: 'e2e/screenshots/phone-live-location.png' });
      await page.screenshot({ path: 'e2e/screenshots/desktop-live-location.png' });

      // Stopped, it stays where she was last seen.
      await page.getByTestId('live-location-stop').click();
      await expect(sharing).toHaveCount(0);
      await expect(theirs).toContainText(/Shared live · stopped at/);
      await expect(theirs).toContainText('Within 30 m');
      expect([...errors, ...alex.errors]).toEqual([]);
    });

    test('a video call rings on Alex’s phone, connects, and leaves how long they talked', async () => {
      const { page, errors } = noor;
      await page.goto(`/c/${convo}`);
      await alex.page.goto('/');
      await page.getByTestId('call-video').click();
      // It rings wherever Alex is in the app.
      await expect(alex.page.getByTestId('call-incoming')).toBeVisible();
      await expect(alex.page.getByTestId('call-status')).toHaveText('Video call · calling you');
      // A dialog with a name, and the keyboard is on Answer.
      await expect(
        alex.page.getByRole('alertdialog', { name: 'Video call with Noor Haddad' }),
      ).toBeVisible();
      await expect(alex.page.getByTestId('call-accept')).toBeFocused();
      await expect(page.getByTestId('call-status')).toHaveText('Calling…');
      await alex.page.screenshot({ path: 'e2e/screenshots/phone-call-incoming.png' });
      await alex.page.getByTestId('call-accept').click();

      // Connected: each sees the other's camera, and the clock runs.
      await expect(page.getByTestId('call-status')).toHaveText(/^0:\d\d$/, { timeout: 20_000 });
      await expect(alex.page.getByTestId('call-status')).toHaveText(/^0:\d\d$/);
      const seeing = (p: Page) =>
        p
          .getByTestId('call-remote')
          .evaluate((v) => v instanceof HTMLVideoElement && v.videoWidth > 0 && !v.paused)
          .catch(() => false);
      await expect.poll(() => seeing(page)).toBe(true);
      await expect.poll(() => seeing(alex.page)).toBe(true);
      await page.getByTestId('call-mute').click();
      await expect(page.getByTestId('call-mute')).toHaveAccessibleName('Unmute');
      // The keyboard stays in the call: past Hang up, Tab comes back round, never behind it.
      await page.getByTestId('call-hangup').focus();
      await page.keyboard.press('Tab');
      expect(
        await page.evaluate(() =>
          Boolean(document.activeElement?.closest('[data-testid="call-screen"]')),
        ),
      ).toBe(true);
      // The running clock isn't read out every second.
      await expect(page.getByTestId('call-status')).toHaveAttribute('aria-live', 'off');
      // Noor shows her screen instead of her camera, and Alex is told, with her mute.
      await expect(alex.page.getByTestId('call-theirs')).toHaveText('Muted');
      await page.getByTestId('call-share').click();
      await expect(alex.page.getByTestId('call-theirs')).toHaveText(
        'Noor is sharing their screen · Muted',
      );
      await expect(page.getByTestId('call-you-share')).toBeVisible();
      await expect.poll(() => seeing(alex.page)).toBe(true);
      await alex.page.screenshot({ path: 'e2e/screenshots/phone-call-screen-shared.png' });
      await page.getByTestId('call-share').click();
      await expect(alex.page.getByTestId('call-theirs')).toHaveText('Muted');
      await page.screenshot({ path: 'e2e/screenshots/desktop-call-active.png' });
      await alex.page.screenshot({ path: 'e2e/screenshots/phone-call-active.png' });

      // Hung up, it's over for both, and the conversation keeps it.
      await page.getByTestId('call-hangup').click();
      await expect(page.getByTestId('call-screen')).toHaveCount(0);
      await expect(alex.page.getByTestId('call-screen')).toHaveCount(0);
      await expect(visible(page, 'Video call · under a minute')).toBeVisible();
      await alex.page.goto(`/c/${convo}`);
      await expect(visible(alex.page, 'Video call · under a minute')).toBeVisible();

      // A voice call can show a screen too: video went both ways from the start.
      await page.getByTestId('call-voice').click();
      await alex.page.getByTestId('call-accept').click();
      await expect(page.getByTestId('call-status')).toHaveText(/^0:\d\d$/, { timeout: 20_000 });
      await expect(alex.page.getByTestId('call-remote')).toHaveCount(1);
      await page.getByTestId('call-share').click();
      await expect(alex.page.getByTestId('call-theirs')).toHaveText('Noor is sharing their screen');
      await expect.poll(() => seeing(alex.page)).toBe(true);
      await page.screenshot({ path: 'e2e/screenshots/desktop-voice-call-sharing.png' });
      await page.getByTestId('call-hangup').click();
      await expect(alex.page.getByTestId('call-screen')).toHaveCount(0);

      // It rings in both of Alex's tabs; closing one leaves the other ringing.
      const second = await alexContext.newPage();
      await second.goto('/');
      await page.getByTestId('call-voice').click();
      await expect(second.getByTestId('call-incoming')).toBeVisible();
      await expect(alex.page.getByTestId('call-incoming')).toBeVisible();
      await second.close();
      await alex.page.waitForTimeout(1500);
      await expect(alex.page.getByTestId('call-incoming')).toBeVisible();
      await expect(page.getByTestId('call-status')).toHaveText('Calling…');

      // Turned down, the caller hears so, and each side reads it their way.
      await alex.page.getByTestId('call-decline').click();
      await expect(page.getByTestId('call-status')).toHaveText('Alex Chen didn’t answer.');
      await expect(visible(page, 'Voice call · no answer')).toBeVisible();
      await expect(visible(alex.page, 'You declined a voice call')).toBeVisible();
      expect([...errors, ...alex.errors]).toEqual([]);
    });

    test('a group video call rings everyone in the group and connects all three', async () => {
      if (!linaContext) throw new Error('The link test signs Lina up first.');
      const { page, errors } = noor;
      const linaId = (await (await linaContext.request.get('/v1/me')).json()).user.id as string;
      const asked = await noorContext.request.post('/v1/connections/requests', {
        headers: CLIENT,
        data: { toUserId: linaId },
      });
      if (asked.ok())
        await linaContext.request.post(
          `/v1/connections/requests/${(await asked.json()).requestId}/accept`,
          { headers: CLIENT, data: {} },
        );
      const made = await noorContext.request.post('/v1/conversations', {
        headers: CLIENT,
        data: { kind: 'group', title: 'Weekend plans', memberIds: [alexId, linaId] },
      });
      expect(made.ok(), await made.text()).toBe(true);
      const group = (await made.json()).conversation.id as string;
      await page.goto(`/c/${group}`);
      await alex.page.goto('/');
      await lina.page.goto('/');

      // It rings for both, and says who's calling where.
      await page.getByTestId('group-call-video').click();
      for (const p of [alex.page, lina.page]) {
        await expect(
          p.getByRole('alertdialog', { name: 'Group video call in Weekend plans' }),
        ).toBeVisible();
        await expect(p.getByTestId('group-call-status')).toHaveText(
          'Noor Haddad is calling · Group video call',
        );
        await expect(p.getByTestId('group-call-join')).toBeFocused();
      }
      await expect(page.getByTestId('group-call-status')).toHaveText('Calling…');
      await expect(page.getByTestId('group-call-count')).toHaveText('Only you so far');
      await alex.page.screenshot({ path: 'e2e/screenshots/phone-group-call-incoming.png' });

      // Each who joins connects to everyone already in it, and the clock runs.
      await alex.page.getByTestId('group-call-join').click();
      await expect(page.getByTestId('group-call-status')).toHaveText(/^0:\d\d$/, {
        timeout: 20_000,
      });
      await lina.page.getByTestId('group-call-join').click();
      const seeing = (p: Page) =>
        p
          .getByTestId('group-call-remote')
          .evaluateAll(
            (vs) =>
              vs.filter((v) => v instanceof HTMLVideoElement && v.videoWidth > 0 && !v.paused)
                .length,
          )
          .catch(() => 0);
      for (const p of [page, alex.page, lina.page]) {
        await expect(p.getByTestId('group-call-count')).toHaveText('3 in the call');
        await expect.poll(() => seeing(p), { timeout: 20_000 }).toBe(2);
      }

      // What each shows is said on their tile, on every other device.
      await page.getByTestId('group-call-mute').click();
      await expect(page.getByTestId('group-call-mute')).toHaveAccessibleName('Unmute');
      for (const p of [alex.page, lina.page])
        await expect(p.locator('[aria-label="Noor Haddad, muted"]')).toBeVisible();
      await page.getByTestId('group-call-share').click();
      for (const p of [alex.page, lina.page])
        await expect(p.getByTestId('group-call-spotlight')).toContainText(
          'Noor is sharing their screen',
        );
      await page.screenshot({ path: 'e2e/screenshots/desktop-group-call.png' });
      await alex.page.screenshot({ path: 'e2e/screenshots/phone-group-call-shared.png' });
      await page.getByTestId('group-call-share').click();
      await expect(alex.page.getByTestId('group-call-spotlight')).toHaveCount(0);

      // One leaves, and it goes on for the other two.
      await lina.page.getByTestId('group-call-leave').click();
      await expect(lina.page.getByTestId('group-call-screen')).toHaveCount(0);
      for (const p of [page, alex.page]) {
        await expect(p.getByTestId('group-call-count')).toHaveText('2 in the call');
        await expect.poll(() => seeing(p)).toBe(1);
      }
      // Lina finds it on in the group, and joins again from there.
      await lina.page.goto(`/c/${group}`);
      const banner = lina.page.getByTestId('group-call-banner').filter({ visible: true });
      await expect(banner).toContainText(/Video call on · (Noor and Alex|Alex and Noor)/);
      await lina.page.screenshot({ path: 'e2e/screenshots/phone-group-call-banner.png' });
      await banner.getByTestId('group-call-banner-join').click();
      for (const p of [page, alex.page, lina.page])
        await expect(p.getByTestId('group-call-count')).toHaveText('3 in the call');
      await expect.poll(() => seeing(lina.page), { timeout: 20_000 }).toBe(2);

      // With fewer than two left in it, it ends, and the group gets its line.
      await lina.page.getByTestId('group-call-leave').click();
      await alex.page.getByTestId('group-call-leave').click();
      await expect(page.getByTestId('group-call-screen')).toHaveCount(0);
      await expect(alex.page.getByTestId('group-call-screen')).toHaveCount(0);
      await expect(visible(page, 'Group video call · under a minute')).toBeVisible();
      await expect(visible(lina.page, 'Group video call · under a minute')).toBeVisible();
      await expect(lina.page.getByTestId('group-call-banner')).toHaveCount(0);
      expect([...errors, ...alex.errors, ...lina.errors]).toEqual([]);
    });

    test('every call is kept: newest first, the missed ones, and those with one person', async () => {
      const { page, errors } = noor;
      await page.goto('/calls');
      const rows = page.getByTestId('call-history-row');
      await expect(rows.first()).toContainText('Weekend plans');
      await expect(rows.first()).toContainText('Outgoing · under a minute');
      // Alex turned one down; to Noor, who called, it went unanswered.
      await expect(
        rows.filter({ hasText: 'Alex Chen' }).filter({ hasText: 'No answer' }),
      ).toHaveCount(1);
      await page.screenshot({ path: 'e2e/screenshots/desktop-call-history.png' });

      // Alex finds his from People; he missed none.
      await alex.page.goto('/people');
      await alex.page.getByTestId('people-calls').click();
      await expect(alex.page).toHaveURL(/\/calls$/);
      const his = alex.page.getByTestId('call-history-row');
      await expect(his.filter({ hasText: 'You declined a voice call' })).toHaveCount(1);
      await expect(his.filter({ hasText: 'Incoming · under a minute' })).toHaveCount(3);
      await alex.page.screenshot({ path: 'e2e/screenshots/phone-call-history.png' });
      await alex.page.getByRole('tab', { name: 'Missed' }).click();
      await expect(visible(alex.page, 'No missed calls')).toBeVisible();

      // On Alex's profile, Noor sees their latest calls.
      await page.goto(`/p/${alexId}`);
      const theirs = page.getByTestId('person-calls').filter({ visible: true });
      await expect(theirs.getByTestId('call-history-row')).toHaveCount(3);
      await expect(theirs).toContainText('Alex Chen');
      expect([...errors, ...alex.errors]).toEqual([]);
    });

    test('a private conversation only their devices read, with a code to check it’s them', async ({
      browser,
    }) => {
      const { page, errors } = noor;
      // Both have been signed in on the web here, so each browser has its keys already.
      await page.goto(`/p/${alexId}`);
      await page.getByTestId('person-private').click();
      await page.waitForURL('**/c/**');
      const privateId = page.url().split('/c/')[1]?.split(/[?#]/)[0] as string;
      await expect(visible(page, 'Private · end to end encrypted')).toBeVisible();
      const code = randomBytes(3).toString('hex');
      const secret = `The door code is ${code}`;
      await page.getByTestId('composer-input').fill(secret);
      await page.getByTestId('composer-send').click();
      await expect(visible(page, secret)).toBeVisible();

      // What the server keeps is an envelope: the words are never in it. (It shows at once, from
      // the outbox; the server has it once it's sent.)
      const kept = async () =>
        (
          await noorContext.request.get(`/v1/conversations/${privateId}/messages`, {
            headers: CLIENT,
          })
        ).text();
      await expect
        .poll(async () =>
          (JSON.parse(await kept()).messages as Array<{ body: unknown; sealed: unknown }>)
            .filter((m) => m.sealed)
            .map((m) => m.body),
        )
        .toEqual([null]);
      expect(await kept()).not.toContain(code);

      // Alex reads it on his phone, and answers.
      await alex.page.goto(`/c/${privateId}`);
      await expect(visible(alex.page, secret)).toBeVisible();
      const answer = 'Got it, thanks';
      await alex.page.getByTestId('composer-input').fill(answer);
      await alex.page.getByTestId('composer-send').click();
      await expect(visible(page, answer)).toBeVisible();

      // They compare codes: the one Noor sees as hers is the one Alex sees as Noor's.
      await page.getByTestId('private-info').click();
      const hers = ((await page.getByTestId('private-my-code').textContent()) ?? '').trim();
      expect(hers).toMatch(/^\d{5}( \d{5}){5}$/);
      await alex.page.getByTestId('private-info').click();
      const card = alex.page.getByTestId('private-code');
      await expect(card).toContainText(hers);
      await card.getByTestId('private-code-accept').click();
      await expect(card).toContainText('You compared it with Noor');
      await alex.page.screenshot({ path: 'e2e/screenshots/phone-private-code.png' });
      await page.screenshot({ path: 'e2e/screenshots/desktop-private.png' });
      await page.keyboard.press('Escape');
      await alex.page.keyboard.press('Escape');

      // Alex signs in on a laptop too. It reads and writes nothing private until Alex says, on
      // his phone, that it's his.
      const laptop = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const signedIn = await laptop.request.post('/v1/auth/login', {
        headers: CLIENT,
        data: { identifier: `alex.${stamp}`, password: PASSWORD },
      });
      expect(signedIn.ok(), await signedIn.text()).toBe(true);
      const second = await newPerson(laptop);
      await second.page.goto(`/c/${privateId}`);
      await expect(second.page.getByTestId('private-blocked')).toContainText(
        'once you approve it on another device',
      );
      await expect(second.page.getByTestId('message-sealed-note').first()).toHaveText(
        'This browser reads private messages once you approve it on another of your devices.',
      );
      await second.page.screenshot({ path: 'e2e/screenshots/desktop-private-waiting.png' });
      // Every browser Alex signed in on since his phone waits for him (the laptop, and others
      // earlier in this run): he says each is his.
      await alex.page.goto('/');
      const asks = alex.page.getByTestId('private-waiting');
      await expect(asks.first()).toContainText('Is this you?');
      await alex.page.screenshot({ path: 'e2e/screenshots/phone-private-approve.png' });
      for (let left = await asks.count(); left > 0; left--) {
        await asks.first().getByTestId('private-approve').click();
        await expect(asks).toHaveCount(left - 1);
      }
      // Approved: the laptop can't read what was sent before it, and reads what's sent after.
      // Alex's code is the same as before (his phone vouches for the laptop): Noor isn't told
      // it changed.
      await expect(second.page.getByTestId('message-sealed-note').first()).toHaveText(
        'Sent before this device could read private messages.',
      );
      await expect(second.page.getByTestId('private-blocked')).toHaveCount(0);
      await expect(page.getByTestId('private-code-changed')).toHaveCount(0);
      const later = 'And the laptop reads this one';
      await page.getByTestId('composer-input').fill(later);
      await page.getByTestId('composer-send').click();
      await expect(visible(second.page, later)).toBeVisible();
      await alex.page.goto(`/c/${privateId}`);
      await expect(visible(alex.page, later)).toBeVisible();
      expect([...errors, ...alex.errors, ...second.errors]).toEqual([]);
      await laptop.close();
    });
    test('two of Noor’s people who may be one are offered to her, merged, and separated again', async () => {
      if (!linaContext) throw new Error('The link test signs Lina up first.');
      const { page, errors } = noor;
      const linaId = (await (await linaContext.request.get('/v1/me')).json()).user.id as string;
      const mine = async () =>
        (
          (await (await noorContext.request.get('/v1/connections')).json()).connections as Array<{
            connectionId: string;
            person: { id: string };
          }>
        ).filter((c) => [alexId, linaId].includes(c.person.id));
      // Noor calls them both the same: that's something she can see, so it's offered.
      for (const c of await mine()) {
        const named = await noorContext.request.patch(`/v1/connections/${c.connectionId}`, {
          headers: CLIENT,
          data: { nickname: 'Al' },
        });
        expect(named.ok(), await named.text()).toBe(true);
      }
      await page.goto('/people');
      const offer = page.getByTestId('duplicate-offer').filter({ visible: true });
      await expect(offer).toContainText('Lina Farah and Alex Chen may be the same person');
      await expect(offer).toContainText('Both have the same nickname.');
      await page.screenshot({ path: 'e2e/screenshots/desktop-duplicate-offer.png' });
      await offer.getByTestId('duplicate-merge').click();
      await expect(visible(page, 'Merged: Al is one person in People now')).toBeVisible();
      await expect(offer).toHaveCount(0);
      // One row for the two of them, and on it, the other account.
      await expect(visible(page, '2 accounts')).toBeVisible();
      await visible(page, '2 accounts').click();
      await page.waitForURL(`**/p/${alexId}`);
      const other = page.getByTestId('other-account').filter({ visible: true });
      await expect(other).toContainText('Lina Farah');
      await expect(visible(page, 'Only you see them as one.')).toBeVisible();
      // Only in Noor's view: Lina sees nothing of it.
      expect(
        (
          (await (await linaContext.request.get('/v1/connections')).json()).connections as Array<{
            mergedInto: string | null;
          }>
        ).every((c) => c.mergedInto === null),
      ).toBe(true);
      // Not the same after all.
      await other.getByTestId('separate-account').click();
      await expect(
        visible(page, 'Separated: Lina Farah is on their own in People again'),
      ).toBeVisible();
      await expect(other).toHaveCount(0);
      await expect(page.getByText('2 accounts').filter({ visible: true })).toHaveCount(0);
      for (const c of await mine())
        await noorContext.request.patch(`/v1/connections/${c.connectionId}`, {
          headers: CLIENT,
          data: { nickname: null },
        });
      expect(errors).toEqual([]);
    });
    test('a group is run from its details: people added, an admin made, someone removed, and it passes on', async () => {
      const { page, errors } = noor;
      const title = `Book club ${stamp}`;
      await page.goto('/new-group');
      await page.getByLabel('Group name').fill(title);
      await page.getByTestId(`pick-alex.${stamp}`).click();
      await page.getByRole('button', { name: 'Create group' }).click();
      await page.waitForURL('**/c/**');
      const id = new URL(page.url()).pathname.split('/').at(-1) ?? '';
      // Its details say who's in it and who runs it.
      const panel = page.getByTestId('group-people').filter({ visible: true });
      await expect(panel).toContainText('Noor Haddad (you)');
      await expect(panel).toContainText('Owner');

      // Noor adds Lina, and makes Alex an admin.
      await panel.getByTestId('group-add').click();
      await page.getByTestId(`pick-lina.${stamp}`).filter({ visible: true }).click();
      await page.getByTestId('group-add-confirm').click();
      await expect(visible(page, 'Added 1 person')).toBeVisible();
      await expect(panel.getByTestId('group-person')).toHaveCount(3);
      await panel.getByTestId('group-person').filter({ hasText: 'Alex Chen' }).click();
      await page.getByTestId('group-toggle-admin').click();
      await expect(visible(page, 'Alex Chen is an admin')).toBeVisible();
      await expect(visible(page, 'You made Alex Chen an admin')).toBeVisible();

      // Its name and what it's for change from there too.
      await panel.getByTestId('group-edit').click();
      await page.getByTestId('group-edit-purpose').fill('One book a month');
      await page.getByTestId('group-edit-save').click();
      await expect(visible(page, 'One book a month')).toBeVisible();

      // Removed, Lina is out of it; Noor leaves, and Alex owns it now.
      await panel.getByTestId('group-person').filter({ hasText: 'Lina Farah' }).click();
      await page.getByTestId('group-remove').click();
      await expect(visible(page, 'Removed Lina Farah')).toBeVisible();
      await expect(panel.getByTestId('group-person')).toHaveCount(2);
      await panel.getByTestId('group-leave').click();
      await page.getByTestId('group-leave-confirm').click();
      await page.waitForURL((url) => new URL(url).pathname === '/');

      const phone = alex.page;
      await phone.goto(`/c/${id}`);
      await expect(visible(phone, 'You own the group now')).toBeVisible();
      await phone.getByRole('button', { name: /, details$/ }).click();
      const his = phone.getByTestId('group-people').filter({ visible: true });
      await expect(his).toContainText('Alex Chen (you)');
      await expect(his).toContainText('Owner');
      await expect(his.getByTestId('group-person')).toHaveCount(1);
      await phone.screenshot({ path: 'e2e/screenshots/phone-group-details.png' });
      expect([...errors, ...alex.errors]).toEqual([]);
    });
    test('Lina follows Nile Dental, and its updates reach her apart from her conversations', async () => {
      if (!linaContext) throw new Error('The link test signs Lina up first.');
      const linas = linaContext;
      const handle = `nile.dental.${stamp}`;
      const name = `Nile Dental ${stamp}`;
      const phone = lina.page;
      await phone.goto(`/o/${handle}`);
      await phone.getByTestId('org-follow').filter({ visible: true }).click();
      await expect(visible(phone, `Following ${name}: its updates are in Updates`)).toBeVisible();

      // Its owner posts; the team sees how many follow, never who.
      const { page, errors } = noor;
      await page.goto(`/o/${handle}`);
      await expect(visible(page, '1 person follows it. Nobody sees who.')).toBeVisible();
      await page.getByTestId('org-update-draft').fill('Open this Saturday from 9 to 1.');
      await page.getByTestId('org-update-post').click();
      await expect(visible(page, 'Posted')).toBeVisible();
      await expect(page.getByTestId('org-update').first()).toContainText('by Noor Haddad');
      await page.screenshot({ path: 'e2e/screenshots/desktop-org-updates.png' });

      // In Chats it's one row of its own; opened, it's what the organization said.
      await phone.goto('/');
      const row = phone.getByTestId('updates-row').filter({ visible: true });
      await expect(row).toContainText(`New from ${name}`);
      await row.click();
      await phone.waitForURL('**/updates');
      await expect(phone.getByTestId('following-row').filter({ visible: true })).toContainText(
        'Open this Saturday from 9 to 1.',
      );
      await phone.screenshot({ path: 'e2e/screenshots/phone-updates.png' });
      await phone.getByTestId('following-row').filter({ visible: true }).click();
      const update = phone.getByTestId('org-update').filter({ visible: true }).first();
      await expect(update).toContainText('Open this Saturday from 9 to 1.');
      await expect(update).not.toContainText('Noor');

      // Told of the next one, if she asks; one taken back is gone for her too.
      await phone.getByTestId('org-notify').filter({ visible: true }).click();
      await expect(visible(phone, 'You’ll be notified of its updates')).toBeVisible();
      await page.getByTestId('org-update-draft').fill('Closed Monday for the holiday.');
      await page.getByTestId('org-update-post').click();
      await expect
        .poll(async () =>
          (
            (await (await linas.request.get('/v1/notifications')).json()).notifications as Array<{
              kind: string;
              body: string | null;
            }>
          )
            .filter((n) => n.kind === 'update')
            .map((n) => n.body),
        )
        .toEqual(['Closed Monday for the holiday.']);
      await page.getByTestId('org-update-remove').first().click();
      await expect(visible(page, 'Update taken back')).toBeVisible();
      // Its words go from her notifications too.
      await expect
        .poll(async () =>
          (
            (await (await linas.request.get('/v1/notifications')).json()).notifications as Array<{
              kind: string;
            }>
          ).filter((n) => n.kind === 'update'),
        )
        .toEqual([]);
      await phone.reload();
      await expect(phone.getByTestId('org-update').filter({ visible: true })).toHaveCount(1);

      // Blocked from its page, she follows it no more, and the page says so at once; unblocked,
      // she can follow it again.
      await phone.getByTestId('org-block').filter({ visible: true }).click();
      await phone.getByTestId('org-block-confirm').filter({ visible: true }).click();
      await expect(phone.getByTestId('org-unblock').filter({ visible: true })).toBeVisible();
      await expect(phone.getByTestId('org-unfollow').filter({ visible: true })).toHaveCount(0);
      await expect(phone.getByTestId('org-notify').filter({ visible: true })).toHaveCount(0);
      await phone.getByTestId('org-unblock').filter({ visible: true }).click();
      await expect(phone.getByTestId('org-follow').filter({ visible: true })).toBeVisible();
      expect([...errors, ...lina.errors]).toEqual([]);
    });
    test('this browser can show calls and messages when Caishy isn’t open', async () => {
      const { page, errors } = noor;
      // The service worker is served fresh on every check, as a script.
      const sw = await noorContext.request.get('/sw.js');
      expect(sw.ok()).toBe(true);
      expect(sw.headers()['cache-control']).toBe('no-cache');
      expect(sw.headers()['content-type']).toContain('javascript');
      await page.goto('/settings/notifications');
      await expect(
        page.getByTestId('browser-notifications').filter({ visible: true }),
      ).toBeVisible();
      // It registers under the app's own content security policy.
      const scope = await page.evaluate(async () => {
        const reg = await navigator.serviceWorker.register('/sw.js');
        await navigator.serviceWorker.ready;
        return reg.scope;
      });
      expect(scope).toBe(`${new URL(page.url()).origin}/`);
      expect(errors).toEqual([]);
    });
  });
