/**
 * The core promise, end to end: two people sign up (phone and desktop), connect with private
 * labels, and talk in real time; Caishy offers one suggestion from the exchange, not two.
 */
import { type BrowserContext, expect, type Page, test } from '@playwright/test';

const stamp = Date.now().toString(36).slice(-6);
const SHOTS = 'e2e/screenshots';

async function newPerson(context: BrowserContext): Promise<{ page: Page; errors: string[] }> {
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  page.on('response', (r) => {
    if (r.status() >= 400 && r.url().includes('/v1/'))
      errors.push(`${r.status()} ${r.request().method()} ${r.url()}`);
  });
  return { page, errors };
}

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

const visible = (page: Page, text: string) =>
  page.getByText(text).filter({ visible: true }).first();

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
