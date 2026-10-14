import { uuidv4 } from '@caime/core';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runDueJobs } from '../src/lib/jobs';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let noor: Client; // owner
let omar: Client; // on the team, the one who does consultations
let lina: Client; // a customer
let sami: Client; // another customer
let orgId: string;
let convo: string;
let samis: string;

const HOURS = {
  timeZone: 'Africa/Cairo',
  slotMinutes: 30,
  // Sunday to Thursday, 09:00–12:00 Cairo (UTC+3 in October 2026: 06:00–09:00Z).
  days: [0, 1, 2, 3, 4].map((weekday) => ({ weekday, start: '09:00', end: '12:00' })),
  leadMinutes: 60,
  horizonDays: 14,
};
const CONSULT = {
  id: 'consult',
  name: 'Consultation',
  price: null,
  unit: 'minutes',
  minutes: 30,
  capacity: 1,
  maxQuantity: 1,
  audience: 'public',
  providers: [] as string[],
  askTopic: false,
};
const CLEANING = { ...CONSULT, id: 'cleaning', name: 'Cleaning', providers: null };

type Card = {
  id: string;
  senderId: string;
  payload: {
    state: string;
    series?: { id: string; n: number; firstAt: string; zone: string; days?: number[] };
    fields: { start: { at: string }; repeat?: string };
    booking?: { itemId: string; endAt: string; providerId: string | null };
  };
};
const cards = async (): Promise<Card[]> =>
  (
    (await omar.get(`/v1/conversations/${convo}/messages?limit=100`)).messages as Array<
      Card & { kind: string; payload: { kit?: string } }
    >
  ).filter((m) => m.kind === 'kit' && m.payload.kit === 'appointment');
const at = (c: Card) => c.payload.fields.start.at;
const jobsFor = (messageId: string) =>
  t.ctx.db
    .selectFrom('jobs')
    .select('kind')
    .where('kind', 'in', ['card.brief', 'meeting.start', 'meeting.next'])
    .where(sql`payload->>'messageId'`, '=', messageId)
    .execute()
    .then((rows) => rows.map((r) => r.kind).sort());
const titles = async (c: Client) =>
  (await c.get('/v1/notifications')).notifications.map(
    (n: { title: string; body: string }) => `${n.title} | ${n.body}`,
  );

beforeAll(async () => {
  t = await createTestApp();
  // Thursday 1 October 2026, 05:00Z: 08:00 in Cairo.
  t.clock.set('2026-10-01T05:00:00Z');
  noor = await signup(t, { displayName: 'Noor Series', timeZone: 'Asia/Dubai' });
  omar = await signup(t, { displayName: 'Omar Series' });
  lina = await signup(t, { displayName: 'Lina Series', timeZone: 'Europe/London' });
  sami = await signup(t, { displayName: 'Sami Series' });
  orgId = (
    await noor.post('/v1/orgs', {
      country: 'EG',
      name: 'Nile Weekly',
      handle: 'nile.weekly',
      kind: 'clinic',
    })
  ).org.id;
  const r = await noor.post('/v1/connections/requests', { toUserId: omar.user.id });
  await omar.post(`/v1/connections/requests/${r.requestId}/accept`, {});
  await noor.post(`/v1/orgs/${orgId}/members`, { userIds: [omar.user.id] });
  CONSULT.providers = [omar.user.id];
  const set = await noor.req('PUT', `/v1/orgs/${orgId}/booking`, {
    booking: HOURS,
    items: [CONSULT, CLEANING],
  });
  expect(set.statusCode, set.body).toBe(200);
  convo = (await lina.post(`/v1/orgs/${orgId}/conversations`, {})).conversationId;
  samis = (await sami.post(`/v1/orgs/${orgId}/conversations`, {})).conversationId;
  await t.ctx.db
    .updateTable('sessions')
    .set({ expires_at: new Date('2030-01-01') })
    .execute();
});
afterAll(async () => {
  await t.close();
});

describe('an appointment that repeats (R58)', () => {
  let first: Card;

  it('is booked from the catalog on the organization’s clock, and goes on once confirmed', async () => {
    const booked = await lina.req('POST', `/v1/conversations/${convo}/messages`, {
      clientId: uuidv4(),
      kind: 'kit',
      payload: {
        kit: 'appointment',
        // Sunday 4 October, 09:00 in Cairo.
        fields: {
          title: 'Physio',
          start: { at: '2026-10-04T06:00:00.000Z', hasTime: true },
          repeat: 'week',
        },
        booking: { itemId: 'consult', quantity: 1 },
      },
    });
    expect(booked.statusCode, booked.body).toBe(201);
    first = booked.json().message;
    // The clinic's clock, not Lina's in London.
    expect(first.payload.series).toEqual({
      id: first.id,
      n: 0,
      firstAt: '2026-10-04T06:00:00.000Z',
      zone: 'Africa/Cairo',
    });
    expect(first.payload.state).toBe('requested');
    expect(await jobsFor(first.id)).toEqual([]);
    await omar.post(`/v1/messages/${first.id}/kit`, { to: 'confirmed' });
    expect((await jobsFor(first.id)).includes('meeting.next')).toBe(true);
    // Never a meeting's start (no call to ring).
    expect((await jobsFor(first.id)).includes('meeting.start')).toBe(false);
  });

  it('holds the times ahead: the team’s calendar shows them and nobody else may book them', async () => {
    const window = 'from=2026-10-04T00:00:00Z&to=2026-10-15T00:00:00Z';
    const items = (await omar.get(`/v1/orgs/${orgId}/calendar?${window}`)).items as Array<{
      id: string;
      messageId: string;
      at: string;
      ahead: boolean;
      state: string;
      repeat: string | null;
      booking: { endAt: string };
    }>;
    expect(items.map((i) => [i.id, i.at, i.ahead, i.state, i.repeat, i.booking.endAt])).toEqual([
      [
        first.id,
        '2026-10-04T06:00:00.000Z',
        false,
        'confirmed',
        'week',
        '2026-10-04T06:30:00.000Z',
      ],
      [
        `${first.id}:1`,
        '2026-10-11T06:00:00.000Z',
        true,
        'confirmed',
        'week',
        '2026-10-11T06:30:00.000Z',
      ],
    ]);
    expect(items.every((i) => i.messageId === first.id)).toBe(true);
    // Sami can't take next Sunday's 09:00 with Omar: it's Lina's.
    const slots = (
      await sami.get(
        `/v1/orgs/${orgId}/slots?from=2026-10-11T00:00:00Z&to=2026-10-12T00:00:00Z&item=consult`,
      )
    ).slots.map((s: string) => s.slice(11, 16));
    expect(slots).not.toContain('06:00');
    expect(slots).toContain('06:30');
    const refused = await sami.req('POST', `/v1/conversations/${samis}/messages`, {
      clientId: uuidv4(),
      kind: 'kit',
      payload: {
        kit: 'appointment',
        fields: { title: 'Consult', start: { at: '2026-10-11T06:00:00.000Z', hasTime: true } },
        booking: { itemId: 'consult', quantity: 1 },
      },
    });
    expect(refused.statusCode).toBe(409);
    expect(refused.json().error.code).toBe('slot_taken');
    // Lina's own calendar looks ahead the same way.
    const hers = (await lina.get(`/v1/calendar?${window}`)).items.filter((i: { title: string }) =>
      i.title.includes('Physio'),
    );
    expect(hers.map((i: { at: string; projected: boolean }) => [i.at, i.projected])).toEqual([
      ['2026-10-04T06:00:00.000Z', false],
      ['2026-10-11T06:00:00.000Z', true],
    ]);
  });

  it('posts each next time confirmed, booked again with the same person, moving nothing', async () => {
    // The thread was answered and resolved: a time going on doesn't open it again.
    await omar.post(`/v1/business/${convo}/resolve`, {});
    const thread = () =>
      t.ctx.db
        .selectFrom('business_threads')
        .select(['last_customer_seq', 'resolved_at'])
        .where('conversation_id', '=', convo)
        .executeTakeFirstOrThrow();
    const before = await thread();
    expect(before.resolved_at).not.toBeNull();
    // The first time's brief, an hour before it, is its own.
    t.clock.set('2026-10-04T06:29:00Z');
    await runDueJobs(t.ctx);
    const told = (await lina.get('/v1/notifications')).notifications.length;
    t.clock.set('2026-10-04T06:31:00Z');
    await runDueJobs(t.ctx);
    const all = await cards();
    expect(all).toHaveLength(2);
    const second = all[1]!;
    expect(at(second)).toBe('2026-10-11T06:00:00.000Z');
    expect(second).toMatchObject({
      senderId: lina.user.id,
      payload: {
        state: 'confirmed',
        series: { id: first.id, n: 1 },
        booking: {
          itemId: 'consult',
          endAt: '2026-10-11T06:30:00.000Z',
          providerId: omar.user.id,
        },
      },
    });
    expect(await thread()).toEqual(before);
    expect((await lina.get('/v1/notifications')).notifications).toHaveLength(told);
    // Twice is once.
    await runDueJobs(t.ctx);
    expect(await cards()).toHaveLength(2);
  });

  it('skips a time someone else holds, says so, and books the one after', async () => {
    // Written without the catalog, Sami's card holds 18 October's 09:00 outright.
    await sami.post(`/v1/conversations/${samis}/messages`, {
      clientId: uuidv4(),
      kind: 'kit',
      payload: {
        kit: 'appointment',
        fields: { title: 'Urgent', start: { at: '2026-10-18T06:00:00.000Z', hasTime: true } },
      },
    });
    t.clock.set('2026-10-11T06:31:00Z');
    await runDueJobs(t.ctx);
    const all = await cards();
    expect(all).toHaveLength(3);
    expect(at(all[2]!)).toBe('2026-10-25T06:00:00.000Z');
    expect(all[2]!.payload).toMatchObject({ state: 'confirmed', series: { n: 3 } });
    // Said in Lina's own time (London).
    expect(await titles(lina)).toContain(
      'Sun, Oct 18, 7:00 AM couldn’t be booked | Appointment · Physio. That time was taken. The times after it go on.',
    );
  });

  it('ends when what was booked is no longer offered, and says so', async () => {
    await noor.req('PUT', `/v1/orgs/${orgId}/booking`, { booking: HOURS, items: [CLEANING] });
    t.clock.set('2026-10-25T06:31:00Z');
    await runDueJobs(t.ctx);
    expect(await cards()).toHaveLength(3);
    expect(await titles(lina)).toContain(
      'It stopped repeating | Appointment · Physio. It can’t be booked any more. Book again to go on.',
    );
  });

  it('repeats only in a chat or with an organization, and stops from the time ahead', async () => {
    const r = await noor.post('/v1/connections/requests', { toUserId: lina.user.id });
    await lina.post(`/v1/connections/requests/${r.requestId}/accept`, {});
    const group = (
      await noor.post('/v1/conversations', {
        kind: 'group',
        title: 'Three',
        memberIds: [omar.user.id, lina.user.id],
      })
    ).conversation.id;
    const refused = await noor.req('POST', `/v1/conversations/${group}/messages`, {
      clientId: uuidv4(),
      kind: 'kit',
      payload: {
        kit: 'appointment',
        fields: {
          title: 'Weekly',
          start: { at: '2026-11-01T09:00:00.000Z', hasTime: true },
          repeat: 'week',
        },
      },
    });
    expect(refused.statusCode).toBe(400);
    // In a chat, on the sender's own clock; confirmed, then stopped before it starts.
    const chat = (await noor.post('/v1/conversations', { kind: 'direct', userId: lina.user.id }))
      .conversation.id;
    const card = (
      await noor.post(`/v1/conversations/${chat}/messages`, {
        clientId: uuidv4(),
        kind: 'kit',
        payload: {
          kit: 'appointment',
          fields: {
            title: 'Lesson',
            start: { at: '2026-11-01T09:00:00.000Z', hasTime: true },
            repeat: 'week',
          },
        },
      })
    ).message as Card;
    expect(card.payload.series?.zone).toBe('Asia/Dubai');
    await lina.post(`/v1/messages/${card.id}/kit`, { to: 'confirmed' });
    const stopped = await lina.post(`/v1/messages/${card.id}/repeat/stop`, {});
    expect(stopped.message.payload.fields.repeat).toBeUndefined();
    expect(await titles(noor)).toContain('Lina Series: stopped repeating | Appointment · Lesson');
  });
});
