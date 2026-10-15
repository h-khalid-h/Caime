/**
 * Own addresses (R91): Noor adds a second email address in Settings · Apps, the code reaches it
 * by mail (the SMTP stand-in), Noor types it in the sheet, and the row says it's verified and
 * how. Without a WhatsApp sender the phone number isn't offered.
 */
import { expect, test } from '@playwright/test';
import { apiSignUp, mailsTo, newPerson, visible } from './helpers';

const stamp = Math.random().toString(36).slice(2, 7);

test('an email added as one’s own is proven by the code sent to it', async ({ browser }) => {
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const handle = `noor.addresses.${stamp}`;
  await apiSignUp(desktop, 'Noor Addresses', handle);
  const second = `noor.work.${stamp}@example.org`;
  const { page, errors } = await newPerson(desktop);
  await page.goto('/settings/apps');
  await expect(visible(page, 'Your accounts')).toBeVisible();
  // The sign-in email is the list's first row.
  await expect(page.getByTestId('address-sign-in').filter({ visible: true })).toContainText(
    `${handle}@example.com`,
  );
  // No WhatsApp sender here: no phone number offered.
  await expect(page.getByTestId('address-add-phone')).toHaveCount(0);

  await page.getByTestId('address-add-email').filter({ visible: true }).click();
  await page.getByTestId('address-value').filter({ visible: true }).fill(second);
  await page.getByTestId('address-send').filter({ visible: true }).click();
  await expect(page.getByTestId('address-code').filter({ visible: true })).toBeVisible();

  let code = '';
  await expect
    .poll(async () => {
      const mail = (await mailsTo(second)).at(-1);
      code = /is (\d{6})/.exec(mail?.text ?? '')?.[1] ?? '';
      return code;
    })
    .toMatch(/^\d{6}$/);
  await page.getByTestId('address-code').filter({ visible: true }).fill(code);
  await page.getByTestId('address-prove').filter({ visible: true }).click();

  const state = page.getByTestId(`address-${second}-state`).filter({ visible: true });
  await expect(state).toHaveText('Verified · Proven by a code by email');
  expect(errors).toEqual([]);
  await desktop.close();
});
