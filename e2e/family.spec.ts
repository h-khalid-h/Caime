/**
 * A child on Caime with a parent's consent (R122): where the law asks a parent's consent (Egypt),
 * a 14-year-old is turned away alone with the way through; their parent makes a family link, the
 * child signs up through it on their own phone and waits, the parent agrees from Family, and the
 * child's app opens by itself, connected with the parent. The parent sees whom the child is
 * connected with, never a message.
 */
import { expect, test } from '@playwright/test';
import { apiSignUp, newPerson, PASSWORD, visible } from './helpers';

test('a parent adds their child, who waits, is agreed to, and is connected with them', async ({
  browser,
}) => {
  const suffix = Date.now().toString(36);
  const parentContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await apiSignUp(parentContext, 'Hassan Khalid', `hassan.fam.${suffix}`);
  const parent = await newPerson(parentContext);

  // Family, from You: a link for one child, made in a tap.
  await parent.page.goto('/settings/family');
  await parent.page.getByTestId('family-child-name').fill('Lina');
  await parent.page.getByTestId('family-link-make').click();
  const shown = parent.page.getByTestId('family-link-url').filter({ visible: true });
  await expect(shown).toContainText('/family/fam_');
  const url = new URL((await shown.textContent()) ?? '');

  // The child, on their own phone, opens it: a page that says whose link it is and the one way on.
  const childContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });
  const child = await newPerson(childContext);
  await child.page.goto(url.pathname);
  await expect(
    child.page.getByRole('heading', { name: 'Hassan Khalid adds Lina to Caime' }),
  ).toBeVisible();
  await child.page.getByRole('link', { name: 'Create your account' }).click();
  await child.page.waitForURL((u) => u.pathname === '/sign-up' && u.searchParams.has('family'));
  await expect(
    visible(
      child.page,
      'Your own account. Your parent or guardian agrees to it next, from theirs.',
    ),
  ).toBeVisible();
  await child.page.getByTestId('signup-name').fill('Lina Khalid');
  await child.page.getByTestId('signup-handle').fill(`lina.fam.${suffix}`);
  await child.page.getByTestId('signup-email').fill(`lina.fam.${suffix}@example.com`);
  await child.page.getByTestId('signup-password').fill(PASSWORD);
  await child.page.getByTestId('signup-birth-date').fill('2012-05-01');
  await child.page.getByTestId('signup-country').click();
  await child.page.getByTestId('signup-country-search').fill('egy');
  await child.page.getByTestId('signup-country-EG').click();
  await expect(child.page.getByText('Available')).toBeVisible();
  await child.page.getByTestId('signup-submit').click();

  // Waiting, and nothing else of the app: whose yes it waits for, and what they'll see.
  await expect(child.page.getByTestId('waiting-for-parent')).toBeVisible();
  await expect(child.page.getByText('Waiting for Hassan Khalid')).toBeVisible();

  // The parent's Family shows the child at once, to agree to; agreeing connects them.
  const row = parent.page.getByTestId('family-agree').filter({ visible: true });
  await expect(row).toBeVisible();
  await row.click();
  await expect(visible(parent.page, 'Agreed. You’re connected now.')).toBeVisible();

  // The child's app opens by itself, no reload, as any new account's does, and their parent is
  // among their people.
  await child.page.waitForURL('**/onboarding');
  await child.page.getByTestId('onboarding-rules-next').click();
  await child.page.getByTestId('onboarding-skip').click();
  await child.page.waitForURL((u) => u.pathname === '/');
  await child.page.goto('/people');
  await expect(visible(child.page, 'Hassan Khalid')).toBeVisible();

  // Whom the child knows shows to the parent; never a message.
  await parent.page.reload();
  await expect(parent.page.getByTestId('family-connections').filter({ visible: true })).toHaveText(
    'Connected with nobody else yet',
  );

  // Nobody's screen met a refusal on the way: the child's wait asked only what waiting may.
  expect(parent.errors).toEqual([]);
  expect(child.errors).toEqual([]);
  await childContext.close();
  await parentContext.close();
});
