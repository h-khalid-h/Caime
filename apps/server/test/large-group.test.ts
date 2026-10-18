import { LARGE_GROUP, uuidv4 } from '@caime/core';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import type { BusMessage } from '../src/lib/bus';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

/**
 * A group of many (M16 D2b, review 2026-10-17 §4 H5): past LARGE_GROUP people, what someone a
 * member doesn't know says to everyone waits in that member's inbox, telling them all costs the
 * same at a hundred and fifty as at three hundred, nobody's devices say what arrived and nobody
 * is seen typing. Below it, nothing changes (`fanout-scale.test.ts`).
 */
let t: TestApp;
/** Writes to everyone. */
let ana: Client;
/** Knows Ana: a connection. */
let bo: Client;
/** A stranger to Ana who made the group a priority. */
let cy: Client;
/** A stranger to Ana. */
let dee: Client;
let filled = 0;

const REASON = 'A big group: only what’s for you alerts you';

/** A group of Ana's with `size` more people made in SQL, and Bo, Cy and Dee. */
async function crowd(size: number): Promise<{ id: string; others: string[] }> {
  filled += 1;
  const prefix = `crowd${filled}x`;
  await sql`
    insert into users (id, email, handle, password_hash, display_name, privacy, onboarded_at, birth_date)
    select gen_random_uuid(), ${prefix} || i || '@example.com', ${prefix} || i, 'x', 'Member ' || i,
           '{}'::jsonb, now(), date '1990-12-31'
    from generate_series(1, ${size}::int) as i
  `.execute(t.ctx.db);
  const id = (
    await sql<{ id: string }>`
      insert into conversations (id, kind, title, created_by, last_seq, created_at)
      values (gen_random_uuid(), 'group', 'Everyone', ${ana.user.id}::uuid, 0, now() - interval '1 hour')
      returning id
    `.execute(t.ctx.db)
  ).rows[0]!.id;
  await sql`
    insert into participants (conversation_id, user_id, role, joined_at)
    select ${id}::uuid, id, case when id = ${ana.user.id}::uuid then 'owner' else 'member' end,
           now() - interval '1 hour'
    from users
    where handle like ${`${prefix}%`}
       or id in (${ana.user.id}::uuid, ${bo.user.id}::uuid, ${cy.user.id}::uuid, ${dee.user.id}::uuid)
  `.execute(t.ctx.db);
  const others = (
    await sql<{ id: string }>`select id from users where handle like ${`${prefix}%`}`.execute(
      t.ctx.db,
    )
  ).rows.map((r) => r.id);
  return { id, others };
}

const send = async (conversationId: string, body: string, mentions?: string[]) =>
  (
    await ana.post(`/v1/conversations/${conversationId}/messages`, {
      kind: 'text',
      body,
      clientId: uuidv4(),
      ...(mentions ? { mentions } : {}),
    })
  ).message as { id: string; seq: number };

const toldOf = async (messageId: string) =>
  (
    await sql<{
      user_id: string;
      delivery: string;
      reason: string | null;
      level: string;
      count: number;
    }>`
      select user_id, delivery, reason, level, count from notifications
      where data->>'messageId' = ${messageId}
    `.execute(t.ctx.db)
  ).rows;

beforeAll(async () => {
  t = await createTestApp();
  t.clock.set(new Date().toISOString());
  ana = await signup(t, { displayName: 'Ana Crowd' });
  bo = await signup(t, { displayName: 'Bo Crowd' });
  cy = await signup(t, { displayName: 'Cy Crowd' });
  dee = await signup(t, { displayName: 'Dee Crowd' });
  const r = await ana.post('/v1/connections/requests', {
    toUserId: bo.user.id,
    relationship: { sphere: 'friend', role: 'friend' },
  });
  await bo.post(`/v1/connections/requests/${r.requestId}/accept`, {});
}, 120_000);
afterAll(() => t.close());

describe('a group of many (M16 D2b)', () => {
  it('lets a stranger’s word to everyone wait; what’s for them, people they know and a priority group alert', async () => {
    const { id, others } = await crowd(LARGE_GROUP + 50);
    await sql`update participants set attention = 'priority' where conversation_id = ${id}::uuid and user_id = ${cy.user.id}::uuid`.execute(
      t.ctx.db,
    );
    const hello = await send(id, 'Hello everyone');
    await t.ctx.flush();
    const told = await toldOf(hello.id);
    const of = new Map(told.map((n) => [n.user_id, n]));
    // Everyone is told, in their list; who is alerted is what changed.
    expect(told).toHaveLength(others.length + 3);
    expect(of.get(bo.user.id)?.delivery).toBe('push');
    expect(of.get(cy.user.id)?.delivery).toBe('push');
    expect(of.get(dee.user.id)).toMatchObject({ delivery: 'silent', reason: REASON });
    expect(others.every((o) => of.get(o)?.delivery === 'silent')).toBe(true);
    // Naming Dee is for Dee: the burst's notification alerts now, at a mention's level.
    await send(id, 'Dee, over to you', [dee.user.id]);
    await t.ctx.flush();
    const rows = await sql<{ user_id: string; delivery: string; level: string; count: number }>`
      select user_id, delivery, level, count from notifications
      where group_key = ${`conv:${id}`} and user_id in (${dee.user.id}::uuid, ${others[0]!}::uuid)
    `.execute(t.ctx.db);
    const dees = rows.rows.find((n) => n.user_id === dee.user.id);
    const theirs = rows.rows.find((n) => n.user_id === others[0]);
    expect(dees).toMatchObject({ delivery: 'push', level: 'attention', count: 2 });
    expect(theirs).toMatchObject({ delivery: 'silent', level: 'activity', count: 2 });
  });

  it('tells them all at the same cost, a hundred and fifty or three hundred', async () => {
    const cost = async (size: number) => {
      const { id } = await crowd(size);
      const before = t.queries();
      const m = await send(id, 'Are we still on for Thursday?');
      await t.ctx.flush();
      const queries = t.queries() - before;
      expect(await toldOf(m.id)).toHaveLength(size + 3);
      return queries;
    };
    const small = await cost(LARGE_GROUP + 50);
    const large = await cost(LARGE_GROUP + 200);
    console.log(
      `a message to ${LARGE_GROUP + 53} and to ${LARGE_GROUP + 203}: ${small} and ${large} queries`,
    );
    expect(large).toBe(small);
    expect(small).toBeLessThan(45);
  });

  it('keeps what arrived to itself, and a read is the reader’s own', async () => {
    const { id } = await crowd(LARGE_GROUP + 10);
    const m = await send(id, 'One for the record');
    await t.ctx.flush();
    const heard: BusMessage[] = [];
    const stop = t.ctx.bus.subscribe((msg) => heard.push(msg));
    const position = async () =>
      (
        await sql<{ last_read_seq: string; last_delivered_seq: string }>`
          select last_read_seq, last_delivered_seq from participants
          where conversation_id = ${id}::uuid and user_id = ${dee.user.id}::uuid
        `.execute(t.ctx.db)
      ).rows[0]!;
    await dee.post(`/v1/conversations/${id}/receipts`, { delivered: m.seq });
    expect(Number((await position()).last_delivered_seq)).toBe(0);
    await dee.post(`/v1/conversations/${id}/receipts`, { read: m.seq });
    expect(Number((await position()).last_read_seq)).toBe(m.seq);
    const receipts = () => heard.filter((h) => h.event.type === 'receipts');
    await expect.poll(() => receipts().length).toBe(1);
    stop();
    expect(receipts()[0]!.userIds).toEqual([dee.user.id]);
  });

  it('shows nobody typing, on the socket or not', async () => {
    const { id } = await crowd(LARGE_GROUP + 10);
    const pair = (await bo.get('/v1/connections')).connections.find(
      (c: { person: { id: string } }) => c.person.id === ana.user.id,
    ).conversationId as string;
    const heard: BusMessage[] = [];
    const stop = t.ctx.bus.subscribe((msg) => heard.push(msg));
    const typingIn = (conversationId: string) =>
      heard.some(
        (h) =>
          h.event.type === 'typing' &&
          (h.event.data as { conversationId: string }).conversationId === conversationId,
      );
    await dee.post(`/v1/conversations/${id}/typing`, {});
    const address = await t.app.listen({ port: 0, host: '127.0.0.1' });
    const socket = new WebSocket(`${address.replace('http', 'ws')}/v1/realtime`);
    const frames: Array<{ type: string }> = [];
    socket.on('open', () => socket.send(JSON.stringify({ type: 'auth', token: bo.token })));
    socket.on('message', (raw) => frames.push(JSON.parse(String(raw))));
    await expect.poll(() => frames.some((f) => f.type === 'hello')).toBe(true);
    socket.send(JSON.stringify({ type: 'typing', conversationId: id }));
    // The same socket typing to one person is heard, so silence in the crowd is the crowd's.
    socket.send(JSON.stringify({ type: 'typing', conversationId: pair }));
    await expect.poll(() => typingIn(pair)).toBe(true);
    socket.close();
    stop();
    expect(typingIn(id)).toBe(false);
  });
});
