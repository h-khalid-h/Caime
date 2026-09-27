/**
 * The core promise, end to end: two people sign up (phone and desktop), connect with private
 * labels, and talk in real time; Caishy offers one suggestion from the exchange, not two.
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
  await page.getByTestId('signup-birth-year').fill('1990');
  await expect(page.getByText('Available')).toBeVisible();
  await page.getByTestId('signup-submit').click();
  await page.waitForURL('**/onboarding');
}

async function onboard(page: Page, shot: string, findPeople: boolean) {
  await page.getByText('Copy the codes').click();
  await page.getByTestId('onboarding-codes-next').click();
  await expect(page.getByTestId('onboarding-rules-next')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/${shot}-rules.png` });
  await page.getByTestId('onboarding-rules-next').click();
  await page.getByTestId(findPeople ? 'onboarding-find' : 'onboarding-skip').click();
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

  expect([...a.errors, ...b.errors]).toEqual([]);
  await phone.close();
  await desktop.close();
});

test('a signed-out visitor lands on the welcome page with no errors', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const { page, errors } = await newPerson(context);
  await page.goto('/c/00000000-0000-4000-8000-000000000000');
  await page.waitForURL('**/welcome');
  await expect(page.getByText('Messaging that understands your relationships.')).toBeVisible();
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
  await expect(terms.getByRole('link', { name: 'hello@caishy.com' }).first()).toHaveAttribute(
    'href',
    'mailto:hello@caishy.com',
  );
  // Help is published somewhere else here (playwright.config.ts): Caishy's page sends people there.
  await expect(terms.getByRole('navigation').getByRole('link', { name: 'Help' })).toHaveAttribute(
    'href',
    '/help',
  );
  const help = await context.request.get('/help', { maxRedirects: 0 });
  expect(help.status()).toBe(302);
  expect(help.headers().location).toBe('https://policies.example/help');
  // And back to Caishy itself, signed out: its welcome.
  await terms.getByRole('link', { name: 'Open Caishy' }).click();
  await terms.waitForURL('**/welcome');
  await expect(terms.getByText('Messaging that understands your relationships.')).toBeVisible();
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
    headers: { ...CLIENT, 'x-caishy-user': noor.id },
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
  await page.getByTestId('tab-you').click();
  await page.getByTestId('settings-security').click();
  const download = page.waitForEvent('download');
  await page.getByText('Download your data').click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^caishy-export-\d{4}-\d{2}-\d{2}\.json$/);
  await page.getByTestId('delete-account').click();
  await page.getByLabel('Your password').fill('a long enough passphrase');
  await page.getByTestId('delete-confirm').click();
  await page.waitForURL('**/welcome');
  await expect(page.getByText('Your account is deleted.', { exact: false })).toBeVisible();
  expect(errors).toEqual([]);
  await context.close();
});
