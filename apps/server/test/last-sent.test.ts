import { readFileSync } from 'node:fs';
import { uuidv4 } from '@caime/core';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

/**
 * Where each person last wrote (M16 D1, review 2026-10-17 §4 H7): kept on their participant row
 * by every path that inserts a message, filled for what was already there by migration 0104's
 * procedure a batch at a time, and read by the inbox's "asked since I last wrote" (and by the
 * count of questions a reply answered) in place of a walk back through the conversation.
 */
let t: TestApp;
let ana: Client;
let bo: Client;
let ab: string;

const send = (c: Client, conversationId: string, body: string) =>
  c
    .post(`/v1/conversations/${conversationId}/messages`, {
      clientId: uuidv4(),
      kind: 'text',
      body,
    })
    .then((r) => r.message as { seq: number });
const lastSent = async (conversationId: string, userId: string) =>
  Number(
    (
      await t.ctx.db
        .selectFrom('participants')
        .select('last_sent_seq')
        .where('conversation_id', '=', conversationId)
        .where('user_id', '=', userId)
        .executeTakeFirstOrThrow()
    ).last_sent_seq,
  );
const reasonsFor = async (c: Client, conversationId: string): Promise<string[]> => {
  await t.ctx.flush();
  const all = (await c.get('/v1/inbox?view=all')) as {
    conversations: Array<{ id: string; reasons: Array<{ code: string }> }>;
  };
  return all.conversations.find((x) => x.id === conversationId)?.reasons.map((r) => r.code) ?? [];
};

beforeAll(async () => {
  t = await createTestApp();
  ana = await signup(t, { displayName: 'Ana Sent' });
  bo = await signup(t, { displayName: 'Bo Sent' });
  const r = await ana.post('/v1/connections/requests', {
    toUserId: bo.user.id,
    relationship: { sphere: 'family', role: 'sibling' },
  });
  ab = (await bo.post(`/v1/connections/requests/${r.requestId}/accept`, {})).conversationId;
});
afterAll(() => t.close());

describe('where each person last wrote (M16 D1)', () => {
  it('is kept by a message and by a system line, for whoever wrote it', async () => {
    const one = await send(ana, ab, 'One from Ana');
    const two = await send(bo, ab, 'Two from Bo');
    expect(await lastSent(ab, ana.user.id)).toBe(Number(one.seq));
    expect(await lastSent(ab, bo.user.id)).toBe(Number(two.seq));
    const three = await send(ana, ab, 'Three from Ana');
    expect(await lastSent(ab, ana.user.id)).toBe(Number(three.seq));
    expect(await lastSent(ab, bo.user.id)).toBe(Number(two.seq));

    // Making a group writes a line as its maker; renaming it, another.
    const g = (
      await ana.post('/v1/conversations', {
        kind: 'group',
        title: 'Sent group',
        memberIds: [bo.user.id],
      })
    ).conversation.id as string;
    const made = await lastSent(g, ana.user.id);
    expect(made).toBeGreaterThan(0);
    expect(await lastSent(g, bo.user.id)).toBe(0);
    await ana.patch(`/v1/conversations/${g}`, { title: 'Sent group, renamed' });
    expect(await lastSent(g, ana.user.id)).toBeGreaterThan(made);
  });

  it('is what the inbox asks: a question since I last wrote needs me, one before it does not', async () => {
    await send(ana, ab, 'I wrote first');
    await send(bo, ab, 'What time does it start?');
    expect(await reasonsFor(ana, ab)).toContain('asked_you');
    await send(ana, ab, 'Here it is');
    expect(await reasonsFor(ana, ab)).not.toContain('asked_you');
  });

  it('is filled for what was there, across batches, and only ever raised', async () => {
    // 2,500 people in one conversation (three batches of the procedure), the first 1,200 of
    // whom wrote once each; one says they wrote further on than anything here.
    const n = 2500;
    const wrote = 1200;
    const c = uuidv4();
    await sql`
      insert into users (id, email, handle, password_hash, display_name, privacy, onboarded_at, birth_date)
      select gen_random_uuid(), 'fill' || i || '@example.com', 'fill' || ${c.slice(0, 6)} || 'x' || i,
             'x', 'Fill ' || i, '{}'::jsonb, now(), date '1990-12-31'
      from generate_series(1, ${n}::int) as i
    `.execute(t.ctx.db);
    await sql`
      insert into conversations (id, kind, title, last_seq, created_by)
      values (${c}::uuid, 'group', 'Filled', ${wrote}::bigint, ${ana.user.id}::uuid)
    `.execute(t.ctx.db);
    await sql`
      insert into participants (conversation_id, user_id)
      select ${c}::uuid, u.id from users u where u.handle like ${`fill${c.slice(0, 6)}x%`}
    `.execute(t.ctx.db);
    await sql`
      insert into messages (id, conversation_id, seq, sender_id, kind, body)
      select gen_random_uuid(), ${c}::uuid, i, u.id, 'text', 'Hello ' || i
      from users u, lateral (select substring(u.handle from length(${`fill${c.slice(0, 6)}x`}) + 1)::int as i) n
      where u.handle like ${`fill${c.slice(0, 6)}x%`} and n.i <= ${wrote}
    `.execute(t.ctx.db);
    const ahead = (
      await sql<{
        id: string;
      }>`select id from users where handle = ${`fill${c.slice(0, 6)}x${n}`}`.execute(t.ctx.db)
    ).rows[0]!.id;
    await sql`update participants set last_sent_seq = 99999 where conversation_id = ${c}::uuid and user_id = ${ahead}::uuid`.execute(
      t.ctx.db,
    );
    const before = await lastSent(ab, ana.user.id);
    // As if these were here before the column: then the migration's own procedure, made again
    // from its file (0107 dropped it once 0106 had run it a second time) and dropped after.
    await sql`update participants set last_sent_seq = 0 where conversation_id = ${c}::uuid and user_id <> ${ahead}::uuid`.execute(
      t.ctx.db,
    );
    const migration = readFileSync(
      new URL('../src/db/migrations/0104_participants_last_sent.sql', import.meta.url),
      'utf8',
    );
    await sql.raw(migration).execute(t.ctx.db);
    await sql.raw('call fill_participants_last_sent()').execute(t.ctx.db);
    await sql.raw('drop procedure fill_participants_last_sent()').execute(t.ctx.db);
    const rows = (
      await sql<{ handle: string; last_sent_seq: string }>`
        select u.handle, p.last_sent_seq from participants p join users u on u.id = p.user_id
        where p.conversation_id = ${c}::uuid
      `.execute(t.ctx.db)
    ).rows;
    const prefix = `fill${c.slice(0, 6)}x`;
    const wrong = rows.filter((r) => {
      const i = Number(r.handle.slice(prefix.length));
      const want = i === n ? 99999 : i <= wrote ? i : 0;
      return Number(r.last_sent_seq) !== want;
    });
    expect(rows).toHaveLength(n);
    expect(wrong).toEqual([]);
    // Everyone else's stands as their messages left it.
    expect(await lastSent(ab, ana.user.id)).toBe(before);
  });
});
