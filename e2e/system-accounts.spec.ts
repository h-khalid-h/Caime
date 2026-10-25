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

  // What he missed (M17 I3): Sarah's ask since he last read her chat, by the rules alone.
  const sarahAsks = await other.request.post(`/v1/conversations/${conversationId}/messages`, {
    headers: CLIENT,
    data: {
      clientId: randomUUID(),
      kind: 'text',
      body: 'Could you review the deck before Monday?',
    },
  });
  expect(sarahAsks.ok(), await sarahAsks.text()).toBe(true);
  await input.fill('What did I miss?');
  await page.getByTestId('composer-send').filter({ visible: true }).click();
  await expect(visible(page, /You missed 1 new message in 1 conversation\./)).toBeVisible();
  await expect(visible(page, /Sarah Smith · 1 new/)).toBeVisible();
  await expect(
    visible(page, /Asked of you: Could you review the deck before Monday\?/),
  ).toBeVisible();

  // Anything else is the model's, with AI assist on.
  const on = await page.request.patch('/v1/me', { headers: CLIENT, data: { aiEnabled: true } });
  expect(on.ok()).toBe(true);
  await input.fill('Plan a dinner for four');
  await page.getByTestId('composer-send').filter({ visible: true }).click();
  await expect(visible(page, /About “Plan a dinner for four”: here’s an idea\./)).toBeVisible();

  // A question about one of their people (M17 I4): what search finds goes to the model with the
  // question, and the reply cites it, a chip to the message in Sarah's chat.
  await input.fill('What did Sarah say about the deck?');
  await page.getByTestId('composer-send').filter({ visible: true }).click();
  await expect(
    visible(
      page,
      /From what you have: Sarah Smith said “Could you review the deck before Monday\?”\./,
    ),
  ).toBeVisible();
  const cited = page.getByTestId('answer-source').filter({ visible: true });
  await expect(cited).toHaveCount(1);
  await expect(cited).toContainText('Sarah Smith');
  await cited.click();
  await page.waitForURL(new RegExp(`/c/${conversationId}\\?seq=\\d+`));
  await expect(visible(page, 'Could you review the deck before Monday?')).toBeVisible();
  await page.goBack();
  await page.waitForURL(/\/c\//);
  await expect(visible(page, /Caime’s assistant/)).toBeVisible();
  await page.screenshot({ path: 'e2e/screenshots/phone-cai.png', animations: 'disabled' });

  // Asked to keep something, Cai keeps it (M16 G13): by the rules, with Undo under the line.
  await input.fill('Remind me to call Sam tomorrow at 9');
  await page.getByTestId('composer-send').filter({ visible: true }).click();
  await expect(visible(page, /^I’ll remind you: “Call Sam” · Tomorrow/)).toBeVisible();
  await page.getByTestId('kept-undo').filter({ visible: true }).click();
  await expect(visible(page, 'Taken out of your actions')).toBeVisible();
  // "Save it as a task": what "it" was, as Cai's model reads it, then the action in Actions.
  await input.fill('The venue deposit is due next Friday. Ask Leila first.');
  await page.getByTestId('composer-send').filter({ visible: true }).click();
  await expect(visible(page, /About “The venue deposit is due next Friday/)).toBeVisible();
  await input.fill('Save it as a task');
  await page.getByTestId('composer-send').filter({ visible: true }).click();
  await expect(
    visible(page, 'Saved to your actions: “The venue deposit is due next Friday”'),
  ).toBeVisible();
  await page.getByTestId('kept-open').filter({ visible: true }).click();
  await page.waitForURL(/\/actions/);
  await expect(visible(page, 'The venue deposit is due next Friday')).toBeVisible();
  await page.goBack();

  // Asked to write to one of his people, Cai drafts it, and nothing goes until he taps (M16 G14).
  await input.fill('Tell Sarah I’m on my way');
  await page.getByTestId('composer-send').filter({ visible: true }).click();
  await expect(
    visible(page, /^Here’s a message for Sarah Smith\. Shall I send it\?/),
  ).toBeVisible();
  await page.getByTestId('offer-send').filter({ visible: true }).click();
  await expect(page.getByTestId('offer-sent').filter({ visible: true })).toHaveText(
    'Sent to Sarah',
  );
  // It went as his, in his chat with Sarah, once.
  const read = await other.request.get(`/v1/conversations/${conversationId}/messages`, {
    headers: CLIENT,
  });
  const theirs = ((await read.json()) as { messages: Array<{ body: string | null }> }).messages;
  expect(theirs.filter((m) => m.body === 'I’m on my way')).toHaveLength(1);

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
