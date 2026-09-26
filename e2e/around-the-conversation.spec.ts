/**
 * What surrounds a conversation, end to end: a relationship that changes and keeps its history,
 * search that opens the message it found, stickers, a message written offline that sends when
 * the network returns, actions and alerts, spaces, organizations, settings that follow you, and AI
 * assist. One pair of people is shared by these tests (sign-ups are rate limited per address), so
 * they run in order.
 */
import { randomUUID } from 'node:crypto';
import { type BrowserContext, expect, type Page, test } from '@playwright/test';
import {
  ADMIN_TOKEN,
  apiSignUp,
  CLIENT,
  METRICS_TOKEN,
  newPerson,
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
      await expect(visible(page, /Pro can’t be bought here yet\./)).toBeVisible();
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

    test('on Business, an organization sees how its inbox is doing', async () => {
      const { page, errors } = noor;
      const handle = `nile.dental.${stamp}`;
      // The operator moves it to Business (billing isn't connected yet).
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
        await expect(page.getByTestId('composer-input').filter({ visible: true })).toBeVisible();
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
  });
