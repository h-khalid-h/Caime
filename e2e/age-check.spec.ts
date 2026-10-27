/**
 * Age assurance (M16 B7) in a browser: Settings · Security says the age isn't checked; the sheet
 * explains and opens the provider's own page (Agemin's stand-in), whose answer reaches Caime twice
 * (the signed notice, and the return the server reads back) and lands on Security saying what it
 * found. Under 18 by a check, the account is under 18 from then on, whatever it declared. A check
 * that found an adult is theirs to show, as "18 or over, checked" (M16 B8e).
 */
import { expect, type Page, test } from '@playwright/test';
import { AGEMIN_STUB, apiSignUp, CLIENT, visible } from './helpers';

async function checkFromSettings(page: Page, answer: RegExp) {
  await page.goto('/settings/security');
  const row = page.getByTestId('age-status').filter({ visible: true });
  await expect(row).toContainText('Not checked');
  await row.click();
  await expect(page.getByTestId('age-check').filter({ visible: true })).toBeVisible();
  await page.getByTestId('age-check-start').filter({ visible: true }).click();
  // The provider's own page: nothing of the person in its address but a reference.
  await page.waitForURL((url) => url.href.startsWith(`${AGEMIN_STUB}/start/ast_e2e?`));
  const asked = new URL(page.url());
  expect(asked.searchParams.get('reference_id')).toMatch(/^[0-9a-f-]{36}$/);
  await page.getByRole('link', { name: answer }).click();
  await page.waitForURL(/\/settings\/security/);
}

test('an adult checks their age from Settings, and comes back checked', async ({ browser }) => {
  const suffix = Date.now().toString(36);
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await apiSignUp(context, 'Mona Saleh', `mona.ac.${suffix}`);
  const page = await context.newPage();
  await checkFromSettings(page, /18 or over/);
  await expect(visible(page, 'Checked: you’re 18 or over.')).toBeVisible();
  await expect(page.getByTestId('age-status').filter({ visible: true })).toContainText(
    '18 or over, by an estimate',
  );
  const me = (await (await context.request.get('/v1/me', { headers: CLIENT })).json()).user;
  expect(me.ageCheck).toMatchObject({ outcome: 'adult', method: 'estimate', holdsUntil: null });
  expect(me.minor).toBe(false);

  // Theirs to show (M16 B8e): Privacy offers it once checked, nobody sees it until they say, and
  // then it reads "18 or over, checked" on their profile and their public page, never an age.
  await page.goto('/settings/privacy');
  await expect(visible(page, 'Age checked')).toBeVisible();
  const other = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await apiSignUp(other, 'Omar Nabil', `omar.ac.${suffix}`);
  const looking = await other.newPage();
  await looking.goto(`/p/${me.id}`);
  await expect(visible(looking, 'Mona Saleh')).toBeVisible();
  await expect(looking.getByTestId('person-age-checked')).toHaveCount(0);
  const shown = await context.request.put('/v1/me/privacy', {
    headers: CLIENT,
    data: { fields: { ageChecked: { kind: 'everyone' } } },
  });
  expect(shown.status()).toBe(200);
  await looking.reload();
  await expect(looking.getByTestId('person-age-checked').filter({ visible: true })).toHaveText(
    '18 or over, checked',
  );
  const visitor = await browser.newContext();
  const pageOf = await visitor.newPage();
  await pageOf.goto(`/@${me.handle}`);
  await expect(pageOf.getByText('18 or over, checked')).toBeVisible();
  await visitor.close();
  await other.close();
});

test('under 18 by a check is under 18 from then on, whatever was declared', async ({ browser }) => {
  const suffix = Date.now().toString(36);
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await apiSignUp(context, 'Kareem Adel', `kareem.ac.${suffix}`);
  const page = await context.newPage();
  await checkFromSettings(page, /under 18/);
  await expect(visible(page, 'The check found you’re under 18.')).toBeVisible();
  await expect(page.getByTestId('age-status').filter({ visible: true })).toContainText(
    'Under 18 until',
  );
  const me = (await (await context.request.get('/v1/me', { headers: CLIENT })).json()).user;
  expect(me).toMatchObject({ minor: true, ageCheck: { outcome: 'minor', method: 'estimate' } });
  // The under-18 rules at once: nobody finds them by an address.
  expect(me.privacy.discoverByEmail).toBe(false);
  // The provider was asked by reference, with the secret key, and by nobody else.
  const asked = (await (await context.request.get(`${AGEMIN_STUB}/requests`)).json()) as Array<{
    path: string;
    auth: string | null;
  }>;
  const lookups = asked.filter((r) => r.path.startsWith('/v1/agemin/check/reference/'));
  expect(lookups.length).toBeGreaterThan(0);
  expect(new Set(lookups.map((r) => r.auth))).toEqual(new Set(['Bearer age_sk_e2e_0123456789']));
});
