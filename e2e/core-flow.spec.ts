/**
 * The core promise, end to end: two people sign up (phone and desktop), connect with private
 * labels, and talk in real time; Caime offers one suggestion from the exchange, not two.
 */
import { expect, type Page, test } from '@playwright/test';
import { apiSignUp, CLIENT, newPerson, PASSWORD, visible } from './helpers';

const stamp = Date.now().toString(36).slice(-6);
const SHOTS = 'e2e/screenshots';

async function signUp(page: Page, name: string, handle: string) {
  await page.goto('/welcome');
  await page.getByTestId('welcome-sign-up').click();
  await page.getByTestId('signup-name').fill(name);
  await page.getByTestId('signup-handle').fill(handle);
  await page.getByTestId('signup-email').fill(`${handle}@example.com`);
  await page.getByTestId('signup-password').fill('a long enough passphrase');
  // The browser's own date field, typed as the day it is.
  await page.getByTestId('signup-birth-date').fill('1990-12-31');
  // Where they live starts as where the browser is (en-US here), and is found by typing.
  await expect(page.getByTestId('signup-country')).toContainText('United States');
  await page.getByTestId('signup-country').click();
  await page.getByTestId('signup-country-search').fill('egy');
  await page.getByTestId('signup-country-EG').click();
  await expect(page.getByTestId('signup-country')).toContainText('Egypt');
  await expect(page.getByText('Available')).toBeVisible();
  await page.getByTestId('signup-submit').click();
  await page.waitForURL('**/onboarding');
}

async function onboard(page: Page, shot: string, findPeople: boolean) {
  await page.getByText('Copy the codes').click();
  // Each step says where it is, as a spec sheet labels it.
  await expect(page.getByTestId('onboarding-step')).toHaveText('step 1 of 3 · recovery codes');
  await page.getByTestId('onboarding-codes-next').click();
  await expect(page.getByTestId('onboarding-rules-next')).toBeVisible();
  await expect(page.getByTestId('onboarding-step')).toHaveText('step 2 of 3 · how Caime works');
  await page.screenshot({ path: `${SHOTS}/${shot}-rules.png` });
  await page.getByTestId('onboarding-rules-next').click();
  await page.getByTestId(findPeople ? 'onboarding-find' : 'onboarding-skip').click();
  // Finishing saves "onboarded" and then moves on; a navigation before it lands cancels the save
  // and the app sends the person back here (it did, on a slow runner).
  await page.waitForURL(findPeople ? '**/connect' : (url) => url.pathname === '/');
}

test('two people connect with private labels and talk in real time', async ({ browser }) => {
  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const a = await newPerson(phone);
  const b = await newPerson(desktop);
  const hassan = `hassan.${stamp}`;
  const sarah = `sarah.${stamp}`;

  // Hassan signs up on a phone and skips finding people.
  await signUp(a.page, 'Hassan Khalid', hassan);
  await onboard(a.page, 'phone', false);
  await expect(a.page.getByText('Say hello to someone')).toBeVisible();

  // Sarah signs up on a desktop, finds Hassan and labels him "Manager · DATA C".
  await signUp(b.page, 'Sarah Ahmed', sarah);
  await onboard(b.page, 'desktop', true);
  await b.page.waitForURL('**/connect');
  await b.page.getByTestId('connect-search').fill(hassan);
  await b.page.getByTestId(`connect-${hassan}`).click();
  await b.page.getByTestId('connect-classify').click();
  await b.page.getByRole('radio', { name: 'Work' }).click();
  await b.page.getByRole('button', { name: 'Manager' }).click();
  await b.page.getByPlaceholder('Company, school or organization').fill('DATA C');
  await b.page.getByTestId('relationship-save').click();
  await expect(b.page.getByText('Manager · DATA C')).toBeVisible();
  await b.page.getByTestId('connect-send').click();
  await expect(b.page.getByText(/Request sent/)).toBeVisible();

  // Hassan sees the request arrive live, with the context Sarah chose to share, and accepts.
  await a.page.getByTestId('tab-people').click();
  await visible(a.page, '1 person wants to connect').click();
  await expect(a.page.getByText(/Says you know each other from/)).toBeVisible();
  await a.page.getByTestId(`accept-${sarah}`).click();
  await a.page.getByRole('radio', { name: 'Work' }).click();
  await a.page.getByRole('button', { name: 'Direct report' }).click();
  await a.page.getByTestId('relationship-save').click();
  await a.page.waitForURL('**/c/**');
  const conversation = new URL(a.page.url()).pathname;
  // Nothing said yet: first words are offered, fitted to a work relationship, and a tap puts one
  // in the box. Nothing is sent by itself.
  await expect(a.page.getByTestId('first-words')).toContainText('Your first words with Sarah');
  await a.page.getByTestId('first-words-0').click();
  await expect(a.page.getByTestId('composer-input')).toHaveValue('Good to have you here, Sarah.');

  // A new conversation with someone he knows is the one they already have.
  await a.page.goto('/');
  await a.page.getByTestId('new-chat').filter({ visible: true }).click();
  await expect(a.page.getByText('New conversation', { exact: true })).toBeVisible();
  await a.page.getByPlaceholder('Search your people').fill('sarah');
  await a.page
    .getByRole('dialog')
    .getByRole('button', { name: /^Sarah Ahmed, @/ })
    .click();
  await expect.poll(() => new URL(a.page.url()).pathname).toBe(conversation);

  // They talk. The request and the reply that answers it become one suggestion.
  const ask = 'Hi Sarah! Can you send me the Q3 report by Friday?';
  const reply = 'Sure — I’ll send it Thursday.';
  await a.page.getByTestId('composer-input').fill(ask);
  await a.page.getByTestId('composer-send').click();
  await expect(visible(a.page, ask)).toBeVisible();

  await b.page.goto('/');
  await expect(visible(b.page, ask)).toBeVisible();
  await expect(b.page.getByRole('heading', { name: 'Needs you', exact: true })).toBeVisible();
  await b.page.getByText('Hassan Khalid').first().click();
  await b.page.getByTestId('composer-input').fill(reply);
  await b.page.keyboard.press('Enter');
  await expect(visible(a.page, reply)).toBeVisible();
  await expect(visible(b.page, 'Only you see how you’ve labelled Hassan Khalid')).toBeVisible();

  // Hassan's side: one waiting suggestion, now due Thursday, in Sarah's words.
  await expect(visible(a.page, 'Sarah wrote “Sure — I’ll send it Thursday.”')).toBeVisible();
  await expect(a.page.getByText(/1 of 2/)).toHaveCount(0);
  await a.page.screenshot({ path: `${SHOTS}/phone-conversation.png` });
  await b.page.screenshot({ path: `${SHOTS}/desktop-conversation.png` });

  // Dark mode follows the system.
  await b.page.emulateMedia({ colorScheme: 'dark' });
  await b.page.waitForTimeout(300);
  await b.page.screenshot({ path: `${SHOTS}/desktop-conversation-dark.png` });
  await b.page.emulateMedia({ colorScheme: 'light' });

  // Sarah mutes it from its row: the choices, and a day and time, open in the row's own sheet.
  await b.page.goto('/');
  const row = b.page.locator('[data-testid^="conversation-"]').filter({ hasText: 'Hassan Khalid' });
  await row.first().click({ delay: 700 });
  await b.page.getByTestId('row-mute').click();
  await expect(b.page.getByText('Mute notifications', { exact: true })).toBeVisible();
  await b.page.getByTestId('mute-until').click();
  await expect(b.page.getByTestId('mute-when-day')).toBeVisible();
  await b.page.getByRole('button', { name: 'Back' }).click();
  await b.page.getByTestId('mute-hour').click();
  await expect(visible(b.page, 'Muted for an hour')).toBeVisible();
  await row.first().click({ delay: 700 });
  await b.page.getByRole('button', { name: 'Unmute' }).click();
  await expect(visible(b.page, 'Unmuted')).toBeVisible();

  expect([...a.errors, ...b.errors]).toEqual([]);
  await phone.close();
  await desktop.close();
});

test('a signed-out visitor lands on the welcome page with no errors', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const { page, errors } = await newPerson(context);
  await page.goto('/c/00000000-0000-4000-8000-000000000000');
  await page.waitForURL('**/welcome');
  await expect(
    page.getByRole('heading', { name: 'Messaging that understands your relationships.' }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  await context.close();
});

test('before signing up, the terms and privacy policy open as pages, each leading to the others', async ({
  browser,
}) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const { page, errors } = await newPerson(context);
  await page.goto('/sign-up');
  const opened = context.waitForEvent('page');
  await page.getByTestId('signup-terms').click();
  const terms = await opened;
  // A page is only its own text and styles: nothing it loads or runs is refused.
  terms.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await expect(terms).toHaveURL(/\/terms$/);
  await expect(terms.getByRole('heading', { name: 'Terms', level: 1 })).toBeVisible();
  await expect(terms.getByText('DATA C OÜ').first()).toBeVisible();
  await terms.getByRole('navigation').getByRole('link', { name: 'Privacy' }).click();
  await expect(terms).toHaveURL(/\/privacy$/);
  await expect(terms.getByRole('heading', { name: 'Privacy', level: 1 })).toBeVisible();
  await expect(terms.getByRole('link', { name: 'hello@cai.me' }).first()).toHaveAttribute(
    'href',
    'mailto:hello@cai.me',
  );
  // Help is published somewhere else here (playwright.config.ts): Caime's page sends people there.
  await expect(terms.getByRole('navigation').getByRole('link', { name: 'Help' })).toHaveAttribute(
    'href',
    '/help',
  );
  const help = await context.request.get('/help', { maxRedirects: 0 });
  expect(help.status()).toBe(302);
  expect(help.headers().location).toBe('https://policies.example/help');
  // And back to Caime itself, signed out: the landing page (R44), a page without the app's
  // scripts, whose ways in open the app.
  await terms.getByRole('link', { name: 'Open Caime' }).click();
  await terms.waitForURL(/\/$/);
  await expect(
    terms.getByRole('heading', { name: 'Messaging that understands your relationships.' }),
  ).toBeVisible();
  await expect(terms.locator('script[src]')).toHaveCount(0);
  await terms.getByRole('link', { name: 'Start free' }).click();
  await terms.waitForURL('**/sign-up');
  await expect(terms.getByTestId('signup-terms')).toBeVisible();
  expect(errors).toEqual([]);
  await context.close();
});

test('a tab left open follows the browser when another signs out and in as someone else', async ({
  browser,
}) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const stamp = Date.now().toString(36);
  const noor = await apiSignUp(context, 'Noor Tabs', `noortabs${stamp}`);
  const alex = await apiSignUp(context, 'Alex Tabs', `alextabs${stamp}`);
  // The browser is Alex's now (signed up last): sign in as Noor.
  const first = await newPerson(context);
  const login = await context.request.post('/v1/auth/login', {
    headers: CLIENT,
    data: { identifier: noor.handle, password: PASSWORD, client: 'web' },
  });
  expect(login.ok()).toBe(true);
  await first.page.goto('/you');
  await expect(first.page.getByRole('img', { name: 'Noor Tabs' }).first()).toBeVisible();

  // In a second tab, Noor signs out, and Alex signs in.
  const second = await newPerson(context);
  await second.page.goto('/you');
  await second.page.getByTestId('sign-out').filter({ visible: true }).click();
  await second.page.waitForURL('**/welcome');
  // The first tab shows nobody's account either, as soon as it hears.
  await first.page.waitForURL('**/welcome');
  await second.page.goto('/sign-in');
  await second.page.getByTestId('signin-identifier').fill(alex.handle);
  await second.page.getByTestId('signin-password').fill(PASSWORD);
  await second.page.getByTestId('signin-submit').click();
  await expect(second.page.getByRole('img', { name: 'Alex Tabs' }).first()).toBeVisible();
  // And follows the browser in as Alex, never still as Noor.
  await expect(first.page.getByRole('img', { name: 'Alex Tabs' }).first()).toBeVisible();

  // A call the app still meant as Noor (a queue sent late) is refused, never made as Alex.
  const late = await context.request.post('/v1/tasks', {
    headers: { ...CLIENT, 'x-caime-user': noor.id },
    data: { title: 'Queued as Noor' },
  });
  expect(late.status()).toBe(409);
  // What the tabs asked in the moment the account changed under them is refused, and says so.
  expect([...first.errors, ...second.errors].filter((e) => !/\b40[19]\b/.test(e))).toEqual([]);
  await context.close();
});

test('a person can download their data and delete their account from settings', async ({
  browser,
}) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const { page, errors } = await newPerson(context);
  const handle = `leaving.${stamp}`;
  await signUp(page, 'Leaving Soon', handle);
  await onboard(page, 'leaving', false);
  // Where their times are, found by city: Language and region.
  await page.goto('/settings/region');
  await page.getByTestId('region-zone').click();
  await page.getByTestId('region-zone-search').fill('toky');
  await page.getByTestId('region-zone-Asia/Tokyo').click();
  await expect(page.getByTestId('region-zone')).toContainText('Tokyo');
  await expect(page.getByTestId('region-zone')).toContainText('GMT+9');
  // Dates and numbers as another language writes them, each named in itself.
  await page.getByTestId('region-language').click();
  await page.getByTestId('region-language-search').fill('deutsch');
  await page.getByTestId('region-language-de-DE').click();
  await expect(page.getByTestId('region-language')).toContainText('1.234,5');
  // A photo only some of their people see: by how they know them.
  await page.goto('/settings/privacy');
  await page.getByRole('button', { name: /^Profile photo/ }).click();
  await page.getByRole('radio', { name: /^Only some of your people/ }).click();
  await page.getByTestId('audience-family').click();
  await page.getByTestId('audience-friend').click();
  await page.getByTestId('audience-save').click();
  await expect(page.getByRole('button', { name: /^Profile photo/ })).toContainText(
    'Family, Friends',
  );
  // You is your picture at the top of Chats: its sheet leads to everything else.
  await page.goto('/');
  await page.getByTestId('you-button').click();
  // The sheet slides up; the picture is of it in place.
  await expect(page.getByTestId('you-all')).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: 'e2e/screenshots/phone-you.png', animations: 'disabled' });
  await page.getByTestId('you-all').click();
  await page.getByTestId('settings-security').click();
  // New recovery codes, once the password says it's them.
  await page.getByTestId('codes-new').click();
  await page.getByTestId('codes-password').fill('not the password');
  await page.getByTestId('codes-make').click();
  await expect(visible(page, 'Your password isn’t right.')).toBeVisible();
  errors.length = 0; // That 400 was asked for.
  await page.getByTestId('codes-password').fill('a long enough passphrase');
  await page.getByTestId('codes-make').click();
  await expect(page.getByText(/^[0-9A-Z]{4}-[0-9A-Z]{4}$/)).toHaveCount(10);
  const download = page.waitForEvent('download');
  await page.getByText('Download your data').click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^caime-export-\d{4}-\d{2}-\d{2}\.json$/);
  await page.getByTestId('delete-account').click();
  await page.getByTestId('delete-password').fill('a long enough passphrase');
  await page.getByTestId('delete-confirm').click();
  await page.waitForURL('**/welcome');
  await expect(page.getByText('Your account is deleted.', { exact: false })).toBeVisible();
  expect(errors).toEqual([]);
  await context.close();
});
