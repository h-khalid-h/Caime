/**
 * Cai keeps going (R68): a wait handed to Cai comes back in Cai's chat as a follow-up ready to
 * send, which goes only when tapped; Settings · Cai lists what it follows up and has learned, and
 * turns the morning brief on.
 */
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { apiSignUp, CLIENT, newPerson, visible } from './helpers';

const suffix = Math.random().toString(36).slice(2, 7);

test('a wait handed to Cai comes back as a follow-up, sent by a tap', async ({ browser }) => {
  test.setTimeout(120_000);
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const other = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await apiSignUp(phone, 'Hassan Khalid', `hassan.r68.${suffix}`);
  const sarah = await apiSignUp(other, 'Sarah Smith', `sarah.r68.${suffix}`);
  const asked = await phone.request.post('/v1/connections/requests', {
    headers: CLIENT,
    data: { toUserId: sarah.id },
  });
  const { requestId } = (await asked.json()) as { requestId: string };
  const accepted = await other.request.post(`/v1/connections/requests/${requestId}/accept`, {
    headers: CLIENT,
    data: {},
  });
  const { conversationId } = (await accepted.json()) as { conversationId: string };
  const made = await phone.request.post('/v1/tasks', {
    headers: CLIENT,
    data: {
      clientId: randomUUID(),
      title: 'Access approval',
      assigneeId: sarah.id,
      shared: false,
      conversationId,
    },
  });
  const { task } = (await made.json()) as { task: { id: string } };
  // Handed to Cai, due in a moment: the reminders sweep (every half minute) offers it.
  const handed = await phone.request.patch(`/v1/tasks/${task.id}`, {
    headers: CLIENT,
    data: { caiFollowUp: true, remindAt: new Date(Date.now() + 2000).toISOString() },
  });
  expect(handed.ok(), await handed.text()).toBe(true);

  const { page, errors } = await newPerson(phone);
  await page.goto('/settings/cai');
  await expect(page.getByTestId('cai-follow-up').filter({ visible: true })).toContainText(
    'Sarah Smith · Access approval',
  );
  await expect(page.getByTestId('learn-from-choices').filter({ visible: true })).toBeVisible();
  await page.getByTestId('cai-brief').filter({ visible: true }).click();
  await expect
    .poll(async () => (await page.request.get('/v1/me').then((r) => r.json())).user.preferences)
    .toMatchObject({ caiBrief: '08:00' });
  await page.screenshot({ path: 'e2e/screenshots/phone-settings-cai.png', animations: 'disabled' });

  // The offer, in Cai's chat once the sweep has run.
  await page.getByTestId('cai-chat').filter({ visible: true }).click();
  await page.waitForURL(/\/c\//);
  await expect(page.getByTestId('follow-up-offer').filter({ visible: true })).toBeVisible({
    timeout: 60_000,
  });
  await expect(
    visible(page, /Sarah Smith hasn’t answered about “Access approval” yet\. Shall I send this\?/),
  ).toBeVisible();
  await page.screenshot({
    path: 'e2e/screenshots/phone-cai-follow-up.png',
    animations: 'disabled',
  });
  // Nothing went to Sarah until the tap.
  const before = await other.request.get(`/v1/conversations/${conversationId}/messages`);
  const draft = 'Hi Sarah, any news on “Access approval”?';
  expect(
    ((await before.json()) as { messages: { body: string }[] }).messages.map((m) => m.body),
  ).not.toContain(draft);
  await page.getByTestId('follow-up-send').filter({ visible: true }).click();
  await expect(page.getByTestId('follow-up-sent').filter({ visible: true })).toHaveText(
    'Sent to Sarah',
  );
  await expect
    .poll(async () => {
      const res = await other.request.get(`/v1/conversations/${conversationId}/messages`);
      return ((await res.json()) as { messages: { body: string }[] }).messages.map((m) => m.body);
    })
    .toContain(draft);
  expect(errors).toEqual([]);
  await phone.close();
  await other.close();
});
