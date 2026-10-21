/**
 * Nothing slips (M17 I2): one rule for when an action reminds its owner, whichever way it was
 * made; a wait looked at on the day it was promised and said to be whose; Attention asking about
 * a wait after its day rather than after it was made; a moved day moving the reminder the rule
 * made, never one chosen by hand.
 */
import { uuidv4 } from '@caime/core';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runPeriodic } from '../src/lib/jobs';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let noor: Client;
let sami: Client;
let convo: string;
const DAY = 86_400_000;

beforeAll(async () => {
  t = await createTestApp();
  // Wednesday 21 October 2026, 10:00 in Cairo (UTC+3 until the 29th).
  t.clock.set('2026-10-21T07:00:00.000Z');
  noor = await signup(t, { displayName: 'Noor Haddad', timeZone: 'Africa/Cairo' });
  sami = await signup(t, { displayName: 'Sami Nasser', timeZone: 'Africa/Cairo' });
  const r = await noor.post('/v1/connections/requests', { toUserId: sami.user.id });
  convo = (await sami.post(`/v1/connections/requests/${r.requestId}/accept`, {})).conversationId;
});
afterAll(async () => {
  await t.close();
});

const add = async (c: Client, body: object) => (await c.post('/v1/tasks', body)).task;
const reminderOf = async (taskId: string) =>
  t.ctx.db
    .selectFrom('notifications')
    .select(['title', 'body'])
    .where('kind', '=', 'reminder')
    .where(sql<boolean>`data->>'taskId' = ${taskId}`)
    .executeTakeFirst();

describe('when an action reminds its owner (M17 I2)', () => {
  it('rings one of their own the morning of its day, or an hour before an early hour', async () => {
    // "By 3pm Thursday": Thursday at nine, not at three.
    const deck = await add(noor, {
      title: 'Send the deck',
      dueAt: '2026-10-22T12:00:00.000Z',
      dueHasTime: true,
    });
    expect(deck.remindAt).toBe('2026-10-22T06:00:00.000Z');
    // "By 9:30 Thursday": an hour before.
    const bank = await add(noor, {
      title: 'Call the bank',
      dueAt: '2026-10-22T06:30:00.000Z',
      dueHasTime: true,
    });
    expect(bank.remindAt).toBe('2026-10-22T05:30:00.000Z');
    // Their morning brief's hour is their morning.
    await noor.patch('/v1/me', { preferences: { caiBrief: '07:30' } });
    const forms = await add(noor, { title: 'Send the forms', dueAt: '2026-10-23T06:00:00.000Z' });
    expect(forms.remindAt).toBe('2026-10-23T04:30:00.000Z');
    await noor.patch('/v1/me', { preferences: { caiBrief: null } });
    // Told never to, it doesn't; with no day, nothing rings.
    const quiet = await add(noor, {
      title: 'Quiet one',
      dueAt: '2026-10-22T12:00:00.000Z',
      dueHasTime: true,
      remindAt: null,
    });
    expect(quiet.remindAt).toBeNull();
    expect((await add(noor, { title: 'Some day' })).remindAt).toBeNull();
  });

  it('looks at a wait at the end of the day it was promised, and says whose it is', async () => {
    const plan = await add(noor, {
      title: 'The floor plan',
      assigneeId: sami.user.id,
      conversationId: convo,
      dueAt: '2026-10-22T06:00:00.000Z',
    });
    // Thursday at five in Cairo.
    expect(plan.remindAt).toBe('2026-10-22T14:00:00.000Z');
    t.clock.set('2026-10-22T14:01:00.000Z');
    await runPeriodic(t.ctx);
    expect(await reminderOf(plan.id)).toEqual({
      title: 'The floor plan',
      body: 'Sami Nasser said it would be done by now',
    });
    // Asked to do less unasked (R66), a wait doesn't ring.
    await noor.patch('/v1/me', { preferences: { caiInitiative: 'less' } });
    const less = await add(noor, {
      title: 'The invoice',
      assigneeId: sami.user.id,
      dueAt: '2026-10-23T06:00:00.000Z',
    });
    expect(less.remindAt).toBeNull();
    await noor.patch('/v1/me', { preferences: { caiInitiative: 'usual' } });
  });

  it('moves the reminder it made when the day moves, and keeps one chosen by hand', async () => {
    // Thursday 22nd, 17:01 in Cairo.
    const flights = await add(noor, { title: 'Book flights', dueAt: '2026-10-23T06:00:00.000Z' });
    expect(flights.remindAt).toBe('2026-10-23T06:00:00.000Z');
    const later = await noor.patch(`/v1/tasks/${flights.id}`, {
      dueAt: '2026-10-26T06:00:00.000Z',
    });
    expect(later.task.remindAt).toBe('2026-10-26T06:00:00.000Z');
    const passport = await add(noor, {
      title: 'Renew the passport',
      dueAt: '2026-10-23T06:00:00.000Z',
      remindAt: '2026-10-22T18:00:00.000Z',
    });
    const kept = await noor.patch(`/v1/tasks/${passport.id}`, {
      dueAt: '2026-10-27T06:00:00.000Z',
    });
    expect(kept.task.remindAt).toBe('2026-10-22T18:00:00.000Z');
  });

  it('asks on Attention about a wait gone quiet after its day, not after it was made', async () => {
    const lina = await signup(t, { displayName: 'Lina Farah', timeZone: 'Africa/Cairo' });
    const r = await lina.post('/v1/connections/requests', { toUserId: sami.user.id });
    await sami.post(`/v1/connections/requests/${r.requestId}/accept`, {});
    const asked = t.clock.now.getTime();
    const report = await add(lina, {
      title: 'The audit report',
      assigneeId: sami.user.id,
      dueAt: new Date(asked + 5 * DAY).toISOString(),
    });
    // Three quiet days after it was made, but its day hasn't come: nothing to ask.
    t.clock.set(new Date(asked + 3 * DAY + 60_000).toISOString());
    expect((await lina.get('/v1/attention')).ask).toBeNull();
    // Three days past its day: asked about.
    t.clock.set(new Date(asked + 8 * DAY + 60_000).toISOString());
    expect((await lina.get('/v1/attention')).ask).toMatchObject({ taskId: report.id });
  });
});

describe('what was promised arrives (M17 I2b)', () => {
  const say = (c: Client, body: string) =>
    c.post(`/v1/conversations/${convo}/messages`, { clientId: uuidv4(), body });
  const statusOf = async (id: string) =>
    (
      await t.ctx.db
        .selectFrom('tasks')
        .select('status')
        .where('id', '=', id)
        .executeTakeFirstOrThrow()
    ).status;
  const offers = async (c: Client) => {
    await t.ctx.flush();
    return ((await c.get('/v1/suggestions')).suggestions as any[]).filter((s) => s.kind === 'done');
  };

  it('offers whoever waits on it to mark it done, never closing it, and takes it back on undo', async () => {
    const waits = (await noor.get('/v1/tasks?view=waiting')).tasks as any[];
    const plan = waits.find((w) => w.title === 'The floor plan');
    expect(plan).toBeDefined();
    // Asked whether it's here, nothing is offered.
    await say(sami, 'Is the floor plan done?');
    expect(await offers(noor)).toEqual([]);
    // Sami says it's here: Noor is offered to mark it done; it stays open until she does.
    await say(sami, 'Here it is, the final version.');
    const [offer] = await offers(noor);
    expect(offer).toMatchObject({
      title: 'The floor plan',
      rationale: 'Sami Nasser wrote “Here it is, the final version.”',
      payload: { taskId: plan.id },
      subjectUserId: sami.user.id,
    });
    expect(await statusOf(plan.id)).toBe('open');
    // Nobody else is offered it.
    expect(await offers(sami)).toEqual([]);
    await noor.post(`/v1/suggestions/${offer.id}/accept`, {});
    expect(await statusOf(plan.id)).toBe('done');
    // Taken back, it's open again and offered again.
    await noor.post(`/v1/suggestions/${offer.id}/undo`, {});
    expect(await statusOf(plan.id)).toBe('open');
    expect((await offers(noor)).map((s) => s.id)).toEqual([offer.id]);
  });

  it('offers one’s own promise done when a link to it is sent', async () => {
    const minutes = await add(noor, { title: 'Send the minutes', conversationId: convo });
    t.clock.advance(60_000);
    await say(noor, 'https://example.com/minutes-october');
    const mine = (await offers(noor)).find((s) => s.payload.taskId === minutes.id);
    expect(mine).toMatchObject({
      title: 'Send the minutes',
      rationale: 'You wrote “https://example.com/minutes-october”',
    });
  });
});
