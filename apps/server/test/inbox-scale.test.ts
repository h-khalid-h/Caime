import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

/**
 * The inbox at scale (docs/RESOURCES.md): one person in many conversations, each with many
 * messages, timed. INBOX_CONVERSATIONS sets how many (300 in CI; larger runs by hand, the
 * numbers in RESOURCES). A measurement first; the check is that it answers, whole, in time.
 */
const CONVERSATIONS = Number(process.env.INBOX_CONVERSATIONS ?? 300);
const MESSAGES = Number(process.env.INBOX_MESSAGES ?? 40);

let t: TestApp;
let noor: Client;

beforeAll(async () => {
  t = await createTestApp();
  t.clock.set(new Date().toISOString());
  noor = await signup(t, { displayName: 'Noor Haddad' });
  const me = noor.user.id;
  // Others, a direct conversation with each, and a run of messages in each, half of them mine.
  await sql`
    insert into users (id, email, handle, password_hash, display_name, privacy, onboarded_at, birth_date)
    select gen_random_uuid(), 'o' || i || '@example.com', 'other' || i, 'x', 'Other ' || i,
           '{}'::jsonb, now(), date '1990-12-31'
    from generate_series(1, ${CONVERSATIONS}) as i
  `.execute(t.ctx.db);
  await sql`
    insert into conversations (id, kind, direct_key, last_seq, last_message_at, created_by)
    select gen_random_uuid(), 'direct', 'd:' || u.id, ${MESSAGES}::bigint, now() - (row_number() over ()) * interval '1 minute', ${me}::uuid
    from users u where u.handle like 'other%'
  `.execute(t.ctx.db);
  await sql`
    insert into participants (conversation_id, user_id, last_read_seq)
    select c.id, ${me}::uuid, ${Math.floor(MESSAGES / 2)}::bigint from conversations c where c.kind = 'direct'
    union all
    select c.id, substring(c.direct_key from 3)::uuid, ${MESSAGES}::bigint from conversations c where c.kind = 'direct'
  `.execute(t.ctx.db);
  await sql`
    insert into messages (id, conversation_id, seq, sender_id, kind, body, created_at)
    select gen_random_uuid(), c.id, s, case when s % 2 = 0 then ${me}::uuid else substring(c.direct_key from 3)::uuid end,
           'text', 'Message ' || s || ' in ' || c.direct_key, c.last_message_at - (${MESSAGES}::int - s) * interval '1 minute'
    from conversations c, generate_series(1, ${MESSAGES}) as s where c.kind = 'direct'
  `.execute(t.ctx.db);
  await sql`analyze`.execute(t.ctx.db);
}, 600_000);
afterAll(async () => {
  await t.close();
});

describe('the inbox at scale', () => {
  it(`answers for ${CONVERSATIONS} conversations of ${MESSAGES} messages, and says how long it took`, async () => {
    const times: number[] = [];
    let last: { statusCode: number; json(): { sections: Array<{ items: unknown[] }> } } | null =
      null;
    for (let i = 0; i < 5; i++) {
      const started = performance.now();
      last = await noor.req('GET', '/v1/inbox?view=all');
      times.push(performance.now() - started);
    }
    expect(last!.statusCode).toBe(200);
    const all = last!.json() as unknown as { conversations: unknown[] };
    expect(all.conversations).toHaveLength(CONVERSATIONS);
    const attention = await noor.req('GET', '/v1/inbox');
    expect(attention.statusCode).toBe(200);
    if (process.env.INBOX_EXPLAIN) {
      const me = noor.user.id;
      const plan = await sql<{ 'QUERY PLAN': string }>`
        explain (analyze, buffers, summary)
        select c.id, p.last_read_seq,
          (select count(*)::int from messages m where m.conversation_id = c.id and m.seq > p.last_read_seq
            and m.sender_id is distinct from ${me} and m.deleted_at is null and m.kind <> 'system') as unread,
          (select count(*)::int from messages m where m.conversation_id = c.id and m.seq > p.last_read_seq
            and ${me}::uuid = any(m.mentions) and m.deleted_at is null) as unread_mentions,
          (select max(m.seq)::text from messages m where m.conversation_id = c.id and m.sender_id = ${me}) as my_last_seq,
          (select count(*)::int from participants x where x.conversation_id = c.id and x.left_at is null) as member_count,
          (select x.user_id::text from participants x where x.conversation_id = c.id and x.user_id <> ${me} and x.left_at is null limit 1) as other_id,
          (select x.request_state from participants x where x.conversation_id = c.id and x.user_id <> ${me} limit 1) as other_request_state
        from participants p join conversations c on c.id = p.conversation_id
        where p.user_id = ${me} and p.left_at is null and p.role <> 'agent'
      `.execute(t.ctx.db);
      console.log(plan.rows.map((r) => r['QUERY PLAN']).join('\n'));
      const lastPlan = await sql<{ 'QUERY PLAN': string }>`
        explain (analyze, summary)
        select m.* from messages m where (m.conversation_id, m.seq) in
          (select conversation_id, max(seq) from messages where conversation_id in
            (select conversation_id from participants where user_id = ${me} and left_at is null) group by conversation_id)
      `.execute(t.ctx.db);
      console.log(lastPlan.rows.map((r) => r['QUERY PLAN']).join('\n'));
    }
    times.sort((a, b) => a - b);
    console.log(
      `inbox: ${CONVERSATIONS} conversations × ${MESSAGES} messages, view=all: p50 ${times[2]!.toFixed(0)} ms, best ${times[0]!.toFixed(0)} ms, worst ${times[4]!.toFixed(0)} ms`,
    );
  }, 600_000);
});
