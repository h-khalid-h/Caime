/**
 * Ask to join (M16 C3h): a group's owner makes a link where each person asks first; someone new
 * opens it, reads that it asks on a page without the app, signs up through it and asks in one tap
 * from onboarding, and the link's screen says the ask waits; the owner, told, lets them in from
 * the group's people, and they're in.
 */
import { expect, test } from '@playwright/test';
import { apiSignUp, newPerson } from './helpers';

test('a link that asks: someone new asks, the owner lets them in', async ({ browser }) => {
  const suffix = Date.now().toString(36);
  const owner = await browser.newContext();
  await apiSignUp(owner, 'Noor Haddad', `noor.ja.${suffix}`);
  const { page, errors } = await newPerson(owner);
  const title = `Choir ${suffix}`;
  await page.goto('/new-group');
  await page.getByLabel('Group name').fill(title);
  await page.getByTestId('new-group-create').click();
  await page.waitForURL('**/c/**');
  const id = new URL(page.url()).pathname.split('/').at(-1) ?? '';

  // Each person asks first: the switch, then the link, listed as one that asks.
  const asks = page.getByTestId('join-link-approval').filter({ visible: true }).getByRole('switch');
  await asks.click();
  await expect(asks).toBeChecked();
  await page.getByTestId('join-link-make').filter({ visible: true }).click();
  const shown = page.getByTestId('join-link-url').filter({ visible: true });
  await expect(shown).toContainText('/g/g_');
  const url = new URL((await shown.textContent()) ?? '');
  await expect(page.getByTestId('join-links-open').filter({ visible: true })).toContainText(
    'asks first',
  );
  await page.keyboard.press('Escape');

  // Someone new: the page says it asks, and signing up through it leads to the ask.
  const fresh = await browser.newContext({
    extraHTTPHeaders: { 'x-forwarded-for': '203.0.113.52' },
  });
  const visitor = await fresh.newPage();
  await visitor.goto(url.pathname);
  await expect(
    visitor.getByText('then ask: its owner or an admin lets each person in'),
  ).toBeVisible();
  await visitor
    .getByRole('link', { name: `Ask to join “${title}”` })
    .first()
    .click();
  await visitor.waitForURL((u) => u.pathname === '/sign-up');
  await visitor.getByTestId('signup-name').fill('Rana Singer');
  await visitor.getByTestId('signup-handle').fill(`rana.ja.${suffix}`);
  await visitor.getByTestId('signup-email').fill(`rana.ja.${suffix}@example.com`);
  await visitor.getByTestId('signup-password').fill('a long enough passphrase');
  await visitor.getByTestId('signup-birth-date').fill('1993-04-12');
  await expect(visitor.getByText('Available')).toBeVisible();
  await visitor.getByTestId('signup-submit').click();
  await visitor.waitForURL('**/onboarding');
  const ask = visitor.getByTestId('onboarding-link');
  await expect(ask).toHaveText(`Ask to join “${title}”`);
  await ask.click();
  // The ask waits, and says so where the link opens.
  await visitor.waitForURL((u) => u.pathname === url.pathname);
  await expect(visitor.getByTestId('join-link-asked')).toBeVisible();

  // The owner sees who asked among the group's people, without a reload, and lets them in.
  const asked = page.getByTestId('join-requests').filter({ visible: true });
  await expect(asked).toContainText('Rana Singer');
  await asked.locator('[data-testid^="join-request-accept-"]').click();
  await expect(page.getByText('Rana Singer is in').filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByTestId('join-requests')).toHaveCount(0);

  // In: the link's screen reads as theirs, and opens the group.
  await visitor.reload();
  await visitor.getByTestId('join-link-open').click();
  await visitor.waitForURL((u) => u.pathname === `/c/${id}`);
  expect(errors).toEqual([]);
  await fresh.close();
  await owner.close();
});
