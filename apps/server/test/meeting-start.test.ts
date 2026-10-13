import { uuidv4 } from '@caime/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runDueJobs } from '../src/lib/jobs';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let ana: Client;
let ben: Client;
let convo: string;

const meeting = (c: Client, conversationId: string, fields: Record<string, unknown>) =>
  c
    .post(`/v1/conversations/${conversationId}/messages`, {
      clientId: uuidv4(),
      kind: 'kit',
      payload: { kit: 'meeting', fields },
    })
    .then((r) => r.message);
const starting = async (c: Client) =>
  (await c.get('/v1/notifications')).notifications.filter(
    (n: { kind: string }) => n.kind === 'meeting',
  );

beforeAll(async () => {
  t = await createTestApp();
  t.clock.set('2026-10-20T08:00:00Z');
  ana = await signup(t, { displayName: 'Ana Start' });
  ben = await signup(t, { displayName: 'Ben Start' });
  const r = await ana.post('/v1/connections/requests', {
    toUserId: ben.user.id,
    relationship: { sphere: 'friend' },
  });
  await ben.post(`/v1/connections/requests/${r.requestId}/accept`, {});
  convo = (await ana.post('/v1/conversations', { kind: 'direct', userId: ben.user.id }))
    .conversation.id;
});
afterAll(async () => {
  await t.close();
});

describe('starting now (R83)', () => {
  it('at an agreed meeting’s time, tells everyone in it, with its join address', async () => {
    const card = await meeting(ana, convo, {
      title: 'Plan the trip',
      start: { at: '2026-10-20T12:00:00.000Z', hasTime: true },
      durationMinutes: 30,
    });
    // Proposed: nothing. Accepted: told at noon, not before.
    await ben.post(`/v1/messages/${card.id}/kit`, { to: 'accepted' });
    t.clock.set('2026-10-20T11:59:00Z');
    await runDueJobs(t.ctx);
    expect(await starting(ana)).toEqual([]);
    t.clock.set('2026-10-20T12:00:00Z');
    await runDueJobs(t.ctx);
    for (const c of [ana, ben]) {
      const told = await starting(c);
      expect(told).toHaveLength(1);
      expect(told[0]).toMatchObject({
        title: 'Starting now: Plan the trip',
        body: 'It’s time to join.',
        data: {
          conversationId: convo,
          messageId: card.id,
          path: `/c/${convo}?seq=${card.seq}&join=${card.id}`,
        },
      });
    }
    // Once is enough.
    await runDueJobs(t.ctx);
    expect(await starting(ana)).toHaveLength(1);
  });

  it('says nothing for a meeting elsewhere, cancelled, moved, or once it can’t be joined', async () => {
    const before = (await starting(ana)).length;
    t.clock.set('2026-10-21T08:00:00Z');
    const zoom = await meeting(ana, convo, {
      title: 'On Zoom',
      start: { at: '2026-10-21T09:00:00.000Z', hasTime: true },
      place: 'zoom.us/j/1',
    });
    const room = await meeting(ana, convo, {
      title: 'In the room',
      start: { at: '2026-10-21T09:00:00.000Z', hasTime: true },
      place: 'Room 4',
    });
    const cancelled = await meeting(ana, convo, {
      title: 'Called off',
      start: { at: '2026-10-21T09:00:00.000Z', hasTime: true },
    });
    const late = await meeting(ana, convo, {
      title: 'Ran late',
      start: { at: '2026-10-21T09:00:00.000Z', hasTime: true },
      durationMinutes: 15,
    });
    for (const m of [zoom, room, cancelled, late])
      await ben.post(`/v1/messages/${m.id}/kit`, { to: 'accepted' });
    await ana.post(`/v1/messages/${cancelled.id}/kit`, { to: 'cancelled' });
    // The job for "Ran late" runs only after the meeting could still be joined (the server was
    // away): it says nothing then.
    t.clock.set('2026-10-21T10:00:00Z');
    await runDueJobs(t.ctx);
    expect(await starting(ana)).toHaveLength(before);
  });

  it('never in a private conversation, nor to someone who left a group', async () => {
    const cy = await signup(t, { displayName: 'Cy Start' });
    await ana
      .post('/v1/connections/requests', { toUserId: cy.user.id })
      .then((r) => cy.post(`/v1/connections/requests/${r.requestId}/accept`, {}));
    t.clock.set('2026-10-22T08:00:00Z');
    const group = (
      await ana.post('/v1/conversations', {
        kind: 'group',
        title: 'Trip crew',
        memberIds: [ben.user.id, cy.user.id],
      })
    ).conversation.id;
    const standup = await meeting(ana, group, {
      title: 'Crew call',
      start: { at: '2026-10-22T09:00:00.000Z', hasTime: true },
    });
    await cy.post(`/v1/messages/${standup.id}/kit`, { to: 'accepted' });
    await ben.del(`/v1/conversations/${group}/members/${ben.user.id}`);
    t.clock.set('2026-10-22T09:00:00Z');
    await runDueJobs(t.ctx);
    const titles = async (c: Client) => (await starting(c)).map((n: { title: string }) => n.title);
    expect(await titles(ana)).toContain('Starting now: Crew call');
    expect(await titles(cy)).toContain('Starting now: Crew call');
    expect(await titles(ben)).not.toContain('Starting now: Crew call');
  });
});
