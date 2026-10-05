import { uuidv4 } from '@caime/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runDueJobs } from '../src/lib/jobs';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let hassan: Client; // labels Sarah as work
let sarah: Client; // has no label for Hassan
let convo: string;

const send = (c: Client, conversationId: string, body: string) =>
  c
    .post(`/v1/conversations/${conversationId}/messages`, {
      clientId: uuidv4(),
      kind: 'text',
      body,
    })
    .then((r) => r.message);

beforeAll(async () => {
  t = await createTestApp();
  t.clock.set('2026-10-05T08:00:00Z');
  hassan = await signup(t, { displayName: 'Hassan Khalid' });
  sarah = await signup(t, { displayName: 'Sarah Chen' });
  const r = await hassan.post('/v1/connections/requests', {
    toUserId: sarah.user.id,
    relationship: { sphere: 'work', role: 'manager' },
  });
  await sarah.post(`/v1/connections/requests/${r.requestId}/accept`, {});
  convo = (await hassan.post('/v1/conversations', { kind: 'direct', userId: sarah.user.id }))
    .conversation.id;
});
afterAll(async () => {
  await t.close();
});

describe('the brief before a meeting (R58)', () => {
  it('an agreed meeting at work gets a brief an hour before, to whoever calls it work', async () => {
    await send(hassan, convo, 'Draft is in. Thoughts on the pricing page?');
    await send(sarah, convo, 'Looks good. Can you send the deck before Thursday?');
    await sarah.post('/v1/decisions', {
      conversationId: convo,
      title: 'Ship the blue design on Oct 15',
    });
    const card = (
      await hassan.post(`/v1/conversations/${convo}/messages`, {
        clientId: uuidv4(),
        kind: 'kit',
        payload: {
          kit: 'meeting',
          fields: {
            title: 'Weekly with Sarah',
            start: { at: '2026-10-05T11:00:00.000Z', hasTime: true },
            durationMinutes: 30,
          },
        },
      })
    ).message;
    // Proposed: nothing queued. Accepted: a brief for 10:00.
    expect(await runDueJobs(t.ctx)).toBe(0);
    await sarah.post(`/v1/messages/${card.id}/kit`, { to: 'accepted' });
    t.clock.set('2026-10-05T09:30:00Z');
    expect(await runDueJobs(t.ctx)).toBe(0);
    t.clock.set('2026-10-05T10:00:00Z');
    expect(await runDueJobs(t.ctx)).toBe(1);
    const mine = (await hassan.get('/v1/notifications')).notifications.filter(
      (n: { kind: string }) => n.kind === 'brief',
    );
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({
      title: 'Coming up: Weekly with Sarah',
      body: '1 decision · 1 question unanswered',
      data: { conversationId: convo, messageId: card.id, brief: true },
    });
    // Sarah never said what Hassan is to her: no brief for her.
    expect(
      (await sarah.get('/v1/notifications')).notifications.filter(
        (n: { kind: string }) => n.kind === 'brief',
      ),
    ).toEqual([]);
    // Read from the card: the same, in full; no model on this server, so no summary.
    const brief = await hassan.get(`/v1/messages/${card.id}/brief`);
    expect(brief).toMatchObject({
      kit: 'meeting',
      title: 'Weekly with Sarah',
      at: '2026-10-05T11:00:00.000Z',
      messages: 2,
      decisions: [{ title: 'Ship the blue design on Oct 15' }],
      questions: [{ preview: 'Looks good. Can you send the deck before Thursday?' }],
      summary: null,
      label: null,
    });
    // Once more at the same time does nothing; a stranger to the conversation finds nothing.
    expect(await runDueJobs(t.ctx)).toBe(0);
    const zed = await signup(t, { displayName: 'Zed' });
    expect((await zed.req('GET', `/v1/messages/${card.id}/brief`)).statusCode).toBe(404);
  });

  it('a meeting cancelled before its hour says nothing', async () => {
    const card = (
      await hassan.post(`/v1/conversations/${convo}/messages`, {
        clientId: uuidv4(),
        kind: 'kit',
        payload: {
          kit: 'meeting',
          fields: { title: 'Review', start: { at: '2026-10-05T14:00:00.000Z', hasTime: true } },
        },
      })
    ).message;
    await sarah.post(`/v1/messages/${card.id}/kit`, { to: 'accepted' });
    await hassan.post(`/v1/messages/${card.id}/kit`, { to: 'cancelled' });
    t.clock.set('2026-10-05T13:00:00Z');
    expect(await runDueJobs(t.ctx)).toBe(1);
    expect(
      (await hassan.get('/v1/notifications')).notifications.filter(
        (n: { kind: string }) => n.kind === 'brief',
      ),
    ).toHaveLength(1);
  });
});
