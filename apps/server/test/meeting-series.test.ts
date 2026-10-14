import { uuidv4 } from '@caime/core';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { memoryMailer } from '../src/lib/email';
import { runDueJobs } from '../src/lib/jobs';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let mail: ReturnType<typeof memoryMailer>;
let ana: Client;
let ben: Client;
let convo: string;

type Card = {
  id: string;
  seq: number;
  senderId: string;
  payload: {
    state: string;
    series?: { id: string; n: number; firstAt: string; zone: string; days?: number[] };
    fields: { start: { at: string }; repeat?: string; repeatUntil?: string };
    repeatStopped?: { by: string };
  };
};

const propose = async (fields: Record<string, unknown>, conversationId = convo) =>
  (
    await ana.post(`/v1/conversations/${conversationId}/messages`, {
      clientId: uuidv4(),
      kind: 'kit',
      payload: { kit: 'meeting', fields },
    })
  ).message as Card;
/** The meeting cards in a conversation, oldest first. */
const cards = async (conversationId = convo): Promise<Card[]> =>
  (
    (await ana.get(`/v1/conversations/${conversationId}/messages?limit=100`)).messages as Array<
      Card & { kind: string; payload: { kit?: string } }
    >
  ).filter((m) => m.kind === 'kit' && m.payload.kit === 'meeting');
const at = (c: Card) => c.payload.fields.start.at;
/** What's queued for a meeting card: its brief, its start and its next time. */
const jobsFor = (messageId: string) =>
  t.ctx.db
    .selectFrom('jobs')
    .select('kind')
    .where('kind', 'in', ['card.brief', 'meeting.start', 'meeting.next'])
    .where(sql`payload->>'messageId'`, '=', messageId)
    .execute()
    .then((rows) => rows.map((r) => r.kind).sort());

beforeAll(async () => {
  mail = memoryMailer();
  t = await createTestApp({}, { mail });
  // Tuesday 20 October 2026, 08:00 UTC.
  t.clock.set('2026-10-20T08:00:00Z');
  ana = await signup(t, { displayName: 'Ana Weekly', timeZone: 'Europe/Berlin' });
  ben = await signup(t, { displayName: 'Ben Weekly' });
  const r = await ana.post('/v1/connections/requests', {
    toUserId: ben.user.id,
    relationship: { sphere: 'work', role: 'colleague' },
  });
  await ben.post(`/v1/connections/requests/${r.requestId}/accept`, {});
  convo = (await ana.post('/v1/conversations', { kind: 'direct', userId: ben.user.id }))
    .conversation.id;
  // The series run for months here: the sessions last as long.
  await t.ctx.db
    .updateTable('sessions')
    .set({ expires_at: new Date('2030-01-01') })
    .execute();
});
afterAll(async () => {
  await t.close();
});

describe('a meeting that repeats (R58)', () => {
  let first: Card;

  it('starts a series on the proposer’s clock, and goes on once it’s agreed', async () => {
    // Thursday 22 October, 10:00 in Berlin (summer time).
    first = await propose({
      title: 'Weekly sync',
      start: { at: '2026-10-22T08:00:00.000Z', hasTime: true },
      durationMinutes: 60,
      repeat: 'week',
    });
    expect(first.payload.series).toEqual({
      id: first.id,
      n: 0,
      firstAt: '2026-10-22T08:00:00.000Z',
      zone: 'Europe/Berlin',
    });
    // Proposed: nothing follows it.
    expect(await jobsFor(first.id)).toEqual([]);
    await ben.post(`/v1/messages/${first.id}/kit`, { to: 'accepted' });
    expect(await jobsFor(first.id)).toEqual(['card.brief', 'meeting.next', 'meeting.start']);
  });

  it('posts the next time a minute after each ends, at the same hour when the clocks change', async () => {
    t.clock.set('2026-10-22T09:00:30Z');
    await runDueJobs(t.ctx);
    expect(await cards()).toHaveLength(1);
    const told = (await ben.get('/v1/notifications')).notifications.length;
    t.clock.set('2026-10-22T09:01:00Z');
    await runDueJobs(t.ctx);
    const all = await cards();
    expect(all).toHaveLength(2);
    const second = all[1]!;
    // 10:00 in Berlin again, an hour later in UTC now summer time is over.
    expect(at(second)).toBe('2026-10-29T09:00:00.000Z');
    expect(second).toMatchObject({
      senderId: ana.user.id,
      payload: {
        state: 'accepted',
        series: { id: first.id, n: 1 },
        fields: { repeat: 'week' },
      },
    });
    // Its own brief, start and next; nobody told of it (it's the series going on).
    expect(await jobsFor(second.id)).toEqual(['card.brief', 'meeting.next', 'meeting.start']);
    expect((await ben.get('/v1/notifications')).notifications).toHaveLength(told);
    // Twice is once.
    await runDueJobs(t.ctx);
    expect(await cards()).toHaveLength(2);
  });

  it('a time cancelled leaves the rest; stopping ends the series there', async () => {
    const second = (await cards())[1]!;
    await ben.post(`/v1/messages/${second.id}/kit`, { to: 'cancelled' });
    t.clock.set('2026-10-29T10:01:00Z');
    await runDueJobs(t.ctx);
    const third = (await cards())[2]!;
    expect(at(third)).toBe('2026-11-05T09:00:00.000Z');
    expect(third.payload).toMatchObject({ state: 'accepted', series: { n: 2 } });
    // A time over can't be stopped; the one ahead can, by anyone it's for.
    expect((await ben.req('POST', `/v1/messages/${second.id}/repeat/stop`, {})).statusCode).toBe(
      400,
    );
    const stopped = await ben.post(`/v1/messages/${third.id}/repeat/stop`, {});
    expect(stopped.message.payload.fields.repeat).toBeUndefined();
    expect(stopped.message.payload.repeatStopped).toMatchObject({ by: ben.user.id });
    const heard = (await ana.get('/v1/notifications')).notifications.map(
      (n: { title: string }) => n.title,
    );
    expect(heard).toContain('Ben Weekly: stopped repeating');
    // Its end posts nothing more.
    t.clock.set('2026-11-05T10:01:00Z');
    await runDueJobs(t.ctx);
    expect(await cards()).toHaveLength(3);
    expect((await ben.req('POST', `/v1/messages/${third.id}/repeat/stop`, {})).statusCode).toBe(
      400,
    );
  });

  it('skips the times missed while nothing could post, and holds a month’s day', async () => {
    t.clock.set('2026-11-06T08:00:00Z');
    const monthly = await propose({
      title: 'Month end',
      // Saturday 31 January 2027, 09:00 in Berlin.
      start: { at: '2027-01-31T08:00:00.000Z', hasTime: true },
      durationMinutes: 30,
      repeat: 'month',
    });
    await ben.post(`/v1/messages/${monthly.id}/kit`, { to: 'accepted' });
    // The server away until mid-March: February's is gone by, March 31st is next.
    t.clock.set('2027-03-15T08:00:00Z');
    await runDueJobs(t.ctx);
    const next = (await cards()).find(
      (c) => c.payload.series?.id === monthly.id && c.id !== monthly.id,
    );
    expect(next?.payload.series?.n).toBe(2);
    expect(next && at(next)).toBe('2027-03-31T07:00:00.000Z');
  });

  it('the calendar and the feed look ahead; the slots hold those times', async () => {
    t.clock.set('2027-04-01T08:00:00Z');
    const weekly = await propose({
      title: 'Standing call',
      // Monday 5 April 2027, 11:00 in Berlin (09:00Z).
      start: { at: '2027-04-05T09:00:00.000Z', hasTime: true },
      durationMinutes: 30,
      repeat: 'week',
    });
    const window = 'from=2027-04-01T00:00:00Z&to=2027-04-27T00:00:00Z';
    const ahead = async (c: Client) =>
      (await c.get(`/v1/calendar?${window}`)).items.filter(
        (i: { title: string }) => i.title === 'Standing call',
      );
    // Asked, not agreed: only the card.
    expect(await ahead(ben)).toHaveLength(1);
    await ben.post(`/v1/messages/${weekly.id}/kit`, { to: 'accepted' });
    const items = await ahead(ben);
    expect(
      items.map((i: { id: string; at: string; projected: boolean; repeat: string }) => [
        i.id,
        i.at,
        i.projected,
        i.repeat,
      ]),
    ).toEqual([
      [weekly.id, '2027-04-05T09:00:00.000Z', false, 'week'],
      [`${weekly.id}:1`, '2027-04-12T09:00:00.000Z', true, 'week'],
      [`${weekly.id}:2`, '2027-04-19T09:00:00.000Z', true, 'week'],
      [`${weekly.id}:3`, '2027-04-26T09:00:00.000Z', true, 'week'],
    ]);
    // The feed: one event a time, the same before and after each is posted.
    const { url } = await ben.post('/v1/calendar/feed', {});
    const ics = (await t.app.inject({ method: 'GET', url: new URL(url).pathname })).body;
    for (const n of [0, 1, 2]) expect(ics).toContain(`UID:meeting-${weekly.id}-${n}@caime`);
    // Ben takes bookings: a time ahead of the series isn't offered.
    const set = await ben.req('PUT', '/v1/me/booking', {
      booking: {
        timeZone: 'UTC',
        slotMinutes: 30,
        days: [1].map((weekday) => ({ weekday, start: '08:00', end: '11:00' })),
        leadMinutes: 0,
        horizonDays: 30,
      },
      items: [
        {
          id: 'chat',
          name: 'A quick chat',
          price: null,
          unit: 'minutes',
          minutes: 30,
          capacity: 1,
          maxQuantity: 1,
          audience: 'public',
          providers: null,
          askTopic: false,
        },
      ],
    });
    expect(set.statusCode, set.body).toBe(200);
    const slots = (
      await ana.get(
        `/v1/people/${ben.user.id}/slots?from=2027-04-19T00:00:00Z&to=2027-04-20T00:00:00Z&item=chat`,
      )
    ).slots.map((s: string) => s.slice(11, 16));
    expect(slots).toEqual(['08:00', '08:30', '09:30', '10:00', '10:30']);
    // Stopped: nothing ahead.
    await ana.post(`/v1/messages/${weekly.id}/repeat/stop`, {});
    expect((await ahead(ben)).map((i: { id: string }) => i.id)).toEqual([weekly.id]);
  });

  it('repeats only in a chat or a group', async () => {
    const org = await ana.post('/v1/orgs', {
      country: 'DE',
      name: 'Weekly GmbH',
      handle: 'weekly.gmbh',
      kind: 'business',
    });
    const thread = await ben.post(`/v1/orgs/${org.org.id}/conversations`, {});
    const refused = await ben.req('POST', `/v1/conversations/${thread.conversationId}/messages`, {
      clientId: uuidv4(),
      kind: 'kit',
      payload: {
        kit: 'meeting',
        fields: {
          title: 'Weekly',
          start: { at: '2027-04-08T09:00:00.000Z', hasTime: true },
          repeat: 'week',
        },
      },
    });
    expect(refused.statusCode).toBe(400);
    expect(refused.json().error.message).toBe('A meeting repeats only in a chat or a group.');
  });

  it('a meeting with guests goes on in its space, and asks its guests again each time', async () => {
    t.clock.set('2027-05-01T08:00:00Z');
    const card = await propose({
      title: 'Client check-in',
      start: { at: '2027-05-04T08:00:00.000Z', hasTime: true },
      durationMinutes: 30,
      repeat: 'week',
    });
    await ben.post(`/v1/messages/${card.id}/kit`, { to: 'accepted' });
    const { space } = await ana.post(`/v1/messages/${card.id}/guests`, {
      email: 'gus.weekly@example.com',
      name: 'Gus Guest',
    });
    await t.ctx.flush();
    const copy = (await cards(space.conversationId))[0]!;
    expect(copy.payload.series).toMatchObject({ id: card.id, n: 0 });
    const invited = mail.outbox.filter((m) => m.to === 'gus.weekly@example.com');
    expect(invited).toHaveLength(1);
    expect(invited[0]?.icalEvent?.content).toContain(`UID:meeting-${card.id}-0@caime`);
    // Its end posts the next time in the space, not where it was agreed; Gus is asked again.
    t.clock.set('2027-05-04T08:31:00Z');
    await runDueJobs(t.ctx);
    await t.ctx.flush();
    expect((await cards()).filter((c) => c.payload.series?.id === card.id)).toHaveLength(1);
    const inSpace = await cards(space.conversationId);
    expect(inSpace).toHaveLength(2);
    expect(inSpace[1]?.payload).toMatchObject({ state: 'accepted', series: { n: 1 } });
    const again = mail.outbox.filter((m) => m.to === 'gus.weekly@example.com');
    expect(again).toHaveLength(2);
    expect(again[1]?.icalEvent?.content).toContain(`UID:meeting-${card.id}-1@caime`);
    expect(again[1]?.text).not.toBe(again[0]?.text);
  });
});

describe('a meeting held every workday, until a day (R58)', () => {
  let cara: Client;
  let chat: string;
  const series = async (id: string) =>
    (await cards(chat)).filter((c) => c.payload.series?.id === id);

  beforeAll(async () => {
    // Tuesday 1 June 2027. Cara lives in Cairo, where the week is Sunday to Thursday (R76).
    t.clock.set('2027-06-01T08:00:00Z');
    cara = await signup(t, { displayName: 'Cara Daily', country: 'EG', timeZone: 'Africa/Cairo' });
    const r = await cara.post('/v1/connections/requests', {
      toUserId: ana.user.id,
      relationship: { sphere: 'work', role: 'colleague' },
    });
    await ana.post(`/v1/connections/requests/${r.requestId}/accept`, {});
    chat = (await cara.post('/v1/conversations', { kind: 'direct', userId: ana.user.id }))
      .conversation.id;
    await t.ctx.db
      .updateTable('sessions')
      .set({ expires_at: new Date('2030-01-01') })
      .execute();
  });

  const proposeAs = async (c: Client, fields: Record<string, unknown>) =>
    c.req('POST', `/v1/conversations/${chat}/messages`, {
      clientId: uuidv4(),
      kind: 'kit',
      payload: { kit: 'meeting', fields },
    });

  it('follows its proposer’s week and stops after its last day', async () => {
    // Thursday 3 June, 09:00 in Cairo (06:00Z), every workday until Tuesday 8 June.
    const res = await proposeAs(cara, {
      title: 'Stand-up',
      start: { at: '2027-06-03T06:00:00.000Z', hasTime: true },
      durationMinutes: 15,
      repeat: 'workday',
      repeatUntil: '2027-06-08',
    });
    expect(res.statusCode, res.body).toBe(201);
    const first = res.json().message as Card;
    expect(first.payload.series).toMatchObject({
      n: 0,
      zone: 'Africa/Cairo',
      days: [0, 1, 2, 3, 4],
    });
    await ana.post(`/v1/messages/${first.id}/kit`, { to: 'accepted' });
    // Ahead on the calendar: Sunday, Monday and Tuesday; nothing after the last day.
    const items = (
      await ana.get('/v1/calendar?from=2027-06-01T00:00:00Z&to=2027-06-30T00:00:00Z')
    ).items.filter((i: { title: string }) => i.title === 'Stand-up');
    expect(items.map((i: { at: string; repeat: string }) => [i.at, i.repeat])).toEqual([
      ['2027-06-03T06:00:00.000Z', 'workday'],
      ['2027-06-06T06:00:00.000Z', 'workday'],
      ['2027-06-07T06:00:00.000Z', 'workday'],
      ['2027-06-08T06:00:00.000Z', 'workday'],
    ]);
    // Each ends, and the next workday's is posted: Friday and Saturday are Cairo's weekend.
    for (const end of ['2027-06-03', '2027-06-06', '2027-06-07', '2027-06-08']) {
      t.clock.set(`${end}T06:16:00Z`);
      await runDueJobs(t.ctx);
    }
    const held = await series(first.id);
    expect(held.map(at)).toEqual([
      '2027-06-03T06:00:00.000Z',
      '2027-06-06T06:00:00.000Z',
      '2027-06-07T06:00:00.000Z',
      '2027-06-08T06:00:00.000Z',
    ]);
    expect(held.at(-1)?.payload).toMatchObject({
      state: 'accepted',
      series: { n: 3 },
      fields: { repeat: 'workday', repeatUntil: '2027-06-08' },
    });
  });

  it('is told when it ends before it starts, or ends without repeating', async () => {
    t.clock.set('2027-06-10T08:00:00Z');
    const before = await proposeAs(cara, {
      title: 'Backwards',
      start: { at: '2027-06-14T06:00:00.000Z', hasTime: true },
      repeat: 'week',
      repeatUntil: '2027-06-13',
    });
    expect(before.statusCode).toBe(400);
    expect(before.json().error.message).toBe('A meeting can’t stop repeating before it starts.');
    const once = await proposeAs(cara, {
      title: 'Once',
      start: { at: '2027-06-14T06:00:00.000Z', hasTime: true },
      repeatUntil: '2027-06-30',
    });
    expect(once.statusCode).toBe(400);
    expect(once.json().error.message).toBe('Until is for a meeting that repeats.');
    // On its first day is fine, and "Stop repeating" ends both.
    const sameDay = await proposeAs(cara, {
      title: 'Just today',
      start: { at: '2027-06-14T06:00:00.000Z', hasTime: true },
      repeat: 'week',
      repeatUntil: '2027-06-14',
    });
    expect(sameDay.statusCode, sameDay.body).toBe(201);
    const card = sameDay.json().message as Card;
    await ana.post(`/v1/messages/${card.id}/kit`, { to: 'accepted' });
    const stopped = await cara.post(`/v1/messages/${card.id}/repeat/stop`, {});
    expect(stopped.message.payload.fields).not.toHaveProperty('repeat');
    expect(stopped.message.payload.fields).not.toHaveProperty('repeatUntil');
  });
});
