/**
 * Cai answers for someone (R116, M17 I16a): Sara turns it on in Settings · Cai; Omar, who isn't
 * connected with her, writes to her first and meets Cai's introduction with its two choices; he
 * talks to Cai, on his own allowance, until it has what he needs; Sara finds what he wanted in her
 * own chat with Cai, opens the conversation from it, and reads Cai's lines there as Cai's.
 */
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { apiSignUp, CLIENT, newPerson, visible } from './helpers';

test('Cai answers a stranger for Sara, and tells her what they wanted', async ({ browser }) => {
  test.setTimeout(120_000);
  const tag = randomUUID().slice(0, 6);
  const saraCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const sara = await newPerson(saraCtx);
  const saraUser = await apiSignUp(saraCtx, 'Sara Answers', `sara_ans_${tag}`);
  await saraCtx.request.patch('/v1/me', { headers: CLIENT, data: { aiEnabled: true } });

  // Sara turns it on, in Settings · Cai.
  await sara.page.goto('/settings/cai');
  const turnOn = sara.page.getByTestId('cai-answers').getByRole('switch');
  await turnOn.click();
  await expect(turnOn).toBeChecked();
  await expect
    .poll(async () => {
      const me = (await (await saraCtx.request.get('/v1/me', { headers: CLIENT })).json()) as {
        user: { preferences?: { caiAnswers?: { strangers?: boolean } } };
      };
      return me.user.preferences?.caiAnswers?.strangers;
    })
    .toBe(true);

  // Omar, on a phone, writes to her first: Cai answers for her, and offers him two ways on.
  const omarCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const omar = await newPerson(omarCtx);
  await apiSignUp(omarCtx, 'Omar Stranger', `omar_ans_${tag}`);
  await omarCtx.request.patch('/v1/me', { headers: CLIENT, data: { aiEnabled: true } });
  await omar.page.goto(`/p/${saraUser.id}`);
  await omar.page.getByTestId('person-write').filter({ visible: true }).click();
  await omar.page.waitForURL(/\/c\//);
  const box = omar.page.getByTestId('composer-input').filter({ visible: true });
  const send = () => omar.page.getByTestId('composer-send').filter({ visible: true }).click();
  await box.fill('Hello, do you design logos?');
  await send();
  await expect(
    visible(omar.page, /^Hi Omar, I’m Cai, an AI assistant answering for Sara Answers on Caime\./),
  ).toBeVisible({ timeout: 15_000 });
  await expect(visible(omar.page, 'Cai, for Sara Answers')).toBeVisible();
  const bar = omar.page.getByTestId('cai-answering');
  await expect(bar).toContainText('that uses your own AI allowance');
  await omar.page.getByTestId('cai-answering-talk').click();
  await expect(bar).toContainText('You’re writing to Cai');
  await expect(
    visible(omar.page, 'Go ahead: what would you like Sara Answers to know?'),
  ).toBeVisible();
  await box.fill('How long is a logo call?');
  await send();
  await expect(visible(omar.page, /^Noted: “How long is a logo call\?”/)).toBeVisible({
    timeout: 15_000,
  });
  await box.fill('Thanks, that’s all.');
  await send();
  await expect(visible(omar.page, 'Thanks, I’ll pass it on.')).toBeVisible({ timeout: 15_000 });
  await expect(bar).toHaveCount(0);
  await omar.page.screenshot({
    path: 'e2e/screenshots/phone-cai-answers.png',
    animations: 'disabled',
  });

  // Sara, in her own chat with Cai: what he wanted, and the conversation one tap away.
  await sara.page.goto('/settings/cai');
  await sara.page.getByTestId('cai-chat').click();
  await sara.page.waitForURL(/\/c\//);
  await expect(
    visible(
      sara.page,
      /^Omar Stranger wrote to you and talked with me\. They asked: Hello, do you design logos\?/,
    ),
  ).toBeVisible({ timeout: 15_000 });
  await sara.page.getByTestId('cai-answered-open').filter({ visible: true }).click();
  await expect(visible(sara.page, 'Hello, do you design logos?')).toBeVisible();
  await expect(visible(sara.page, 'Cai, for you').first()).toBeVisible();
  expect([...sara.errors, ...omar.errors]).toEqual([]);
  await saraCtx.close();
  await omarCtx.close();
});
