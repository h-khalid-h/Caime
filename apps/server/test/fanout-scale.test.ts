import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { BusMessage } from '../src/lib/bus';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

/**
 * A message to a big group (docs/RESOURCES.md): what telling every member costs, in queries and
 * time, and whom an ack reaches. FANOUT_MEMBERS sets the size (80 in CI; larger runs by hand,
 * the numbers in RESOURCES). The checks are ceilings with room: per member, a handful of
 * queries; per ack, the senders it covers, never the whole group.
 */
const MEMBERS = Number(process.env.FANOUT_MEMBERS ?? 80);

let t: TestApp;
let noor: Client;
let omar: Client;
let group: string;

beforeAll(async () => {
  t = await createTestApp();
  t.clock.set(new Date().toISOString());
  noor = await signup(t, { displayName: 'Noor Haddad' });
  omar = await signup(t, { displayName: 'Omar Said' });
  // The rest of the group made in SQL: an account each, in the group since an hour ago.
  await sql`
    insert into users (id, email, handle, password_hash, display_name, privacy, onboarded_at, birth_date)
    select gen_random_uuid(), 'm' || i || '@example.com', 'member' || i, 'x', 'Member ' || i,
           '{}'::jsonb, now(), date '1990-12-31'
    from generate_series(1, ${MEMBERS - 2}) as i
  `.execute(t.ctx.db);
  group = (
    await sql<{ id: string }>`
      insert into conversations (id, kind, title, created_by, last_seq, created_at)
      values (gen_random_uuid(), 'group', 'Everyone', ${noor.user.id}::uuid, 0, now() - interval '1 hour')
      returning id
    `.execute(t.ctx.db)
  ).rows[0]!.id;
  await sql`
    insert into participants (conversation_id, user_id, role, joined_at)
    select ${group}::uuid, id, case when id = ${noor.user.id}::uuid then 'owner' else 'member' end, now() - interval '1 hour'
    from users where handle like 'member%' or id in (${noor.user.id}::uuid, ${omar.user.id}::uuid)
  `.execute(t.ctx.db);
  await sql`analyze`.execute(t.ctx.db);
}, 600_000);
afterAll(async () => {
  await t.close();
});

describe('a message to a big group', () => {
  it(`tells ${MEMBERS - 1} members in a handful of queries each, and says how long it took`, async () => {
    const before = t.queries();
    const started = performance.now();
    await noor.post(`/v1/conversations/${group}/messages`, {
      kind: 'text',
      body: 'Are we still on for Thursday?',
      clientId: crypto.randomUUID(),
    });
    await t.ctx.flush();
    const queries = t.queries() - before;
    const ms = Math.round(performance.now() - started);
    const told = await t.ctx.db
      .selectFrom('notifications')
      .select(({ fn }) => fn.countAll<number>().as('n'))
      .where('group_key', '=', `conv:${group}`)
      .executeTakeFirstOrThrow();
    console.log(
      `fan-out to ${MEMBERS - 1}: ${queries} queries (${(queries / (MEMBERS - 1)).toFixed(1)} per member), ${ms} ms`,
    );
    expect(Number(told.n)).toBe(MEMBERS - 1);
    // What's left per member is their own notification, its event and its push lookup: the
    // settings, rules, relationships, identities and open notifications were read once for all.
    expect(queries).toBeLessThan((MEMBERS - 1) * 5 + 40);
  });

  it('an ack reaches whoever sent what it covers, and the reader’s own devices, not the group', async () => {
    const heard: BusMessage[] = [];
    const stop = t.ctx.bus.subscribe((m) => heard.push(m));
    const before = t.queries();
    await omar.post(`/v1/conversations/${group}/receipts`, { delivered: 1 });
    await omar.post(`/v1/conversations/${group}/receipts`, { read: 1 });
    const queries = t.queries() - before;
    const receipts = () => heard.filter((m) => m.event.type === 'receipts');
    // The read reached its sender: visible or not (they aren't connected, so not), Noor hears
    // something, in an event of her own; the bus delivers after the response.
    await expect.poll(() => receipts().some((r) => r.userIds.includes(noor.user.id))).toBe(true);
    stop();
    // Every receipts event went to Omar's own devices, to Noor, or to both: never to the group.
    expect(receipts().some((r) => r.userIds.includes(omar.user.id))).toBe(true);
    for (const r of receipts()) {
      expect(r.userIds.length).toBeLessThanOrEqual(2);
      expect(r.userIds.every((u) => u === omar.user.id || u === noor.user.id)).toBe(true);
    }
    console.log(`two acks in a group of ${MEMBERS}: ${queries} queries`);
    expect(queries).toBeLessThan(40);
  });
});
