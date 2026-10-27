/**
 * Cai answers for someone (R116, M17 I16a, I16a2): Sara turns it on in Settings · Cai; Omar, who
 * isn't connected with her, writes to her first and meets Cai's introduction with its two choices;
 * he talks to Cai, on his own allowance, until it has what he needs; Sara finds what he wanted in
 * her own chat with Cai, opens the conversation from it, and reads Cai's lines there as Cai's.
 * Then the people she knows: she picks her colleagues, at once while she's busy, on her own
 * allowance; Walid writes while she's in a meeting, talks to Cai on her side, and her reply ends it.
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

test('Cai answers a colleague at once while Sara is in a meeting, on her allowance', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const tag = randomUUID().slice(0, 6);
  const saraCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const sara = await newPerson(saraCtx);
  await apiSignUp(saraCtx, 'Sara Busy', `sara_busy_${tag}`);
  await saraCtx.request.patch('/v1/me', { headers: CLIENT, data: { aiEnabled: true } });

  // In Settings · Cai: her colleagues, at once while she's busy, covered from her allowance.
  await sara.page.goto('/settings/cai');
  await sara.page.getByTestId('cai-answers-who').filter({ visible: true }).click();
  await sara.page.getByTestId('cai-answers-who-pick-work').filter({ visible: true }).click();
  await sara.page.getByTestId('cai-answers-who-save').filter({ visible: true }).click();
  await sara.page
    .getByTestId('cai-answers-busy')
    .filter({ visible: true })
    .getByRole('switch')
    .click();
  await sara.page.getByTestId('cai-answers-covers').filter({ visible: true }).click();
  await sara.page.getByTestId('cai-answers-covers-pick-work').filter({ visible: true }).click();
  await sara.page.getByTestId('cai-answers-covers-monthly-10').filter({ visible: true }).click();
  await sara.page.getByTestId('cai-answers-covers-save').filter({ visible: true }).click();
  await expect(sara.page.getByTestId('cai-answers-covers').filter({ visible: true })).toContainText(
    'up to 10 in thirty days',
  );
  await expect
    .poll(async () => {
      const me = (await (await saraCtx.request.get('/v1/me', { headers: CLIENT })).json()) as {
        user: { preferences?: { caiAnswers?: Record<string, unknown> } };
      };
      return me.user.preferences?.caiAnswers;
    })
    .toMatchObject({ spheres: ['work'], whileBusy: true, covers: ['work'], coverMonthly: 10 });

  // Walid, her colleague (her label for him, never said), and a meeting she's in now.
  const walidCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const walid = await newPerson(walidCtx);
  const walidUser = await apiSignUp(walidCtx, 'Walid Colleague', `walid_${tag}`);
  const asked = (await (
    await saraCtx.request.post('/v1/connections/requests', {
      headers: CLIENT,
      data: { toUserId: walidUser.id, relationship: { sphere: 'work', role: 'colleague' } },
    })
  ).json()) as { requestId: string };
  const { conversationId } = (await (
    await walidCtx.request.post(`/v1/connections/requests/${asked.requestId}/accept`, {
      headers: CLIENT,
      data: {},
    })
  ).json()) as { conversationId: string };
  const card = (await (
    await walidCtx.request.post(`/v1/conversations/${conversationId}/messages`, {
      headers: CLIENT,
      data: {
        clientId: randomUUID(),
        kind: 'kit',
        payload: {
          kit: 'meeting',
          fields: {
            title: 'Contract review',
            start: { at: new Date(Date.now() - 5 * 60_000).toISOString(), hasTime: true },
            durationMinutes: 60,
          },
        },
      },
    })
  ).json()) as { message: { id: string } };
  const agreed = await saraCtx.request.post(`/v1/messages/${card.message.id}/kit`, {
    headers: CLIENT,
    data: { to: 'accepted' },
  });
  expect(agreed.ok()).toBe(true);

  // He writes while she's in it: Cai answers for her at once, and she covers the talk.
  await walid.page.goto(`/c/${conversationId}`);
  const box = walid.page.getByTestId('composer-input').filter({ visible: true });
  const send = () => walid.page.getByTestId('composer-send').filter({ visible: true }).click();
  await box.fill('Can you look at the contract today?');
  await send();
  await expect(
    visible(
      walid.page,
      /^Hi Walid, I’m Cai, an AI assistant answering for Sara Busy on Caime\. Sara Busy hasn’t answered yet\./,
    ),
  ).toBeVisible({ timeout: 15_000 });
  const bar = walid.page.getByTestId('cai-answering');
  await expect(bar).toContainText('Sara Busy covers it');
  await walid.page.getByTestId('cai-answering-talk').click();
  await expect(bar).toContainText('You’re writing to Cai');
  await box.fill('It is about clause 4.');
  await send();
  await expect(visible(walid.page, /^Noted: “It is about clause 4\.”/)).toBeVisible({
    timeout: 15_000,
  });
  // Her reply ends it.
  await saraCtx.request.post(`/v1/conversations/${conversationId}/messages`, {
    headers: CLIENT,
    data: { clientId: randomUUID(), kind: 'text', body: 'Out in ten, Walid.' },
  });
  await expect(bar).toHaveCount(0, { timeout: 15_000 });
  await expect(visible(walid.page, 'Out in ten, Walid.')).toBeVisible();
  expect([...sara.errors, ...walid.errors]).toEqual([]);
  await saraCtx.close();
  await walidCtx.close();
});
