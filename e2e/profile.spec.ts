/**
 * A date of birth typed wrong at sign-up, corrected in Settings · Profile (the owner's report of
 * 2026-10-25): the day saved and shown, a day too young where they live refused on the field.
 */
import { expect, test } from '@playwright/test';
import { apiSignUp, visible } from './helpers';

const stamp = Date.now().toString(36).slice(-6);

test('a date of birth is corrected from the profile', async ({ page, context }) => {
  await apiSignUp(context, 'Noor Correcting', `p${stamp}bd`, { birthDate: '1990-12-31' });
  await page.goto('/settings/profile');
  await expect(page.getByTestId('profile-birth-date').filter({ visible: true })).toContainText(
    '1990',
  );
  // The browser's own date field, typed as the day it is; Save appears once the day differs.
  await page.getByTestId('profile-birth-date-field').fill('1985-12-31');
  await page.getByTestId('profile-birth-date-save').click();
  await expect(page.getByTestId('profile-birth-date').filter({ visible: true })).toContainText(
    '1985',
  );
  await page.reload();
  await expect(page.getByTestId('profile-birth-date').filter({ visible: true })).toContainText(
    '1985',
  );
  // Too young where they live (Egypt asks 18): refused as sign-up refuses, nothing changed.
  const year = new Date().getUTCFullYear();
  await page.getByTestId('profile-birth-date-field').fill(`${year - 15}-06-01`);
  await page.getByTestId('profile-birth-date-save').click();
  await expect(visible(page, /Caime is for people 18 and older/)).toBeVisible();
  await expect(page.getByTestId('profile-birth-date').filter({ visible: true })).toContainText(
    '1985',
  );
});
