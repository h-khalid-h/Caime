/**
 * A meeting or an appointment keeps the clock it was set on (R119, M17 I19c): its start is kept
 * with the sender's zone and the wall-clock minute there, never a device's own, kept on a new time
 * suggested from anywhere, and moved back to that minute when the zone's rules say it now falls at
 * another instant (a card written before Egypt's rules changed is the case this stands for).
 */
import { uuidv4 } from '@caime/core';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { rezoneCards } from '../src/lib/card-zones';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let hassan: Client;
let sarah: Client;
let convo: string;

beforeAll(async () => {
  t = await createTestApp();
  t.clock.set('2026-10-25T08:00:00Z');
  hassan = await signup(t, { displayName: 'Hassan Khalid', timeZone: 'Africa/Cairo' });
  sarah = await signup(t, { displayName: 'Sarah Chen', timeZone: 'Europe/London' });
  const r = await hassan.post('/v1/connections/requests', {
    toUserId: sarah.user.id,
    relationship: { sphere: 'work', role: 'manager' },
  });
  await sarah.post(`/v1/connections/requests/${r.requestId}/accept`, {});
  convo = (await hassan.post('/v1/conversations', { kind: 'direct', userId: sarah.user.id }))
    .conversation.id;
});
afterAll(() => t.close());

const meeting = async (at: string, extra: Record<string, unknown> = {}) =>
  (
    await hassan.post(`/v1/conversations/${convo}/messages`, {
      clientId: uuidv4(),
      kind: 'kit',
      payload: {
        kit: 'meeting',
        fields: { title: 'Planning', start: { at, hasTime: true, ...extra }, durationMinutes: 30 },
      },
    })
  ).message;

const stored = (id: string) =>
  t.ctx.db
    .selectFrom('messages')
    .select(['payload', 'card_start_at'])
    .where('id', '=', id)
    .executeTakeFirstOrThrow();

/** As a card written before its zone's rules changed: the clock the same, the instant an hour off. */
async function keptUnderOldRules(id: string, at: string) {
  await sql`update messages
     set payload = jsonb_set(payload, '{fields,start,at}', to_jsonb(${at}::text)),
         card_start_at = ${at}::timestamptz
   where id = ${id}`.execute(t.ctx.db);
}

describe('a card on its own clock (M17 I19c)', () => {
  it('keeps the sender’s zone and the minute there, never a device’s own', async () => {
    // 10:00 in Cairo on 2 November (winter, UTC+2), sent with a zone the device made up.
    const card = await meeting('2026-11-02T08:00:00.000Z', {
      zone: 'Pacific/Kiritimati',
      local: '2026-11-03T22:00',
    });
    expect(card.payload.fields.start).toEqual({
      at: '2026-11-02T08:00:00.000Z',
      hasTime: true,
      zone: 'Africa/Cairo',
      local: '2026-11-02T10:00',
    });
  });

  it('keeps its clock when another time is suggested from somewhere else', async () => {
    const card = await meeting('2026-11-03T08:00:00.000Z');
    // Sarah, in London, suggests 13:00 her time on the 4th: 15:00 on the card's own clock.
    const moved = await sarah.post(`/v1/messages/${card.id}/time`, {
      start: { at: '2026-11-04T13:00:00.000Z', hasTime: true },
    });
    expect(moved.message.payload.fields.start).toEqual({
      at: '2026-11-04T13:00:00.000Z',
      hasTime: true,
      zone: 'Africa/Cairo',
      local: '2026-11-04T15:00',
    });
  });

  it('moves a card ahead back to its clock when the rules say it falls elsewhere, once', async () => {
    const ahead = await meeting('2026-11-05T08:00:00.000Z');
    await sarah.post(`/v1/messages/${ahead.id}/kit`, { to: 'accepted' });
    const before = ((await stored(ahead.id)).payload as { sequence?: number }).sequence ?? 0;
    await keptUnderOldRules(ahead.id, '2026-11-05T07:00:00.000Z');
    // One already past is left as it was: what happened, happened.
    const past = await meeting('2026-11-06T08:00:00.000Z');
    await keptUnderOldRules(past.id, '2026-10-20T07:00:00.000Z');
    await sql`update messages set payload = jsonb_set(payload, '{fields,start,local}', '"2026-10-20T10:00"')
       where id = ${past.id}`.execute(t.ctx.db);
    // One kept without a clock (every card from before) is read as it is.
    const older = await meeting('2026-11-07T08:00:00.000Z');
    await sql`update messages set payload = payload #- '{fields,start,local}' #- '{fields,start,zone}'
       where id = ${older.id}`.execute(t.ctx.db);
    await keptUnderOldRules(older.id, '2026-11-07T07:00:00.000Z');

    expect(await rezoneCards(t.ctx, { force: true })).toBe(1);
    const now = await stored(ahead.id);
    const p = now.payload as { fields: { start: Record<string, unknown> }; sequence: number };
    expect(p.fields.start).toMatchObject({
      at: '2026-11-05T08:00:00.000Z',
      local: '2026-11-05T10:00',
    });
    expect(new Date(now.card_start_at!).toISOString()).toBe('2026-11-05T08:00:00.000Z');
    // Its invitation's next version, for whoever has it in a calendar.
    expect(p.sequence).toBe(before + 1);
    expect(((await stored(past.id)).payload as any).fields.start.at).toBe(
      '2026-10-20T07:00:00.000Z',
    );
    expect(((await stored(older.id)).payload as any).fields.start.at).toBe(
      '2026-11-07T07:00:00.000Z',
    );
    // Its people read it where it now falls, on the calendar too.
    const items = (
      await sarah.get('/v1/calendar?from=2026-11-05T00:00:00.000Z&to=2026-11-06T00:00:00.000Z')
    ).items as Array<{ title: string; at: string }>;
    expect(items.find((i) => i.title === 'Planning')?.at).toBe('2026-11-05T08:00:00.000Z');
    // Once read under these rules, the daily pass has nothing to do until they change.
    expect(await rezoneCards(t.ctx)).toBe(0);
    await keptUnderOldRules(ahead.id, '2026-11-05T07:00:00.000Z');
    expect(await rezoneCards(t.ctx)).toBe(0);
  });
});
