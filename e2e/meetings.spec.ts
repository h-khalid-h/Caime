/**
 * Meetings (R83): Join on an accepted meeting's card opens its call; the other side's Join, from
 * the address the calendar and calendar apps use, answers the call already ringing rather than
 * placing a second; Meetings lists it with its Join.
 */
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { apiSignUp, CLIENT, newPerson } from './helpers';

test('a meeting held on Caime is joined from its card, its address and Meetings', async ({
  browser,
}) => {
  const anaCtx = await browser.newContext();
  const benCtx = await browser.newContext();
  const ana = await newPerson(anaCtx);
  const ben = await newPerson(benCtx);
  const tag = randomUUID().slice(0, 6);
  await apiSignUp(anaCtx, 'Ana Meet', `ana_meet_${tag}`);
  const benUser = await apiSignUp(benCtx, 'Ben Meet', `ben_meet_${tag}`);

  const asked = await anaCtx.request.post('/v1/connections/requests', {
    headers: CLIENT,
    data: { toUserId: benUser.id, relationship: { sphere: 'work', role: 'colleague' } },
  });
  expect(asked.ok(), await asked.text()).toBe(true);
  const { requestId } = (await asked.json()) as { requestId: string };
  const took = await benCtx.request.post(`/v1/connections/requests/${requestId}/accept`, {
    headers: CLIENT,
    data: {},
  });
  expect(took.ok(), await took.text()).toBe(true);
  const made = await anaCtx.request.post('/v1/conversations', {
    headers: CLIENT,
    data: { kind: 'direct', userId: benUser.id },
  });
  const conversationId = ((await made.json()) as { conversation: { id: string } }).conversation.id;

  // A meeting starting in two minutes, held here (no Where), accepted by Ben.
  const at = new Date(Date.now() + 2 * 60_000).toISOString();
  const sent = await anaCtx.request.post(`/v1/conversations/${conversationId}/messages`, {
    headers: CLIENT,
    data: {
      clientId: randomUUID(),
      kind: 'kit',
      payload: {
        kit: 'meeting',
        fields: { title: 'Plan the launch', start: { at, hasTime: true }, durationMinutes: 30 },
      },
    },
  });
  expect(sent.ok(), await sent.text()).toBe(true);
  const card = ((await sent.json()) as { message: { id: string; seq: number } }).message;
  const accepted = await benCtx.request.post(`/v1/messages/${card.id}/kit`, {
    headers: CLIENT,
    data: { to: 'accepted' },
  });
  expect(accepted.ok(), await accepted.text()).toBe(true);

  // Meetings lists it with its Join.
  await ana.page.goto('/meetings');
  await expect(ana.page.getByTestId('meetings-list')).toBeVisible();
  await expect(ana.page.getByText('Plan the launch').first()).toBeVisible();
  await expect(ana.page.getByTestId(`calendar-join-${card.id}`)).toBeVisible();

  // Ana joins from the card: Ben is rung.
  await ana.page.goto(`/c/${conversationId}`);
  await ana.page.getByTestId('kit-join').click();
  await expect(ana.page.getByTestId('call-status')).toHaveText('Calling…');

  // Ben joins from the meeting's address (as his calendar app opens it): the ringing call is
  // answered, not met with a second one.
  await ben.page.goto(`/c/${conversationId}?seq=${card.seq}&join=${card.id}`);
  await expect(ana.page.getByTestId('call-status')).toHaveText(/^0:\d\d$/, { timeout: 20_000 });
  await expect(ben.page.getByTestId('call-status')).toHaveText(/^0:\d\d$/, { timeout: 20_000 });

  // Nothing refused on either side: the second Join answered the ring rather than placing a
  // call that would be refused as already on.
  expect([...ana.errors, ...ben.errors]).toEqual([]);
  await anaCtx.close();
  await benCtx.close();
});
