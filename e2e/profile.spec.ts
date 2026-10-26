/**
 * A date of birth typed wrong at sign-up, corrected in Settings · Profile (the owner's report of
 * 2026-10-25): the day saved and shown; under the youngest age Caime opens where they live,
 * refused on the field; a day that needs a parent's yes there (Egypt, 13 to 17) saved, and the
 * account waits to ask one, as sign-up's own does (R122 (2)).
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
  // Under 13 where they live: refused as sign-up refuses, nothing changed.
  const year = new Date().getUTCFullYear();
  await page.getByTestId('profile-birth-date-field').fill(`${year - 11}-06-01`);
  await page.getByTestId('profile-birth-date-save').click();
  await expect(
    visible(page, /Caime is for people 18 and older, and from 13 with a parent/),
  ).toBeVisible();
  await expect(page.getByTestId('profile-birth-date').filter({ visible: true })).toContainText(
    '1985',
  );
  // 15 in Egypt: the truth is taken, and the account waits for a parent's yes from now on.
  await page.getByTestId('profile-birth-date-field').fill(`${year - 15}-06-01`);
  await page.getByTestId('profile-birth-date-save').click();
  await expect(page.getByTestId('waiting-name-parent').filter({ visible: true })).toBeVisible();
  await expect(page.getByTestId('parent-picker').filter({ visible: true })).toBeVisible();
});
