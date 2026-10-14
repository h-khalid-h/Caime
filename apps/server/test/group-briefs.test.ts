import { uuidv4 } from '@caime/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runDueJobs } from '../src/lib/jobs';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let ana: Client; // calls the meetings
let ben: Client; // Ana and Ben call each other work
let cara: Client; // Ana's friend

const connect = async (a: Client, b: Client, sphere: string, role: string) => {
  const r = await a.post('/v1/connections/requests', {
    toUserId: b.user.id,
    relationship: { sphere, role },
  });
  await b.post(`/v1/connections/requests/${r.requestId}/accept`, {});
};
/** Ana proposes a meeting in a conversation; Ben accepts it. */
const agreed = async (conversationId: string, title: string, at: string) => {
  const card = (
    await ana.post(`/v1/conversations/${conversationId}/messages`, {
      clientId: uuidv4(),
      kind: 'kit',
      payload: {
        kit: 'meeting',
        fields: { title, start: { at, hasTime: true }, durationMinutes: 30 },
      },
    })
  ).message;
  await ben.post(`/v1/messages/${card.id}/kit`, { to: 'accepted' });
  return card as { id: string };
};
/** Who was told of a card's brief. */
const briefed = async (messageId: string) => {
  const told: string[] = [];
  for (const [name, c] of [
    ['ana', ana],
    ['ben', ben],
    ['cara', cara],
  ] as const) {
    const mine = (await c.get('/v1/notifications')).notifications.filter(
      (n: { kind: string; data: { messageId?: string } }) =>
        n.kind === 'brief' && n.data.messageId === messageId,
    );
    if (mine.length) told.push(name);
  }
  return told;
};

beforeAll(async () => {
  t = await createTestApp();
  t.clock.set('2026-10-20T08:00:00Z');
  ana = await signup(t, { displayName: 'Ana Group' });
  ben = await signup(t, { displayName: 'Ben Group' });
  cara = await signup(t, { displayName: 'Cara Group' });
  await connect(ana, ben, 'work', 'colleague');
  await ben.post('/v1/relationships', { userId: ana.user.id, sphere: 'work', role: 'colleague' });
  await connect(ana, cara, 'friend', 'friend');
});
afterAll(async () => {
  await t.close();
});

describe('the brief before a group’s meeting (R58)', () => {
  it('in a group, goes to whoever calls its organizer work, and to the organizer', async () => {
    const group = (
      await ana.post('/v1/conversations', {
        kind: 'group',
        title: 'Launch crew',
        memberIds: [ben.user.id, cara.user.id],
      })
    ).conversation.id;
    const card = await agreed(group, 'Launch check-in', '2026-10-20T12:00:00.000Z');
    t.clock.set('2026-10-20T11:00:00Z');
    await runDueJobs(t.ctx);
    expect(await briefed(card.id)).toEqual(['ana', 'ben']);
  });

  it('in a space, as its kind says: a team’s to everyone in it, a family’s to nobody', async () => {
    const team = (
      await ana.post('/v1/spaces', {
        name: 'Launch team',
        kind: 'team',
        memberIds: [ben.user.id, cara.user.id],
      })
    ).space;
    const family = (
      await ana.post('/v1/spaces', {
        name: 'Ana’s people',
        kind: 'family',
        memberIds: [ben.user.id, cara.user.id],
      })
    ).space;
    t.clock.set('2026-10-21T08:00:00Z');
    const work = await agreed(team.generalId, 'Sprint review', '2026-10-21T12:00:00.000Z');
    const home = await agreed(family.generalId, 'Sunday lunch', '2026-10-21T12:30:00.000Z');
    t.clock.set('2026-10-21T11:30:00Z');
    await runDueJobs(t.ctx);
    expect(await briefed(work.id)).toEqual(['ana', 'ben', 'cara']);
    expect(await briefed(home.id)).toEqual([]);
  });
});
