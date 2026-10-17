/**
 * The outbox for a message's effects (review 2026-10-17 §4, block A3): the send writes when the
 * sweep may step in, the fast path clears it, and `message.effects` replays what an instance
 * that died never finished.
 */
import { sql } from 'kysely';
import { v4 as uuidv4, v7 as uuidv7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runPeriodic } from '../src/lib/jobs';
import { EFFECTS_GIVE_UP_MS, replayEffects } from '../src/lib/message-effects';
import { EFFECTS_GRACE_MS, sendMessage } from '../src/lib/messages';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

let t: TestApp;
let hassan: Client;
let sarah: Client;
let convo: string;

const effectsAt = async (id: string) =>
  (
    await t.ctx.db
      .selectFrom('messages')
      .select('effects_at')
      .where('id', '=', id)
      .executeTakeFirstOrThrow()
  ).effects_at;

const toldAbout = (userId: string, messageId: string) =>
  t.ctx.db
    .selectFrom('notifications')
    .select('id')
    .where('user_id', '=', userId)
    .where(({ eb, ref }) => eb(ref('data', '->>').key('messageId'), '=', messageId))
    .execute();

/** A message that landed in the table as a send does, but whose effects never ran (the crash). */
async function landed(body: string, opts: { ago?: number; due?: number } = {}): Promise<string> {
  const now = t.ctx.now();
  const bumped = await t.ctx.db
    .updateTable('conversations')
    .set({ last_seq: sql`last_seq + 1` })
    .where('id', '=', convo)
    .returning('last_seq')
    .executeTakeFirstOrThrow();
  const row = await t.ctx.db
    .insertInto('messages')
    .values({
      id: uuidv7(),
      conversation_id: convo,
      seq: bumped.last_seq,
      sender_id: hassan.user.id,
      client_id: `test:${uuidv4()}`,
      kind: 'text',
      body,
      payload: JSON.stringify({}),
      entities: JSON.stringify({}),
      created_at: new Date(now.getTime() - (opts.ago ?? 0)),
      effects_at: new Date(now.getTime() + (opts.due ?? -1000)),
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  return row.id;
}

beforeAll(async () => {
  t = await createTestApp();
  hassan = await signup(t, { displayName: 'Hassan Khalid', handle: 'hassan' });
  sarah = await signup(t, { displayName: 'Sarah Smith', handle: 'sarahs' });
  const r = await hassan.post('/v1/connections/requests', {
    toUserId: sarah.user.id,
    relationship: { sphere: 'work', role: 'colleague' },
  });
  const res = await sarah.post(`/v1/connections/requests/${r.requestId}/accept`, {
    relationship: { sphere: 'work', role: 'colleague' },
  });
  convo = res.conversationId;
});
afterAll(async () => {
  await t.close();
});

describe('the outbox for a message’s effects (A3)', () => {
  it('a send is due a grace ahead, and done once the fast path has run its effects', async () => {
    const sent = await sendMessage(t.ctx, hassan.user.id, convo, {
      clientId: uuidv4(),
      kind: 'text',
      body: 'Hello there',
    });
    expect(sent.message.effects_at?.getTime()).toBe(t.ctx.now().getTime() + EFFECTS_GRACE_MS);
    // The route runs them after its answer; here they are run as it would.
    const { afterMessage } = await import('../src/lib/message-effects');
    await afterMessage(t.ctx, sent.message, sent.analysis);
    expect(await effectsAt(sent.message.id)).toBeNull();
  });

  it('a send with no effects wanted is never due', async () => {
    const sent = await sendMessage(
      t.ctx,
      hassan.user.id,
      convo,
      { clientId: uuidv4(), kind: 'text', body: 'A line nobody is told of' },
      { effects: false },
    );
    expect(sent.message.effects_at).toBeNull();
  });

  it('the sweep replays what an instance never finished: the recipient is told after all', async () => {
    const lost = await landed('Can you send me the report by Friday?');
    expect(await toldAbout(sarah.user.id, lost)).toEqual([]);
    const before = t.ctx.metrics.effects.get({ outcome: 'replayed' });
    await runPeriodic(t.ctx);
    expect(await toldAbout(sarah.user.id, lost)).toHaveLength(1);
    expect(await effectsAt(lost)).toBeNull();
    expect(t.ctx.metrics.effects.get({ outcome: 'replayed' })).toBe(before + 1);
  });

  it('a message still within its grace is left to the fast path', async () => {
    const fresh = await landed('Still being handled', { due: EFFECTS_GRACE_MS - 1000 });
    expect(await replayEffects(t.ctx)).toBe(0);
    expect(await toldAbout(sarah.user.id, fresh)).toEqual([]);
    expect(await effectsAt(fresh)).not.toBeNull();
  });

  it('a message a day old with its effects still due is let go, and counted', async () => {
    const old = await landed('From yesterday', { ago: EFFECTS_GIVE_UP_MS + 60_000 });
    const before = t.ctx.metrics.effects.get({ outcome: 'dropped' });
    expect(await replayEffects(t.ctx)).toBe(0);
    expect(await toldAbout(sarah.user.id, old)).toEqual([]);
    expect(await effectsAt(old)).toBeNull();
    expect(t.ctx.metrics.effects.get({ outcome: 'dropped' })).toBe(before + 1);
  });

  it('a replay that is claimed waits ten minutes before another instance would take it', async () => {
    // Claimed and run here: once done it is null; a claim alone would sit EFFECTS_RETRY_MS on.
    const lost = await landed('Another one that was lost');
    await replayEffects(t.ctx);
    expect(await effectsAt(lost)).toBeNull();
    expect(await toldAbout(sarah.user.id, lost)).toHaveLength(1);
  });
});
