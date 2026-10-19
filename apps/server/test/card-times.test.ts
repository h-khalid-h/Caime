/**
 * Another time for a meeting or an appointment (M16 F5): either side suggests it on the card,
 * which asks the other side where it stands, says so in a line that needs them, and keeps a
 * meeting's guests' calendars in step: asked again for the new time, told when it's called off.
 */
import { uuidv4 } from '@caime/core';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { memoryMailer } from '../src/lib/email';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let mail: ReturnType<typeof memoryMailer>;
let ana: Client;
let ben: Client;
let cleo: Client;
let convo: string;

beforeAll(async () => {
  mail = memoryMailer();
  t = await createTestApp({}, { mail });
  t.clock.set('2026-10-20T08:00:00Z');
  ana = await signup(t, { displayName: 'Ana Host' });
  ben = await signup(t, { displayName: 'Ben Host' });
  cleo = await signup(t, { displayName: 'Cleo Else' });
  const r = await ana.post('/v1/connections/requests', {
    toUserId: ben.user.id,
    relationship: { sphere: 'work', role: 'colleague' },
  });
  await ben.post(`/v1/connections/requests/${r.requestId}/accept`, {});
  convo = (await ana.post('/v1/conversations', { kind: 'direct', userId: ben.user.id }))
    .conversation.id;
});
afterAll(async () => {
  await t.close();
});

const at = (iso: string) => ({ at: iso, hasTime: true });
/** A card Ana sends; Ben agrees to it unless asked not to. */
const card = async (kit: string, fields: Record<string, unknown>, agree = true) => {
  const sent = (
    await ana.post(`/v1/conversations/${convo}/messages`, {
      clientId: uuidv4(),
      kind: 'kit',
      payload: { kit, fields },
    })
  ).message as { id: string };
  if (agree)
    await ben.post(`/v1/messages/${sent.id}/kit`, {
      to: kit === 'appointment' ? 'confirmed' : 'accepted',
    });
  return sent;
};
const retime = (c: Client, id: string, iso: string) =>
  c.req('POST', `/v1/messages/${id}/time`, { start: at(iso) });
const read = (id: string) =>
  t.ctx.db
    .selectFrom('messages')
    .select(['payload', 'card_start_at', 'is_request', 'conversation_id'])
    .where('id', '=', id)
    .executeTakeFirstOrThrow();
/** The lines that said another time was suggested for this card, newest first. */
const linesFor = (cardId: string) =>
  t.ctx.db
    .selectFrom('messages')
    .select(['id', 'sender_id', 'is_request', 'payload'])
    .where('kind', '=', 'system')
    .where(sql<boolean>`payload->>'event' = 'time_suggested'`)
    .where(sql<boolean>`payload->>'messageId' = ${cardId}`)
    .orderBy('seq', 'desc')
    .execute();
const sectionOf = async (c: Client, id: string) =>
  (
    (await c.get('/v1/inbox?view=all')).conversations as Array<{ id: string; section: string }>
  ).find((x) => x.id === id)?.section;

describe('another time for a meeting or an appointment (M16 F5)', () => {
  it('either side moves an agreed meeting, which asks the other side again, and says so', async () => {
    const m = await card('meeting', {
      title: 'Plan the launch',
      start: at('2026-10-22T09:00:00.000Z'),
      durationMinutes: 30,
    });
    const res = await retime(ben, m.id, '2026-10-23T14:00:00.000Z');
    expect(res.statusCode).toBe(200);
    const moved = await read(m.id);
    expect(moved.payload).toMatchObject({
      state: 'proposed',
      proposedBy: ben.user.id,
      sequence: 1,
      fields: { start: { at: '2026-10-23T14:00:00.000Z' }, durationMinutes: 30 },
    });
    expect(moved.card_start_at?.toISOString()).toBe('2026-10-23T14:00:00.000Z');
    expect(moved.is_request).toBe(true);
    // A line says so, from Ben, and it needs Ana: her inbox says so, and she's told.
    const [line] = await linesFor(m.id);
    expect(line).toMatchObject({ sender_id: ben.user.id, is_request: true });
    expect(await sectionOf(ana, convo)).toBe('needs_you');
    await t.ctx.flush();
    // It asks her, so it reaches her as something to answer, not as news of a move.
    const told = (await ana.get('/v1/notifications')).notifications as Array<{
      title: string;
      level: string;
    }>;
    expect(told.find((n) => n.title === 'Ben Host: New time')?.level).toBe('attention');
    // It's Ana's to answer now: Ben can only take his suggestion back.
    expect((await ben.req('POST', `/v1/messages/${m.id}/kit`, { to: 'accepted' })).statusCode).toBe(
      403,
    );
    expect((await ana.req('POST', `/v1/messages/${m.id}/kit`, { to: 'accepted' })).statusCode).toBe(
      200,
    );
    expect((await read(m.id)).payload).toMatchObject({ state: 'accepted' });
    // Answered: the line asks nobody any more.
    expect((await linesFor(m.id))[0]?.is_request).toBe(false);
    expect(await sectionOf(ana, convo)).not.toBe('needs_you');
    // And Ana may move it again: each new time asks the other side, one line each.
    expect((await retime(ana, m.id, '2026-10-24T10:00:00.000Z')).statusCode).toBe(200);
    expect((await read(m.id)).payload).toMatchObject({ proposedBy: ana.user.id, sequence: 2 });
    const lines = await linesFor(m.id);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ sender_id: ana.user.id, is_request: true });
    expect(await sectionOf(ben, convo)).toBe('needs_you');
    // Ben turns the new time down; the suggestion stands answered.
    expect((await ben.req('POST', `/v1/messages/${m.id}/kit`, { to: 'declined' })).statusCode).toBe(
      200,
    );
    expect((await linesFor(m.id))[0]?.is_request).toBe(false);
  });

  it('moves an appointment the same way, never to a time already over', async () => {
    const a = await card('appointment', {
      title: 'Cleaning',
      start: at('2026-10-25T09:00:00.000Z'),
    });
    expect((await read(a.id)).payload).toMatchObject({ state: 'confirmed' });
    const over = await retime(ana, a.id, '2026-10-19T09:00:00.000Z');
    expect(over.statusCode).toBe(400);
    expect(over.json().error.message).toBe('That time has passed. Choose a later one.');
    expect((await retime(ana, a.id, '2026-10-26T11:00:00.000Z')).statusCode).toBe(200);
    expect((await read(a.id)).payload).toMatchObject({
      state: 'requested',
      proposedBy: ana.user.id,
    });
    expect(
      (await ben.req('POST', `/v1/messages/${a.id}/kit`, { to: 'confirmed' })).statusCode,
    ).toBe(200);
  });

  it('refuses what keeps its own time, and anyone not in the conversation', async () => {
    const series = await card('meeting', {
      title: 'Weekly',
      start: at('2026-10-22T09:00:00.000Z'),
      repeat: 'week',
    });
    const refused = await retime(ana, series.id, '2026-10-22T11:00:00.000Z');
    expect(refused.statusCode).toBe(400);
    expect(refused.json().error.message).toBe(
      'Each time of a series keeps its own: cancel this one and send another.',
    );
    // Someone's calendar invitation (F4) is theirs to move; a booking keeps its catalog's time.
    const theirs = await card('meeting', {
      title: 'Theirs',
      start: at('2026-10-22T09:00:00.000Z'),
    });
    const booked = await card('appointment', {
      title: 'Booked',
      start: at('2026-10-22T09:00:00.000Z'),
    });
    for (const [id, extra] of [
      [theirs.id, { invitation: { uid: 'x@google.com', sequence: 0 } }],
      [booked.id, { booking: { itemId: 'x', name: 'Cleaning' } }],
    ] as const)
      await t.ctx.db
        .updateTable('messages')
        .set({ payload: sql`payload || ${JSON.stringify(extra)}::jsonb` })
        .where('id', '=', id)
        .execute();
    expect((await retime(ben, theirs.id, '2026-10-22T11:00:00.000Z')).json().error.message).toBe(
      'It’s their calendar’s meeting: only they can move it.',
    );
    expect((await retime(ben, booked.id, '2026-10-22T11:00:00.000Z')).json().error.message).toBe(
      'A booking keeps its open time: cancel it and book another.',
    );
    // Not a card that has a time at all, and someone who isn't in the conversation.
    const text = (
      await ana.post(`/v1/conversations/${convo}/messages`, {
        clientId: uuidv4(),
        kind: 'text',
        body: 'See you then',
      })
    ).message as { id: string };
    expect((await retime(ana, text.id, '2026-10-22T11:00:00.000Z')).statusCode).toBe(400);
    const plain = await card('meeting', { title: 'Coffee', start: at('2026-10-22T09:00:00.000Z') });
    expect([403, 404]).toContain(
      (await retime(cleo, plain.id, '2026-10-22T11:00:00.000Z')).statusCode,
    );
  });

  it('asks a meeting’s guests again for its new time, and tells them when it’s called off', async () => {
    const m = await card('meeting', {
      title: 'Launch review',
      start: at('2026-10-27T09:00:00.000Z'),
      durationMinutes: 30,
    });
    const { space } = await ana.post(`/v1/messages/${m.id}/guests`, {
      email: 'gus@example.com',
      name: 'Gus Guest',
    });
    await t.ctx.flush();
    const first = mail.outbox.at(-1)!;
    expect(first.icalEvent?.content.replace(/\r\n /g, '')).toContain('SEQUENCE:0');
    const firstLink = /\/j\/(cmg_[A-Za-z0-9_-]+)/.exec(first.text)?.[1];
    // The card that moved to the space keeps no time of its own: the copy there is the one.
    expect((await retime(ana, m.id, '2026-10-28T09:00:00.000Z')).json().error.message).toBe(
      'It has its own space now: suggest another time there.',
    );
    // Gus answered yes to the first time; the new one asks him again.
    await t.ctx.db
      .updateTable('meeting_guests')
      .set({ answer: 'accepted', answered_at: t.ctx.now() })
      .where('space_message_id', '=', space.messageId)
      .execute();
    expect((await retime(ana, space.messageId, '2026-10-28T09:00:00.000Z')).statusCode).toBe(200);
    await t.ctx.flush();
    const again = mail.outbox.at(-1)!;
    expect(again).toMatchObject({ to: 'gus@example.com', subject: 'Invitation: Launch review' });
    const ics = again.icalEvent!.content.replace(/\r\n /g, '');
    expect(ics).toContain('METHOD:REQUEST');
    expect(ics).toContain('SEQUENCE:1');
    expect(ics).toContain('DTSTART:20261028T090000Z');
    expect(ics).toContain(`UID:meeting-${space.messageId}@caime`);
    // A new link of his own, the old one ended, and what he said was of the time before.
    const link = /\/j\/(cmg_[A-Za-z0-9_-]+)/.exec(again.text)?.[1];
    expect(link).toBeTruthy();
    expect(link).not.toBe(firstLink);
    const guest = await t.ctx.db
      .selectFrom('meeting_guests')
      .select(['answer'])
      .where('space_message_id', '=', space.messageId)
      .executeTakeFirstOrThrow();
    expect(guest.answer).toBeNull();
    // Called off: the cancellation, one sequence past the last time he was sent.
    await ben.post(`/v1/messages/${space.messageId}/kit`, { to: 'accepted' });
    await ana.post(`/v1/messages/${space.messageId}/kit`, { to: 'cancelled' });
    await t.ctx.flush();
    const off = mail.outbox.at(-1)!;
    expect(off).toMatchObject({ to: 'gus@example.com', subject: 'Cancelled: Launch review' });
    expect(off.icalEvent?.method).toBe('CANCEL');
    const cancel = off.icalEvent!.content.replace(/\r\n /g, '');
    expect(cancel).toContain('METHOD:CANCEL');
    expect(cancel).toContain('SEQUENCE:2');
    expect(cancel).toContain(`UID:meeting-${space.messageId}@caime`);
  });
});
