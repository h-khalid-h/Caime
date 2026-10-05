/**
 * The Attention home (R66): the first screen says what needs you, what you're waiting on others
 * for and what's coming up; a conversation says what's open in it above the composer; a person's
 * page says what how you know them changes; and Actions speak coordination's words.
 */
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { apiSignUp, CLIENT, newPerson, visible } from './helpers';

const suffix = Math.random().toString(36).slice(2, 7);

test('the first screen is what needs you, and the rest of the day around it', async ({
  browser,
}) => {
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const hassan = await apiSignUp(phone, 'Hassan Khalid', `hassan.home.${suffix}`);
  const sarah = await apiSignUp(desktop, 'Sarah Smith', `sarah.home.${suffix}`);
  const asked = await phone.request.post('/v1/connections/requests', {
    headers: CLIENT,
    data: { toUserId: sarah.id, relationship: { sphere: 'work', role: 'manager' } },
  });
  const { requestId } = (await asked.json()) as { requestId: string };
  const accepted = await desktop.request.post(`/v1/connections/requests/${requestId}/accept`, {
    headers: CLIENT,
    data: {},
  });
  const { conversationId } = (await accepted.json()) as { conversationId: string };
  // Sarah asks Hassan for something; Hassan waits on Sarah for something else.
  const ask = 'Can you send me the contract by Friday?';
  await desktop.request.post(`/v1/conversations/${conversationId}/messages`, {
    headers: CLIENT,
    data: { clientId: randomUUID(), kind: 'text', body: ask },
  });
  const waited = await phone.request.post('/v1/tasks', {
    headers: CLIENT,
    data: {
      title: 'Access approval',
      assigneeId: sarah.id,
      // Kept to himself: a wait, not a request she sees.
      shared: false,
      conversationId,
    },
  });
  expect(waited.ok(), await waited.text()).toBe(true);

  const { page, errors } = await newPerson(phone);
  await page.goto('/');
  const home = page.getByTestId('attention-home');
  await expect(home.getByText(/^Good (morning|afternoon|evening), Hassan$/)).toBeVisible();
  await expect(page.getByTestId('home-summary')).toHaveText('1 thing needs you.');
  await expect(page.getByTestId('home-needs')).toBeVisible();
  await expect(home.getByText(ask)).toBeVisible();
  await expect(page.getByTestId('home-waiting')).toContainText('Waiting on others');
  await expect(home.getByText('Sarah Smith · Access approval')).toBeVisible();
  await expect(page.getByTestId('tab-index')).toContainText('Attention');
  await page.screenshot({ path: 'e2e/screenshots/phone-attention.png', animations: 'disabled' });

  // The conversation says what's open between them, above the composer.
  await home.getByText(ask).click();
  await page.waitForURL(/\/c\//);
  await expect(page.getByTestId('conversation-open').filter({ visible: true })).toContainText(
    '1 open',
  );

  // Sarah's page says what how Hassan knows her changes.
  await page.goto(`/p/${sarah.id}`);
  const effects = page.getByTestId('person-effects').filter({ visible: true });
  await expect(effects).toContainText('What this changes');
  await expect(effects).toContainText('Sarah comes first in your Attention during your hours.');
  await expect(effects).toContainText('Notifications from Sarah: ');
  await expect(effects).toContainText('is kept in Attention.');

  // Actions in coordination's words.
  await page.goto('/actions');
  await expect(page.getByRole('tab', { name: /^Waiting for, 1$/ })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Coming up' })).toBeVisible();
  expect(errors).toEqual([]);

  // Sarah has nothing waiting on her end and nothing needs her: the home says so, calmly.
  const other = await newPerson(desktop);
  await other.page.goto('/');
  await expect(other.page.getByTestId('home-summary')).toHaveText('Nothing needs you right now.');
  await other.page.screenshot({ path: 'e2e/screenshots/desktop-attention.png' });
  expect(other.errors).toEqual([]);
  await phone.close();
  await desktop.close();
});
