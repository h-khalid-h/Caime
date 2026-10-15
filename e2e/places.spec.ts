/**
 * Places (R92): Noor adds her home in Settings · Places, shown to her connections; Sara, a
 * connection, sees it on Noor's profile with its address, and in their conversation a meeting's
 * "Where" fills from it with one tap; Noor shares it there as a Location card.
 */
import { expect, test } from '@playwright/test';
import { apiSignUp, CLIENT, newPerson } from './helpers';

const stamp = Math.random().toString(36).slice(2, 7);

test('a place added in Settings shows to a connection and fills a meeting’s “Where”', async ({
  browser,
}) => {
  const noorCtx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const saraCtx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const noor = await apiSignUp(noorCtx, 'Noor Places', `noor.places.${stamp}`);
  const saraMe = await apiSignUp(saraCtx, 'Sara Places', `sara.places.${stamp}`);
  const asked = await saraCtx.request.post('/v1/connections/requests', {
    headers: CLIENT,
    data: { toUserId: noor.id },
  });
  const { requestId } = (await asked.json()) as { requestId: string };
  const accepted = await noorCtx.request.post(`/v1/connections/requests/${requestId}/accept`, {
    headers: CLIENT,
    data: {},
  });
  const convo = ((await accepted.json()) as { conversationId: string }).conversationId;

  const { page, errors } = await newPerson(noorCtx);
  await page.goto('/settings/places');
  await page.getByTestId('place-add').filter({ visible: true }).click();
  await page.getByTestId('place-city').filter({ visible: true }).fill('Cairo');
  await page.getByTestId('place-street').filter({ visible: true }).fill('9 Road 233');
  await page.getByTestId('place-audience').filter({ visible: true }).click();
  await page.getByTestId('audience-kind-connections').filter({ visible: true }).click();
  await page.getByTestId('place-save').filter({ visible: true }).click();
  const row = page.getByTestId('place-0').filter({ visible: true });
  await expect(row).toContainText('Home address');
  await expect(row).toContainText('9 Road 233, Cairo');

  // Sara sees it on Noor's profile.
  const sara = await newPerson(saraCtx);
  await sara.page.goto(`/p/${noor.id}`);
  await expect(sara.page.getByTestId('person-places').filter({ visible: true })).toContainText(
    '9 Road 233, Cairo',
  );

  // In their conversation, a meeting's "Where" fills from Noor's home in one tap.
  await sara.page.goto(`/c/${convo}`);
  await sara.page.getByRole('button', { name: 'Share a photo, a file or a card' }).click();
  await sara.page.getByTestId('kit-option-meeting').click();
  await sara.page.getByTestId('kit-place-from-theirs-0-0').filter({ visible: true }).click();
  await expect(sara.page.getByTestId('kit-field-place').filter({ visible: true })).toHaveValue(
    /9 Road 233, Cairo/,
  );
  await sara.page.keyboard.press('Escape');

  // Noor shares her home as a Location card: the place as written, never live. A location is
  // offered to someone labelled (a friend here).
  const friend = await noorCtx.request.post('/v1/relationships', {
    headers: CLIENT,
    data: { userId: saraMe.id, sphere: 'friend', role: 'friend' },
  });
  expect(friend.status()).toBe(201);
  await page.goto(`/c/${convo}`);
  await page.getByRole('button', { name: 'Share a photo, a file or a card' }).click();
  await page.getByTestId('kit-option-location').click();
  await page.getByTestId('location-place-mine-0').filter({ visible: true }).click();
  await expect(page.getByTestId('location-label').filter({ visible: true })).toHaveValue(
    /9 Road 233, Cairo/,
  );
  await expect(page.getByTestId('live-for')).toHaveCount(0);
  await page.getByTestId('kit-send').filter({ visible: true }).click();
  await expect(
    sara.page.getByTestId('message-location').filter({ visible: true }).last(),
  ).toContainText('9 Road 233, Cairo');
  expect(errors).toEqual([]);
  expect(sara.errors).toEqual([]);
  await noorCtx.close();
  await saraCtx.close();
});
