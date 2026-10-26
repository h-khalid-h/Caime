/**
 * A child asks their own parent (R122 (2)): a 14-year-old in Egypt signs up on their phone with no
 * link; the next step asks for their parent's handle, shows who that is and asks them; the parent
 * sees the child and the day of birth they gave in Family and agrees; the child's app opens by
 * itself. Their date of birth then reads "Confirmed by your parent". The parent chose, as they
 * agreed, to say yes to new groups, spaces and people first (Moderate), and the child's Family
 * says so.
 */
import { expect, test } from '@playwright/test';
import { apiSignUp, newPerson, PASSWORD, visible } from './helpers';

test('a child names their parent by handle, and the parent agrees', async ({ browser }) => {
  const suffix = Date.now().toString(36);
  const parentContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const handle = `mona.fam.${suffix}`;
  await apiSignUp(parentContext, 'Mona Khalid', handle);
  const parent = await newPerson(parentContext);

  const childContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });
  const child = await newPerson(childContext);
  await child.page.goto('/sign-up');
  await child.page.getByTestId('signup-name').fill('Yara Khalid');
  await child.page.getByTestId('signup-handle').fill(`yara.fam.${suffix}`);
  await child.page.getByTestId('signup-email').fill(`yara.fam.${suffix}@example.com`);
  await child.page.getByTestId('signup-password').fill(PASSWORD);
  await child.page.getByTestId('signup-birth-date').fill('2012-05-01');
  await child.page.getByTestId('signup-country').click();
  await child.page.getByTestId('signup-country-search').fill('egy');
  await child.page.getByTestId('signup-country-EG').click();
  await expect(child.page.getByText('Available')).toBeVisible();
  await child.page.getByTestId('signup-submit').click();

  // The next step: whose yes it needs, by handle, after seeing who that is.
  await expect(child.page.getByTestId('waiting-name-parent')).toBeVisible();
  await child.page.getByTestId('parent-handle').fill(`@${handle}`);
  await child.page.getByTestId('parent-find').click();
  const found = child.page.getByTestId('parent-found');
  await expect(found).toContainText('Mona Khalid');
  await expect(found).toContainText('Is this your parent or guardian?');
  await child.page.screenshot({ path: 'e2e/screenshots/phone-family-name-parent.png' });
  await child.page.getByTestId('parent-ask').click();
  await expect(child.page.getByText('Waiting for Mona Khalid')).toBeVisible();

  // The parent's Family: the child who asked, and the day of birth to vouch for.
  await parent.page.goto('/settings/family');
  await expect(parent.page.getByTestId('family-named').filter({ visible: true })).toHaveText(
    'Yara Khalid says you’re their parent or guardian',
  );
  await expect(
    parent.page.getByTestId('family-birth-date').filter({ visible: true }),
  ).toContainText('Agreeing confirms it.');
  // Moderate, chosen as they agree: off unless turned on.
  const moderate = parent.page
    .getByTestId('family-moderate-agree')
    .filter({ visible: true })
    .getByRole('switch');
  await expect(moderate).not.toBeChecked();
  await moderate.click();
  await expect(moderate).toBeChecked();
  await parent.page.screenshot({ path: 'e2e/screenshots/desktop-family-named.png' });
  await parent.page.getByTestId('family-agree').filter({ visible: true }).click();
  await expect(visible(parent.page, 'Agreed. You’re connected now.')).toBeVisible();

  // The child's app opens by itself; the day of birth is their parent's word now.
  await child.page.waitForURL('**/onboarding');
  await child.page.getByTestId('onboarding-rules-next').click();
  await child.page.getByTestId('onboarding-skip').click();
  await child.page.waitForURL((u) => u.pathname === '/');
  await child.page.goto('/settings/family');
  await expect(child.page.getByTestId('family-moderated').filter({ visible: true })).toContainText(
    'Your parent says yes to new groups, spaces and people first',
  );
  // The parent may turn it off again from the child's row.
  await expect(
    parent.page
      .getByTestId(/^family-moderate-[0-9a-f]{8}-/)
      .filter({ visible: true })
      .getByRole('switch'),
  ).toBeChecked();
  await child.page.goto('/settings/profile');
  await expect(
    child.page.getByTestId('profile-birth-date-source').filter({ visible: true }),
  ).toHaveText('Confirmed by your parent');

  expect(parent.errors).toEqual([]);
  expect(child.errors).toEqual([]);
  await childContext.close();
  await parentContext.close();
});
