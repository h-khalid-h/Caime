/**
 * A date's history (R119 level 2, M17 I19d): each move of a meeting's time and of an action's due
 * is kept in the change's own transaction, as the plan moving (`replan`) or a wrong value fixed
 * (`correction`), and goes with what it's about. The brief, its notice and Cai say what slipped,
 * counted from the plan moving alone: a time put back on its own clock is no slip.
 */
import { CAI_ID, uuidv4 } from '@caime/core';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { briefLine } from '../src/lib/briefs';
import { rezoneCards } from '../src/lib/card-zones';
import { runDueJobs } from '../src/lib/jobs';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let hassan: Client;
let sarah: Client;
let convo: string;
let cai: string;
let meetingId: string;
let taskId: string;

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
  cai = (await hassan.post('/v1/conversations', { kind: 'direct', userId: CAI_ID })).conversation
    .id;
});
afterAll(() => t.close());

const movesOf = (of: { messageId: string } | { taskId: string }) =>
  t.ctx.db
    .selectFrom('date_moves')
    .select(['field', 'reason', 'source', 'by_id', 'value_at', 'previous_at', 'value_on'])
    .where(
      'messageId' in of ? 'message_id' : 'task_id',
      '=',
      'messageId' in of ? of.messageId : of.taskId,
    )
    .orderBy('known_at')
    .orderBy('id')
    .execute();

/** What Cai answers a question, a moment after it's asked. */
async function ask(question: string): Promise<string> {
  await hassan.post(`/v1/conversations/${cai}/messages`, { clientId: uuidv4(), body: question });
  await t.ctx.flush();
  t.clock.advance(1000);
  await runDueJobs(t.ctx);
  await t.ctx.flush();
  const said = (await hassan.get(`/v1/conversations/${cai}/messages`)).messages as Array<{
    body: string;
    kind: string;
  }>;
  return said.filter((m) => m.kind === 'text').at(-1)!.body;
}

describe('a date’s history (M17 I19d)', () => {
  it('keeps each other time a meeting is given, and the brief and Cai say it moved', async () => {
    const card = (
      await hassan.post(`/v1/conversations/${convo}/messages`, {
        clientId: uuidv4(),
        kind: 'kit',
        payload: {
          kit: 'meeting',
          fields: {
            title: 'Planning',
            start: { at: '2026-10-27T08:00:00.000Z', hasTime: true },
            durationMinutes: 30,
          },
        },
      })
    ).message;
    meetingId = card.id;
    await sarah.post(`/v1/messages/${card.id}/kit`, { to: 'accepted' });
    // Sarah asks for later that day; Hassan agrees, then asks for the next morning; she agrees.
    await sarah.post(`/v1/messages/${card.id}/time`, {
      start: { at: '2026-10-27T10:00:00.000Z', hasTime: true },
    });
    await hassan.post(`/v1/messages/${card.id}/kit`, { to: 'accepted' });
    await hassan.post(`/v1/messages/${card.id}/time`, {
      start: { at: '2026-10-28T08:00:00.000Z', hasTime: true },
    });
    await sarah.post(`/v1/messages/${card.id}/kit`, { to: 'accepted' });

    const moves = await movesOf({ messageId: card.id });
    expect(moves.map((m) => [m.field, m.reason, m.source, m.by_id])).toEqual([
      ['start', 'replan', 'person', sarah.user.id],
      ['start', 'replan', 'person', hassan.user.id],
    ]);
    expect(moves.map((m) => [m.previous_at?.toISOString(), m.value_at?.toISOString()])).toEqual([
      ['2026-10-27T08:00:00.000Z', '2026-10-27T10:00:00.000Z'],
      ['2026-10-27T10:00:00.000Z', '2026-10-28T08:00:00.000Z'],
    ]);

    const brief = await hassan.get(`/v1/messages/${card.id}/brief`);
    expect(brief.moved).toBe(2);
    // Its notice an hour before says so first.
    expect(briefLine(brief)).toMatch(/^Moved 2 times/);
    expect(await ask('what is coming up?')).toContain('Planning · Moved 2 times');
  });

  it('counts a time put back on its own clock as a correction, never a slip', async () => {
    // As a card written before its zone's rules changed: the clock the same, the instant an hour off.
    await sql`update messages
       set payload = jsonb_set(payload, '{fields,start,at}', '"2026-10-28T07:00:00.000Z"'),
           card_start_at = '2026-10-28T07:00:00.000Z'
     where id = ${meetingId}`.execute(t.ctx.db);
    expect(await rezoneCards(t.ctx, { force: true })).toBe(1);
    const last = (await movesOf({ messageId: meetingId })).at(-1)!;
    expect([last.reason, last.source, last.by_id]).toEqual(['correction', 'rules', null]);
    expect(last.value_at?.toISOString()).toBe('2026-10-28T08:00:00.000Z');
    expect((await hassan.get(`/v1/messages/${meetingId}/brief`)).moved).toBe(2);
  });

  it('keeps an action’s due moving to another day, never its first due or a time that day', async () => {
    taskId = (await hassan.post('/v1/tasks', { title: 'Send the deck' })).task.id;
    // A first due is a plan made, not moved.
    await hassan.patch(`/v1/tasks/${taskId}`, {
      dueAt: '2026-10-28T07:00:00.000Z',
      dueHasTime: false,
    });
    expect(await movesOf({ taskId })).toEqual([]);
    await hassan.patch(`/v1/tasks/${taskId}`, {
      dueAt: '2026-10-29T07:00:00.000Z',
      dueHasTime: false,
    });
    // A time given on the same day is the plan made finer, not moved.
    await hassan.patch(`/v1/tasks/${taskId}`, {
      dueAt: '2026-10-29T12:00:00.000Z',
      dueHasTime: true,
    });
    const moves = await movesOf({ taskId });
    expect(moves.map((m) => [m.field, m.reason, m.source, m.by_id])).toEqual([
      ['due', 'replan', 'person', hassan.user.id],
    ]);
    expect(moves[0]!.value_on).toBe('2026-10-29');
    expect(await ask('what did I say I’d do')).toMatch(/Send the deck · .* · Moved once/);
  });

  it('goes with what it’s about', async () => {
    await hassan.del(`/v1/tasks/${taskId}`);
    expect(await movesOf({ taskId })).toEqual([]);
    await hassan.del(`/v1/messages/${meetingId}`);
    await t.ctx.flush();
    expect(await movesOf({ messageId: meetingId })).toEqual([]);
  });
});
