/**
 * Nothing slips (M17 I2): one rule for when an action reminds its owner, whichever way it was
 * made; a wait looked at on the day it was promised and said to be whose; Attention asking about
 * a wait after its day rather than after it was made; a moved day moving the reminder the rule
 * made, never one chosen by hand; what was promised arriving offered as done; a pending card
 * following its edited words and let go once its moment has passed; and every way a wait is
 * brought up saying the same true thing, once.
 */
import { uuidv4, uuidv7 } from '@caime/core';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runDueJobs, runPeriodic } from '../src/lib/jobs';
import { letGoStale } from '../src/lib/suggest';
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
    // Made by hand where it was asked, and nothing from Sami there since (M17 I2).
    expect(await reminderOf(plan.id)).toEqual({
      title: 'The floor plan',
      body: 'No reply from Sami Nasser yet',
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

describe('a card follows its words, and goes once its moment has passed (M17 I2)', () => {
  const cardsOf = async (c: Client, messageId: string) => {
    await t.ctx.flush();
    return ((await c.get(`/v1/suggestions?conversationId=${convo}`)).suggestions as any[]).filter(
      (s) => s.messageId === messageId,
    );
  };
  const statusOfCard = async (id: string) =>
    (
      await t.ctx.db
        .selectFrom('suggestions')
        .select('status')
        .where('id', '=', id)
        .executeTakeFirstOrThrow()
    ).status;
  const write = (c: Client, body: string) =>
    c
      .post(`/v1/conversations/${convo}/messages`, { clientId: uuidv4(), body })
      .then((r) => r.message);

  it('an edit moves a pending card to its new day, and takes away what it no longer says', async () => {
    // Monday 2 November, 10:00 in Cairo.
    t.clock.set('2026-11-02T08:00:00.000Z');
    const m = await write(noor, 'I’ll send you the budget tomorrow');
    const [mine] = await cardsOf(noor, m.id);
    const [theirs] = await cardsOf(sami, m.id);
    expect(mine?.dueText).toMatch(/tomorrow/i);
    expect(theirs?.dueText).toMatch(/tomorrow/i);
    await noor.patch(`/v1/messages/${m.id}`, { body: 'I’ll send you the budget on Thursday' });
    const [mineNow] = await cardsOf(noor, m.id);
    const [theirsNow] = await cardsOf(sami, m.id);
    // The same cards, saying the new day.
    expect(mineNow).toMatchObject({ id: mine.id, dueText: expect.stringMatching(/Thursday/) });
    expect(theirsNow).toMatchObject({ id: theirs.id, dueText: expect.stringMatching(/Thursday/) });
    expect(mineNow.dueAt).not.toBe(mine.dueAt);
    // Words that no longer promise anything: the cards go.
    await noor.patch(`/v1/messages/${m.id}`, { body: 'Lovely to see you today' });
    expect(await cardsOf(noor, m.id)).toEqual([]);
    expect(await cardsOf(sami, m.id)).toEqual([]);
    expect(await statusOfCard(mine.id)).toBe('expired');
  });

  it('an edit leaves a card already answered as it was answered', async () => {
    const m = await write(noor, 'I’ll book the venue tomorrow');
    const [theirs] = await cardsOf(sami, m.id);
    expect(theirs).toBeDefined();
    await sami.post(`/v1/suggestions/${theirs.id}/accept`, {});
    await noor.patch(`/v1/messages/${m.id}`, { body: 'What a day' });
    expect(await statusOfCard(theirs.id)).toBe('accepted');
    expect(await cardsOf(noor, m.id)).toEqual([]);
  });

  it('lets go what nobody answered a week after its day, or a month after it without one', async () => {
    const now = t.clock.now.getTime();
    const card = (kind: string, extra: object) => ({
      id: uuidv7(),
      user_id: noor.user.id,
      kind,
      title: 'Something said',
      rationale: 'Because it was said.',
      confidence: 0.8,
      fingerprint: uuidv7(),
      ...extra,
    });
    const late = card('task', { due_at: new Date(now - 8 * DAY) });
    const recent = card('task', { due_at: new Date(now - 6 * DAY) });
    const old = card('waiting', { created_at: new Date(now - 31 * DAY) });
    const ahead = card('reminder', {
      created_at: new Date(now - 40 * DAY),
      due_at: new Date(now + 20 * DAY),
    });
    const who = card('relationship', { created_at: new Date(now - 40 * DAY) });
    await t.ctx.db.insertInto('suggestions').values([late, recent, old, ahead, who]).execute();
    await letGoStale(t.ctx);
    expect(await statusOfCard(late.id)).toBe('expired');
    expect(await statusOfCard(recent.id)).toBe('pending');
    expect(await statusOfCard(old.id)).toBe('expired');
    // One for a day still ahead waits for it; who someone is to you isn't a moment.
    expect(await statusOfCard(ahead.id)).toBe('pending');
    expect(await statusOfCard(who.id)).toBe('pending');
  });

  it('lets go a “Mark done” as soon as its action is closed by hand', async () => {
    const plan = ((await noor.get('/v1/tasks?view=waiting')).tasks as any[]).find(
      (w) => w.title === 'The floor plan',
    );
    const offer = ((await noor.get('/v1/suggestions')).suggestions as any[]).find(
      (s) => s.kind === 'done' && s.payload.taskId === plan.id,
    );
    expect(offer).toBeDefined();
    await noor.patch(`/v1/tasks/${plan.id}`, { status: 'done' });
    expect(await statusOfCard(offer.id)).toBe('expired');
  });
});

describe('one way a wait is brought up (M17 I2)', () => {
  let omar: Client;
  let rana: Client;
  let line: string;
  let ask: any;
  let invoice: string;
  const connect = async (a: Client, b: Client, aSeesB?: object) => {
    const r = await a.post('/v1/connections/requests', {
      toUserId: b.user.id,
      relationship: aSeesB,
    });
    return (await b.post(`/v1/connections/requests/${r.requestId}/accept`, {}))
      .conversationId as string;
  };
  const write = (c: Client, conversationId: string, body: string, extra: object = {}) =>
    c
      .post(`/v1/conversations/${conversationId}/messages`, { clientId: uuidv4(), body, ...extra })
      .then((r) => r.message);
  const told = async (c: Client, kind: string) =>
    t.ctx.db
      .selectFrom('notifications')
      .select(['title', 'body', 'data'])
      .where('user_id', '=', c.user.id)
      .where('kind', '=', kind)
      .orderBy('created_at')
      .execute();
  /** The wait their ask was offered as, taken. */
  const waitFrom = async (c: Client, messageId: string) => {
    await t.ctx.flush();
    const card = ((await c.get('/v1/suggestions')).suggestions as any[]).find(
      (s) => s.messageId === messageId && s.kind === 'waiting',
    );
    expect(card).toBeDefined();
    return (await c.post(`/v1/suggestions/${card.id}/accept`, {})).accepted.id as string;
  };
  const offerFor = (taskId: string) =>
    t.ctx.db
      .selectFrom('messages')
      .select('body')
      .where(sql<boolean>`payload->'followUp'->>'taskId' = ${taskId}`)
      .execute();

  beforeAll(async () => {
    omar = await signup(t, { displayName: 'Omar Saleh', timeZone: 'Africa/Cairo' });
    rana = await signup(t, { displayName: 'Rana Aziz', timeZone: 'Africa/Cairo' });
    line = await connect(noor, omar, { sphere: 'vendor', role: 'delivery_provider' });
  });

  it('an ask that became a wait is brought up once, on its day, as it stands', async () => {
    // Wednesday 4 November, 09:00 in Cairo.
    t.clock.set('2026-11-04T07:00:00.000Z');
    ask = await write(noor, line, 'Can you send me the invoice by Monday?');
    invoice = await waitFrom(noor, ask.id);
    // The vendor rule's two days pass: no "No reply" push, and the chat doesn't ask it either;
    // the wait brings it up on Monday.
    t.clock.set('2026-11-06T08:00:00.000Z');
    await runDueJobs(t.ctx);
    expect(await told(noor, 'follow_up')).toEqual([]);
    await t.ctx.flush();
    const all = ((await noor.get('/v1/inbox')).sections as any[]).flatMap((s) => s.items);
    const chat = all.find((i: any) => i.id === line);
    expect(chat.reasons.map((r: any) => r.code)).not.toContain('follow_up_due');
    // Monday at five in Cairo: nothing from Omar since.
    t.clock.set('2026-11-09T15:01:00.000Z');
    await runPeriodic(t.ctx);
    expect(await reminderOf(invoice)).toEqual({
      title: expect.any(String),
      body: 'No reply from Omar Saleh yet',
    });
  });

  it('says only that it waits once they wrote since, and Cai offers in the same words', async () => {
    const receipts = await add(noor, {
      title: 'The receipts',
      assigneeId: omar.user.id,
      conversationId: line,
      dueAt: '2026-11-10T08:00:00.000Z',
    });
    await noor.patch(`/v1/tasks/${receipts.id}`, { caiFollowUp: true });
    t.clock.advance(60_000);
    await write(omar, line, 'Working on it');
    // Tuesday at five in Cairo.
    t.clock.set('2026-11-10T15:01:00.000Z');
    await runPeriodic(t.ctx);
    await t.ctx.flush();
    expect((await offerFor(receipts.id)).map((m) => m.body)).toEqual([
      'Still waiting on Omar Saleh for “The receipts”. Shall I send this?\n\nHi Omar, any news on “The receipts”?',
    ]);
  });

  it('asks to mark done what arrived, rather than whether it’s still awaited', async () => {
    await write(omar, line, 'Here it is', { replyToId: ask.id });
    await t.ctx.flush();
    await noor.patch(`/v1/tasks/${invoice}`, {
      remindAt: new Date(t.clock.now.getTime() + 3_600_000).toISOString(),
      caiFollowUp: true,
    });
    t.clock.advance(2 * 3_600_000);
    await runPeriodic(t.ctx);
    await t.ctx.flush();
    const rung = (await told(noor, 'reminder')).filter(
      (n) => (n.data as { taskId?: string }).taskId === invoice,
    );
    expect(rung.map((n) => n.body)).toContain('Omar Saleh sent something. Is it done?');
    // Cai offers no follow-up for what arrived.
    expect(await offerFor(invoice)).toEqual([]);
  });

  it('Attention asks only about what hasn’t arrived, in words that are true', async () => {
    const both = await connect(rana, omar);
    // Wednesday 11 November.
    t.clock.set('2026-11-11T08:00:00.000Z');
    const first = await write(rana, both, 'Could you send the contract by Thursday?');
    const contract = await waitFrom(rana, first.id);
    t.clock.advance(60_000);
    await write(omar, both, 'Here it is', { replyToId: first.id });
    t.clock.advance(60_000);
    const second = await write(rana, both, 'Could you send the deposit receipt by Thursday?');
    const deposit = await waitFrom(rana, second.id);
    await t.ctx.flush();
    // Three days past Thursday: the contract arrived, so it's the receipt Cai asks about.
    t.clock.set('2026-11-16T09:00:00.000Z');
    const asked = (await rana.get('/v1/attention')).ask;
    expect(asked).toMatchObject({ taskId: deposit, state: 'unanswered', since: second.createdAt });
    expect(asked.taskId).not.toBe(contract);
    // Omar writes: Cai no longer says nothing came from him.
    t.clock.advance(60_000);
    await write(omar, both, 'Sure');
    expect((await rana.get('/v1/attention')).ask).toMatchObject({
      taskId: deposit,
      state: 'waiting',
    });
  });
});
