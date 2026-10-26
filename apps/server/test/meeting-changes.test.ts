/**
 * A meeting that changes, and everyone's own answer to it (R123). The owner's own case: a group
 * of three in a space, a weekly meeting proposed there and accepted by one of the two; then its
 * title, day and time changed, for that time and every time after.
 */
import { uuidv4 } from '@caime/core';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runDueJobs } from '../src/lib/jobs';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let hassan: Client;
let sara: Client;
let omar: Client;
let group: string;

type Card = {
  id: string;
  seq: number;
  editedAt: string | null;
  payload: {
    state: string;
    title: string;
    round?: number;
    sequence?: number;
    answers?: Record<string, { a: string; r: number; s?: string }>;
    series?: { id: string; n: number; firstAt: string; base?: number };
    seriesFields?: Record<string, unknown>;
    fields: { title: string; start: { at: string }; repeat?: string; durationMinutes?: number };
  };
};

const connect = async (a: Client, b: Client) => {
  const r = await a.post('/v1/connections/requests', {
    toUserId: b.user.id,
    relationship: { sphere: 'work', role: 'colleague' },
  });
  await b.post(`/v1/connections/requests/${r.requestId}/accept`, {});
};
const cards = async (who: Client = hassan): Promise<Card[]> =>
  (
    (await who.get(`/v1/conversations/${group}/messages?limit=100`)).messages as Array<
      Card & { kind: string; payload: { kit?: string } }
    >
  ).filter((m) => m.kind === 'kit' && m.payload.kit === 'meeting');
const titles = async (c: Client) =>
  (await c.get('/v1/notifications')).notifications.map((n: { title: string }) => n.title);

beforeAll(async () => {
  t = await createTestApp();
  // Monday 26 October 2026, 08:00 UTC.
  t.clock.set('2026-10-26T08:00:00Z');
  hassan = await signup(t, { displayName: 'Hassan Changes', timeZone: 'Africa/Cairo' });
  sara = await signup(t, { displayName: 'Sara Changes', timeZone: 'Africa/Cairo' });
  omar = await signup(t, { displayName: 'Omar Changes', timeZone: 'Africa/Cairo' });
  await connect(hassan, sara);
  await connect(hassan, omar);
  // A space, then a group within it that has two people besides its maker.
  const space = (
    await hassan.post('/v1/spaces', {
      name: 'Project',
      kind: 'team',
      memberIds: [sara.user.id, omar.user.id],
    })
  ).space;
  group = (await hassan.post(`/v1/spaces/${space.id}/conversations`, { title: 'Planning' }))
    .conversation.id;
  await hassan.post(`/v1/conversations/${group}/members`, {
    userIds: [sara.user.id, omar.user.id],
  });
  await t.ctx.db
    .updateTable('sessions')
    .set({ expires_at: new Date('2030-01-01') })
    .execute();
});
afterAll(async () => {
  await t.close();
});

describe('a group’s meeting, each answering for themselves (R123)', () => {
  let card: Card;

  it('takes the first yes as the meeting on, and keeps the other’s answer theirs', async () => {
    // Thursday 29 October, 10:00 in Cairo, weekly.
    card = (
      await hassan.post(`/v1/conversations/${group}/messages`, {
        clientId: uuidv4(),
        kind: 'kit',
        payload: {
          kit: 'meeting',
          fields: {
            title: 'Weekly sync',
            start: { at: '2026-10-29T08:00:00.000Z', hasTime: true },
            durationMinutes: 60,
            repeat: 'week',
          },
        },
      })
    ).message;
    expect(card.payload.state).toBe('proposed');
    // Sara accepts as before (an old app's Accept is her own answer now).
    const accepted = (await sara.post(`/v1/messages/${card.id}/kit`, { to: 'accepted' })).message;
    expect(accepted.payload.state).toBe('accepted');
    expect(accepted.payload.answers?.[sara.user.id]).toMatchObject({ a: 'y', r: 0 });
    // Omar can still answer: not going, with a time he suggests.
    const no = (
      await omar.post(`/v1/messages/${card.id}/answer`, {
        going: false,
        suggest: { at: '2026-10-29T12:00:00.000Z', hasTime: true },
      })
    ).message;
    expect(no.payload.state).toBe('accepted');
    expect(no.payload.answers?.[omar.user.id]).toMatchObject({
      a: 'n',
      s: '2026-10-29T12:00:00.000Z',
    });
    // Its organizer hears each answer; nobody else is told of Omar's.
    expect((await titles(hassan)).some((x: string) => x.startsWith('Omar Changes suggests'))).toBe(
      true,
    );
    expect((await titles(sara)).some((x: string) => x.startsWith('Omar Changes'))).toBe(false);
    // Only its organizer calls it off; Omar's Cancel is refused.
    expect(
      (await omar.req('POST', `/v1/messages/${card.id}/kit`, { to: 'cancelled' })).statusCode,
    ).toBe(403);
    // And only its organizer gives it another time in a group.
    expect(
      (
        await omar.req('POST', `/v1/messages/${card.id}/time`, {
          start: { at: '2026-10-30T08:00:00.000Z', hasTime: true },
        })
      ).statusCode,
    ).toBe(403);
  });

  it('leaves the meeting out of the calendar of whoever isn’t going, and shows it at the top', async () => {
    const window = 'from=2026-10-26T00:00:00Z&to=2026-11-01T00:00:00Z';
    const mine = async (c: Client) =>
      (await c.get(`/v1/calendar?${window}`)).items.filter(
        (i: { title: string; projected: boolean }) => i.title === 'Weekly sync' && !i.projected,
      );
    expect(await mine(sara)).toHaveLength(1);
    expect(await mine(omar)).toHaveLength(0);
    // The line at the conversation's top: Sara sees two going (its organizer and herself)...
    const next = (await sara.get(`/v1/conversations/${group}/next`)).next;
    expect(next).toMatchObject({
      messageId: card.id,
      title: 'Weekly sync',
      at: '2026-10-29T08:00:00.000Z',
      going: 2,
      answer: 'going',
      heldHere: true,
    });
    // ...and Omar sees it too, with his own no.
    expect((await omar.get(`/v1/conversations/${group}/next`)).next).toMatchObject({
      messageId: card.id,
      answer: 'not_going',
    });
  });

  it('a new name tells them and keeps every answer', async () => {
    const before = (await cards())[0]!;
    const renamed = (
      await hassan.req('PATCH', `/v1/messages/${card.id}/meeting`, {
        fields: { ...before.payload.fields, title: 'Team sync' },
        scope: 'after',
      })
    ).json().message as Card;
    expect(renamed.payload).toMatchObject({ state: 'accepted', title: 'Team sync' });
    expect(renamed.payload.round ?? 0).toBe(0);
    expect(renamed.payload.answers?.[sara.user.id]?.a).toBe('y');
    expect(renamed.editedAt).toBeTruthy();
    expect(await titles(sara)).toContain('Hassan Changes: Changed');
  });

  it('a new day and time, for this and every time after, asks everyone again', async () => {
    const before = (await cards())[0]!;
    // Wednesday 28 October, 16:00 in Cairo (summer time, UTC+3, until the 29th).
    const moved = (
      await hassan.req('PATCH', `/v1/messages/${card.id}/meeting`, {
        fields: {
          ...before.payload.fields,
          start: { at: '2026-10-28T13:00:00.000Z', hasTime: true },
        },
        scope: 'after',
      })
    ).json().message as Card;
    expect(moved.payload).toMatchObject({ state: 'proposed', round: 1, sequence: 1 });
    // Counted again from this time, so the times after follow.
    expect(moved.payload.series).toMatchObject({
      id: card.id,
      n: 0,
      firstAt: '2026-10-28T13:00:00.000Z',
    });
    // Sara's yes was for the old time: asked again, she hasn't answered.
    expect((await sara.get(`/v1/conversations/${group}/next`)).next).toMatchObject({
      at: '2026-10-28T13:00:00.000Z',
      answer: null,
      going: 1,
      agreed: false,
    });
    expect(await titles(sara)).toContain('Hassan Changes: New time');
    // Answered again, it's on.
    const yes = (await sara.post(`/v1/messages/${card.id}/answer`, { going: true })).message;
    expect(yes.payload.state).toBe('accepted');
    // The calendar looks ahead on Wednesdays at 16:00 in Cairo now, an hour later in UTC once
    // summer time is over.
    const ahead = (
      await sara.get('/v1/calendar?from=2026-10-26T00:00:00Z&to=2026-11-12T00:00:00Z')
    ).items
      .filter((i: { title: string }) => i.title === 'Team sync')
      .map((i: { at: string }) => i.at);
    expect(ahead).toEqual([
      '2026-10-28T13:00:00.000Z',
      '2026-11-04T14:00:00.000Z',
      '2026-11-11T14:00:00.000Z',
    ]);
  });

  it('posts the next time on the new day, with the yeses carried on', async () => {
    t.clock.set('2026-10-28T14:01:00Z');
    await runDueJobs(t.ctx);
    const all = await cards();
    expect(all).toHaveLength(2);
    const second = all[1]!;
    expect(second.payload).toMatchObject({
      state: 'accepted',
      title: 'Team sync',
      series: { id: card.id, n: 1 },
      fields: { start: { at: '2026-11-04T14:00:00.000Z' } },
    });
    expect(second.payload.answers?.[sara.user.id]).toMatchObject({ a: 'y', r: 0 });
    // Omar's no was for that time alone.
    expect(second.payload.answers?.[omar.user.id]).toBeUndefined();
  });

  it('one time changed alone leaves the series saying what it said', async () => {
    const second = (await cards())[1]!;
    // A time of a series is changed for this time or every time after: never without saying.
    expect(
      (
        await hassan.req('PATCH', `/v1/messages/${second.id}/meeting`, {
          fields: { ...second.payload.fields, durationMinutes: 90 },
        })
      ).statusCode,
    ).toBe(400);
    // How it repeats changes for every time ahead, never for one.
    expect(
      (
        await hassan.req('PATCH', `/v1/messages/${second.id}/meeting`, {
          fields: { ...second.payload.fields, repeat: 'fortnight' },
          scope: 'this',
        })
      ).statusCode,
    ).toBe(400);
    // Thursday 5 November this once, 11:00 in Cairo.
    const once = (
      await hassan.req('PATCH', `/v1/messages/${second.id}/meeting`, {
        fields: {
          ...second.payload.fields,
          title: 'Team sync (moved)',
          start: { at: '2026-11-05T09:00:00.000Z', hasTime: true },
        },
        scope: 'this',
      })
    ).json().message as Card;
    expect(once.payload.state).toBe('proposed');
    expect(once.payload.seriesFields).toMatchObject({ title: 'Team sync' });
    // The anchor is untouched: the one after is Wednesday's, under the series' own name.
    const ahead = (
      await sara.get('/v1/calendar?from=2026-11-01T00:00:00Z&to=2026-11-13T00:00:00Z')
    ).items.map((i: { title: string; at: string }) => [i.title, i.at]);
    expect(ahead).toContainEqual(['Team sync', '2026-11-11T14:00:00.000Z']);
    // Its next time is posted after this one ends, not at the old end.
    await sara.post(`/v1/messages/${second.id}/answer`, { going: true });
    t.clock.set('2026-11-04T15:01:00Z');
    await runDueJobs(t.ctx);
    expect(await cards()).toHaveLength(2);
    t.clock.set('2026-11-05T10:01:00Z');
    await runDueJobs(t.ctx);
    const third = (await cards())[2]!;
    expect(third.payload).toMatchObject({
      title: 'Team sync',
      series: { n: 2 },
      fields: { start: { at: '2026-11-11T14:00:00.000Z' } },
    });
  });

  it('is its organizer’s alone to change, and an answer is for a group', async () => {
    const third = (await cards())[2]!;
    expect(
      (
        await sara.req('PATCH', `/v1/messages/${third.id}/meeting`, {
          fields: { ...third.payload.fields, title: 'Mine' },
          scope: 'after',
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (await hassan.req('POST', `/v1/messages/${third.id}/answer`, { going: false })).statusCode,
    ).toBe(400);
    // Stopping it repeating changes when it is: its organizer's too.
    expect((await sara.req('POST', `/v1/messages/${third.id}/repeat/stop`, {})).statusCode).toBe(
      403,
    );
  });
});

describe('a meeting between two people, changed (R123)', () => {
  it('asks the other again for a new time, and says nothing new for a new name', async () => {
    const chat = (await hassan.post('/v1/conversations', { kind: 'direct', userId: sara.user.id }))
      .conversation.id;
    const card = (
      await hassan.post(`/v1/conversations/${chat}/messages`, {
        clientId: uuidv4(),
        kind: 'kit',
        payload: {
          kit: 'meeting',
          fields: { title: 'Coffee', start: { at: '2026-11-20T08:00:00.000Z', hasTime: true } },
        },
      })
    ).message as Card;
    await sara.post(`/v1/messages/${card.id}/kit`, { to: 'accepted' });
    // In a chat of two there are no separate answers: Accept and Decline are the card's.
    expect(
      (await sara.req('POST', `/v1/messages/${card.id}/answer`, { going: true })).statusCode,
    ).toBe(400);
    const renamed = (
      await hassan.req('PATCH', `/v1/messages/${card.id}/meeting`, {
        fields: { ...card.payload.fields, title: 'Coffee and plans' },
      })
    ).json().message as Card;
    expect(renamed.payload.state).toBe('accepted');
    const moved = (
      await hassan.req('PATCH', `/v1/messages/${card.id}/meeting`, {
        fields: {
          ...renamed.payload.fields,
          start: { at: '2026-11-21T08:00:00.000Z', hasTime: true },
        },
      })
    ).json().message as Card;
    expect(moved.payload).toMatchObject({ state: 'proposed', sequence: 1 });
    // The line that asks Sara again, where she'll see it.
    const card2 = await t.ctx.db
      .selectFrom('messages')
      .select(sql<string>`payload->>'askLine'`.as('line'))
      .where('id', '=', card.id)
      .executeTakeFirstOrThrow();
    const line = await t.ctx.db
      .selectFrom('messages')
      .select(['is_request', 'payload'])
      .where('id', '=', card2.line)
      .executeTakeFirstOrThrow();
    expect(line.is_request).toBe(true);
    // It says what its organizer did, never that they suggested a time.
    expect(line.payload).toMatchObject({ event: 'meeting_moved', title: 'Coffee and plans' });
    // A time gone by isn't one to move to.
    expect(
      (
        await hassan.req('PATCH', `/v1/messages/${card.id}/meeting`, {
          fields: {
            ...moved.payload.fields,
            start: { at: '2026-10-01T08:00:00.000Z', hasTime: true },
          },
        })
      ).statusCode,
    ).toBe(400);
  });
});
