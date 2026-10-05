/**
 * A connection never labelled (R3): the conversation itself asks how you know them, with one
 * chip in its intro, and the label shows there once saved. The person screen's "Change" and
 * the panel's line stay; this is the way in from where people actually are.
 */
import { expect, test } from '@playwright/test';
import { apiSignUp, CLIENT, newPerson, visible } from './helpers';

const suffix = Math.random().toString(36).slice(2, 7);

test('an unlabelled conversation offers to say how you know them, and shows the label once said', async ({
  browser,
}) => {
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const noor = await apiSignUp(phone, 'Noor Haddad', `noor.chip.${suffix}`);
  await apiSignUp(desktop, 'Omar Said', `omar.chip.${suffix}`);
  // Omar asks to connect, with no word on how they know each other; Noor accepts without a label.
  const asked = await desktop.request.post('/v1/connections/requests', {
    headers: CLIENT,
    data: { toUserId: noor.id },
  });
  expect(asked.ok(), await asked.text()).toBe(true);
  const { requestId } = (await asked.json()) as { requestId: string };
  const accepted = await phone.request.post(`/v1/connections/requests/${requestId}/accept`, {
    headers: CLIENT,
    data: {},
  });
  expect(accepted.ok(), await accepted.text()).toBe(true);
  const { conversationId } = (await accepted.json()) as { conversationId: string };

  const { page, errors } = await newPerson(phone);
  await page.goto(`/c/${conversationId}`);
  const chip = page.getByTestId('label-relationship');
  await expect(chip).toBeVisible();
  await expect(chip).toContainText('How do you know Omar?');
  await page.screenshot({
    path: 'e2e/screenshots/phone-relationship-chip.png',
    animations: 'disabled',
  });
  await chip.click();
  await expect(page.getByRole('dialog')).toContainText('How do you know Omar?');
  await page.getByRole('radio', { name: 'Friend' }).click();
  await page.getByTestId('relationship-save').click();
  await expect(visible(page, 'Saved. Only you see it.')).toBeVisible();
  // The intro now carries the label, and asks no more.
  await expect(visible(page, 'Only you see how you’ve labelled Omar Said')).toBeVisible();
  await expect(page.getByTestId('label-relationship')).toHaveCount(0);
  await expect(page.getByLabel('Your label: Friend').filter({ visible: true })).toBeVisible();
  expect(errors).toEqual([]);
  await phone.close();
  await desktop.close();
});
