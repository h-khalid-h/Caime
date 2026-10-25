/**
 * A calendar-aware Cai (M17 I7): "when am I free" answered from the person's own day (their
 * agreed meetings, their connected calendar's busy times, the hours that count as their day on
 * their clock), a meeting Cai prepares warned of what already holds that time, with the next free
 * time offered beside it and sent at that time on their tap.
 */
import { CAI_ID, uuidv4 } from '@caime/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runDueJobs } from '../src/lib/jobs';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let hassan: Client;
let sarah: Client;
let chat: string;
let cai: string;

const send = (c: Client, conversationId: string, body: string) =>
  c.post(`/v1/conversations/${conversationId}/messages`, { clientId: uuidv4(), body });
const messages = async (c: Client, conversationId: string) =>
  (await c.get(`/v1/conversations/${conversationId}/messages`)).messages as any[];
async function ask(body: string) {
  await send(hassan, cai, body);
  await t.ctx.flush();
  t.clock.advance(1000);
  await runDueJobs(t.ctx);
  await t.ctx.flush();
  return (await messages(hassan, cai)).at(-1);
}
const card = async (from: Client, title: string, at: string, minutes: number) =>
  (
    await from.post(`/v1/conversations/${chat}/messages`, {
      clientId: uuidv4(),
      kind: 'kit',
      payload: {
        kit: 'meeting',
        fields: { title, start: { at, hasTime: true }, durationMinutes: minutes },
      },
    })
  ).message as { id: string };

beforeAll(async () => {
  t = await createTestApp();
  // Tuesday 20 October 2026; Cairo is UTC+3 until the 29th.
  t.clock.set('2026-10-20T07:00:00Z');
  hassan = await signup(t, {
    displayName: 'Hassan Khalid',
    timeZone: 'Africa/Cairo',
    country: 'EG',
  });
  sarah = await signup(t, { displayName: 'Sarah Smith', timeZone: 'Africa/Cairo' });
  const r = await hassan.post('/v1/connections/requests', { toUserId: sarah.user.id });
  chat = (await sarah.post(`/v1/connections/requests/${r.requestId}/accept`, {})).conversationId;
  cai = (await hassan.post('/v1/conversations', { kind: 'direct', userId: CAI_ID })).conversation
    .id;
  // Wednesday: an agreed review 11:00–12:00, a call still asked at 15:00, and his Google calendar
  // busy 13:00–14:00 (Cairo).
  const review = await card(sarah, 'Budget review', '2026-10-21T08:00:00.000Z', 60);
  await hassan.post(`/v1/messages/${review.id}/kit`, { to: 'accepted' });
  await card(sarah, 'Venue call', '2026-10-21T12:00:00.000Z', 30);
  const account = uuidv4();
  await t.ctx.db
    .insertInto('connected_accounts')
    .values({
      id: account,
      user_id: hassan.user.id,
      provider: 'google',
      subject: `g-${account}`,
      email: 'hassan@gmail.test',
      uses: ['calendar'],
      scopes: [],
      refresh_sealed: Buffer.from('sealed'),
      state: 'connected',
      // Read just now, so nothing asks Google again.
      synced_at: t.clock.now,
    })
    .execute();
  await t.ctx.db
    .insertInto('external_busy')
    .values({
      account_id: account,
      user_id: hassan.user.id,
      start_at: new Date('2026-10-21T10:00:00Z'),
      end_at: new Date('2026-10-21T11:00:00Z'),
    })
    .execute();
  await t.ctx.flush();
});
afterAll(async () => {
  await t.close();
});

describe('a calendar-aware Cai (M17 I7)', () => {
  it('says when a day is free, what holds the rest, and what is only asked', async () => {
    expect((await ask('when am I free tomorrow?')).body).toBe(
      'Tomorrow: you’re free 9:00 AM–11:00 AM, 12:00 PM–1:00 PM, 2:00 PM–6:00 PM. ' +
        'Busy: 11:00 AM–12:00 PM · Budget review, 1:00 PM–2:00 PM · Busy in your calendar. ' +
        'Asked, not yet agreed: 3:00 PM–3:30 PM · Venue call.',
    );
  });

  it('answers for an hour: taken, with the next free time, or free until what comes next', async () => {
    expect((await ask('am I free tomorrow at 11?')).body).toBe(
      'Tomorrow 11:00 AM is taken: 11:00 AM–12:00 PM · Budget review. The next free time that day: 12:00 PM.',
    );
    expect((await ask('Am I free tomorrow at 4pm?')).body).toBe(
      'Tomorrow 4:00 PM is free, until 6:00 PM.',
    );
  });

  it('says a day off is one, and in the language asked', async () => {
    // Friday is Egypt's weekend.
    expect((await ask('when am I free on Friday?')).body).toBe(
      'Friday, October 23 isn’t one of your working days. Nothing is planned.',
    );
    expect((await ask('امتى أنا فاضي بكرة؟')).body).toMatch(/^غدًا: /);
  });

  it('says how many are coming up this week, however few it lists', async () => {
    for (let i = 1; i <= 6; i += 1)
      await hassan.post('/v1/tasks', {
        title: `Errand ${i}`,
        assigneeId: hassan.user.id,
        dueAt: `2026-10-2${i}T15:00:00.000Z`,
        dueHasTime: true,
      });
    const said = (await ask('what is coming up?')).body as string;
    const lines = said.split('\n');
    // The agreed review and six errands: five listed, the count of the rest said.
    expect(lines[0]).toBe('Coming up this week:');
    expect(lines.filter((l) => l.startsWith('• '))).toHaveLength(5);
    expect(lines.at(-1)).toBe('And 2 more in Actions.');
  });

  it('warns of a clash on a meeting it prepares, and sends it at the free time on that tap', async () => {
    const line = await ask('set up a meeting with Sarah tomorrow at 11');
    expect(line.body).toBe(
      'Here’s a meeting for you and Sarah Smith: Tomorrow 11:00 AM, on Caime. Shall I send it?\n\n' +
        'You have Budget review then; 12:00 PM is free that day.',
    );
    expect(line.payload.offer.meeting).toMatchObject({
      at: '2026-10-21T08:00:00.000Z',
      instead: '2026-10-21T09:00:00.000Z',
    });
    const sent = await hassan.post(`/v1/messages/${line.id}/offer`, { instead: true });
    const meeting = (await messages(sarah, chat)).find((m) => m.id === sent.messageId);
    expect(meeting.payload.fields.start).toEqual({ at: '2026-10-21T09:00:00.000Z', hasTime: true });
    // The offer says it went, at the time it went.
    const done = (await messages(hassan, cai)).find((m) => m.id === line.id);
    expect(done.payload.offer).toMatchObject({
      doneId: sent.messageId,
      meeting: { at: '2026-10-21T09:00:00.000Z' },
    });
    // No free time offered, none taken.
    const clear = await ask('set up a meeting with Sarah tomorrow at 4pm');
    expect(clear.payload.offer.meeting.instead).toBeUndefined();
    const refused = await hassan.req('POST', `/v1/messages/${clear.id}/offer`, { instead: true });
    expect([refused.statusCode, refused.json().error.code]).toEqual([400, 'invalid_request']);
  });

  it('moves a meeting it is asked to, as another time suggested, on that tap alone (I7b)', async () => {
    const review = (await messages(sarah, chat)).find(
      (m) => m.payload?.fields?.title === 'Budget review',
    );
    const line = await ask('move my 11am to Thursday');
    expect(line.body).toBe(
      'Shall I suggest Thu 11:00 AM for “Budget review”, in place of Tomorrow 11:00 AM? Sarah Smith will be asked to agree.',
    );
    expect(line.payload.offer).toMatchObject({
      kind: 'move',
      conversationId: chat,
      move: {
        messageId: review.id,
        from: '2026-10-21T08:00:00.000Z',
        at: '2026-10-22T08:00:00.000Z',
        name: 'Sarah Smith',
      },
    });
    // Nothing moves until the tap; the tap suggests it as the card's own "another time" does.
    expect(
      (await messages(sarah, chat)).find((m) => m.id === review.id).payload.fields.start.at,
    ).toBe('2026-10-21T08:00:00.000Z');
    const done = await hassan.post(`/v1/messages/${line.id}/offer`, {});
    expect(done).toEqual({ conversationId: chat, messageId: review.id });
    const moved = (await messages(sarah, chat)).find((m) => m.id === review.id);
    expect(moved.payload.fields.start).toEqual({ at: '2026-10-22T08:00:00.000Z', hasTime: true });
    expect(moved.payload.proposedBy).toBe(hassan.user.id);
    // Twice is once.
    expect(await hassan.post(`/v1/messages/${line.id}/offer`, {})).toEqual(done);
    expect((await messages(hassan, cai)).find((m) => m.id === line.id).payload.offer.doneId).toBe(
      review.id,
    );

    // Several with Sarah: Cai asks which, and the number answered moves that one, at its own hour.
    const which = await ask('move my meeting with Sarah to Friday');
    expect(which.body.split('\n')).toEqual([
      'Which one do you mean?',
      '1. Tomorrow 12:00 PM · Meeting',
      '2. Tomorrow 3:00 PM · Venue call',
      '3. Thu 11:00 AM · Budget review',
    ]);
    const venue = await ask('2');
    expect(venue.payload.offer.move).toMatchObject({
      title: 'Venue call',
      at: '2026-10-23T12:00:00.000Z',
    });

    // Without a time to move to, it asks for one; nothing at an hour, it says so.
    expect((await ask('reschedule the venue call')).body).toBe(
      'When should “Venue call” move to? A day or a time, like “tomorrow at 3”.',
    );
    expect((await ask('move my 4pm to tomorrow')).body).toBe(
      'I can’t find that among your meetings and appointments in the next two weeks.',
    );
  });
});
