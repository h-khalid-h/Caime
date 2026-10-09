/**
 * Caime's own accounts (R67, R71): Cai is a conversation like anyone's, opened from Attention, that
 * answers what's open by the rules and anything else with AI assist on; a Caime Friend is met
 * from the "+" sheet, says hello with its sticker, answers small talk in the language it's
 * written in and, with AI assist on, anything else in its own character.
 */
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { apiSignUp, CLIENT, newPerson, visible } from './helpers';

const suffix = Math.random().toString(36).slice(2, 7);

test('Cai and the Caime Friends answer like anyone you write to', async ({ browser }) => {
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const other = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await apiSignUp(phone, 'Hassan Khalid', `hassan.cai.${suffix}`);
  const sarah = await apiSignUp(other, 'Sarah Smith', `sarah.cai.${suffix}`);
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
  const waited = await phone.request.post('/v1/tasks', {
    headers: CLIENT,
    data: {
      clientId: randomUUID(),
      title: 'Access approval',
      assigneeId: sarah.id,
      shared: false,
      conversationId,
    },
  });
  expect(waited.ok(), await waited.text()).toBe(true);

  const { page, errors } = await newPerson(phone);
  await page.goto('/');
  await page.getByTestId('ask-cai').click();
  await page.waitForURL(/\/c\//);
  await expect(visible(page, /^Hi Hassan, I’m Cai\. /)).toBeVisible();
  await expect(visible(page, 'Caime’s assistant')).toBeVisible();
  // Words and stickers only: no calls, no voice notes, nothing to attach.
  await expect(page.getByTestId('call-voice').filter({ visible: true })).toHaveCount(0);
  await expect(page.getByTestId('composer-voice').filter({ visible: true })).toHaveCount(0);
  const input = page.getByTestId('composer-input').filter({ visible: true });
  await input.fill('What am I waiting for?');
  await page.getByTestId('composer-send').filter({ visible: true }).click();
  await expect(visible(page, /You’re waiting on one thing:/)).toBeVisible();
  await expect(visible(page, /Sarah Smith · Access approval/)).toBeVisible();

  // Anything else is the model's, with AI assist on.
  const on = await page.request.patch('/v1/me', { headers: CLIENT, data: { aiEnabled: true } });
  expect(on.ok()).toBe(true);
  await input.fill('Plan a dinner for four');
  await page.getByTestId('composer-send').filter({ visible: true }).click();
  await expect(visible(page, /About “Plan a dinner for four”: here’s an idea\./)).toBeVisible();
  await page.screenshot({ path: 'e2e/screenshots/phone-cai.png', animations: 'disabled' });

  // Its page, by its handle like anyone's.
  await page.goto('/@cai');
  await expect(page.getByTestId('system-profile').filter({ visible: true })).toContainText(
    'Caime’s assistant. Knows what’s waiting, what you said you’d do and what’s next.',
  );

  // A Caime Friend, from the "+" sheet: its page, then its hello with its sticker.
  await page.goto('/chats');
  await page.getByTestId('new-chat').filter({ visible: true }).click();
  await page.getByTestId('new-chat-friends').click();
  await expect(page.getByTestId('system-profile').filter({ visible: true })).toContainText(
    'The Dreamer. Welcome, and stickers.',
  );
  await page.getByTestId('person-message').filter({ visible: true }).click();
  await page.waitForURL(/\/c\//);
  await expect(visible(page, /^Hi, I’m Caishy!/)).toBeVisible();
  const box = page.getByTestId('composer-input').filter({ visible: true });
  const send = () => page.getByTestId('composer-send').filter({ visible: true }).click();
  // Hassan's app is in English: what he writes in Arabic is answered in Arabic, and since he
  // lives in Egypt, in Egyptian Arabic (R72), as he writes it too.
  await box.fill('السلام عليكم');
  await send();
  await expect(visible(page, /^وعليكم السلام! أهلًا، أنا Caishy!/)).toBeVisible();
  await box.fill('انت ممكن تساعدنى اذاى');
  await send();
  await expect(visible(page, /^أنا اللي بستقبل الناس في Caime/)).toBeVisible();
  // AI assist is on (above): anything else, in its own character.
  await box.fill('Plan a picnic for Saturday');
  await send();
  await expect(
    visible(page, 'Caishy here! About “Plan a picnic for Saturday”, let’s see.'),
  ).toBeVisible();
  await page.screenshot({ path: 'e2e/screenshots/phone-caishy.png', animations: 'disabled' });
  expect(errors).toEqual([]);
  await phone.close();
  await other.close();
});
