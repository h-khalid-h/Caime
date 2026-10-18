/**
 * Notice and action for everyone (M16 B6): a visitor on a phone reports an organization's page
 * from the page itself (no account, no script) and hears from Caime by mail, the receipt and then
 * the decision; a suspended person signing in is told why, appeals, downloads their data, and is
 * let back in when the operator lifts it.
 */
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { ADMIN_TOKEN, apiSignUp, CLIENT, mailsTo, PASSWORD, visible } from './helpers';

const operator = { authorization: `Bearer ${ADMIN_TOKEN}`, ...CLIENT };

test('a visitor reports a page from the page, and hears the receipt and the decision by mail', async ({
  browser,
}) => {
  const suffix = Date.now().toString(36);
  const team = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await apiSignUp(team, 'Omar Farouk', `omar.rp.${suffix}`);
  const handle = `quick.rp.${suffix}`;
  const made = await team.request.post('/v1/orgs', {
    headers: CLIENT,
    data: { country: 'EG', name: 'Quick Loans', handle, kind: 'business' },
  });
  expect(made.ok(), await made.text()).toBe(true);

  const visitor = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await visitor.newPage();
  await page.goto(`/o/${handle}`);
  await expect(page.locator('#static')).toBeVisible();
  expect(await page.locator('script[src]').count()).toBe(0);
  // Folded at the page's end until asked for.
  await expect(page.locator('#report form')).toBeHidden();
  await page.locator('#report summary').click();
  const email = `vera.rp.${suffix}@example.com`;
  await page.locator('#report input[value="scam"]').check();
  await page
    .locator('#report textarea[name="details"]')
    .fill('Asks for a fee up front, then stops answering.');
  await page.locator('#report input[name="name"]').fill('Vera Visitor');
  await page.locator('#report input[name="email"]').fill(email);
  await page.locator('#report input[name="statement"]').check();
  await page.locator('#report button[type="submit"]').click();
  await expect(page).toHaveURL(/[?&]reported=1/);
  await expect(visible(page, /Someone at Caime reads every report/)).toBeVisible();
  await expect
    .poll(async () => (await mailsTo(email)).map((m) => m.subject))
    .toContain('We received your report');

  // The operator dismisses it: the visitor hears that too, once.
  const listed = await team.request.get('/v1/admin/reports?status=open&limit=100', {
    headers: operator,
  });
  const { reports } = (await listed.json()) as {
    reports: Array<{ id: string; visitor: { email: string | null } | null }>;
  };
  const mine = reports.find((r) => r.visitor?.email === email);
  expect(mine).toBeTruthy();
  const settled = await team.request.patch(`/v1/admin/reports/${mine?.id}`, {
    headers: operator,
    data: { status: 'dismissed' },
  });
  expect(settled.ok(), await settled.text()).toBe(true);
  await expect
    .poll(async () => (await mailsTo(email)).map((m) => m.subject))
    .toContain('About your report');
});

test('a suspended person is told why, appeals, downloads their data, and is back once lifted', async ({
  browser,
}) => {
  const suffix = Date.now().toString(36);
  const handle = `sam.sp.${suffix}`;
  const setup = await browser.newContext();
  await apiSignUp(setup, 'Sam Rivers', handle);
  const reason = 'Sent the same advert to dozens of strangers.';
  const suspended = await setup.request.put(`/v1/admin/people/${handle}/suspension`, {
    headers: operator,
    data: { suspended: true, reason },
  });
  expect(suspended.ok(), await suspended.text()).toBe(true);

  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  await page.goto('/sign-in');
  await page.getByTestId('signin-identifier').fill(handle);
  await page.getByTestId('signin-password').fill(PASSWORD);
  await page.getByTestId('signin-submit').click();
  await expect(page.getByTestId('suspended')).toBeVisible();
  await expect(page.getByTestId('suspended-reason')).toContainText(reason);

  await page
    .getByTestId('suspended-appeal-text')
    .fill('Those were my own customers, who asked for the list.');
  await page.getByTestId('suspended-appeal').click();
  await expect(page.getByTestId('suspended-appealed')).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('suspended-export').click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^caime-export-\d{4}-\d{2}-\d{2}\.json$/);
  const file = await download.path();
  const data = JSON.parse(await readFile(file, 'utf8')) as {
    profile?: { handle?: string };
    appeals: Array<{ text: string }>;
  };
  expect(data.appeals.map((a) => a.text)).toEqual([
    'Those were my own customers, who asked for the list.',
  ]);

  // Lifted by the operator: the same password signs them in.
  const appeals = await setup.request.get('/v1/admin/appeals', { headers: operator });
  const { appeals: waiting } = (await appeals.json()) as {
    appeals: Array<{ id: string; person: { handle: string } }>;
  };
  const theirs = waiting.find((a) => a.person.handle === handle);
  expect(theirs).toBeTruthy();
  const lifted = await setup.request.post(`/v1/admin/appeals/${theirs?.id}`, {
    headers: operator,
    data: { decision: 'lift' },
  });
  expect(lifted.ok(), await lifted.text()).toBe(true);
  await page.getByTestId('signin-submit').click();
  await expect(page).not.toHaveURL(/sign-in/);
  await expect
    .poll(async () => (await mailsTo(`${handle}@example.com`)).map((m) => m.subject))
    .toContain('Your Caime account is back');
});
