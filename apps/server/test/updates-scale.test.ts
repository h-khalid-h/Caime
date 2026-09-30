import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { enqueue, runDueJobs } from '../src/lib/jobs';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

/**
 * An organization's update reaching its followers (PRD §59, R40): the fan-out job, measured
 * with many followers before any organization has that many. FANOUT_FOLLOWERS sets how many
 * (2,000 in CI; 500,000 was run by hand, docs/RESOURCES.md has the number).
 */
const FOLLOWERS = Number(process.env.FANOUT_FOLLOWERS ?? 2000);

let t: TestApp;
let noor: Client;
let orgId: string;

beforeAll(async () => {
  t = await createTestApp();
  t.clock.set(new Date().toISOString());
  noor = await signup(t, { displayName: 'Noor Haddad' });
  orgId = (
    await noor.post('/v1/orgs', {
      country: 'EG',
      name: 'Nile Dental',
      handle: 'nile.dental',
      kind: 'clinic',
    })
  ).org.id;
  // Followers made in SQL: an account each, following with notifications on, since an hour ago.
  await sql`
    insert into users (id, email, handle, password_hash, display_name, privacy, onboarded_at, birth_date)
    select gen_random_uuid(), 'f' || i || '@example.com', 'follower' || i, 'x', 'Follower ' || i,
           '{}'::jsonb, now(), date '1990-12-31'
    from generate_series(1, ${FOLLOWERS}) as i
  `.execute(t.ctx.db);
  await sql`
    insert into org_follows (user_id, org_id, notify, created_at)
    select id, ${orgId}::uuid, true, now() - interval '1 hour' from users where handle like 'follower%'
  `.execute(t.ctx.db);
}, 600_000);
afterAll(async () => {
  await t.close();
});

describe('an update reaches every follower (R40)', () => {
  it(`tells ${FOLLOWERS} followers, a batch at a time, none twice`, async () => {
    const posted = await noor.post(`/v1/orgs/${orgId}/updates`, {
      clientId: crypto.randomUUID(),
      body: 'New hours from Monday.',
    });
    const updateId = posted.update.id as string;
    const started = performance.now();
    let steps = 0;
    while ((await runDueJobs(t.ctx, 50)) > 0) steps++;
    const seconds = (performance.now() - started) / 1000;
    const { rows } = await sql<{ n: number }>`
        select count(*)::int as n from notifications where kind = 'update' and data->>'updateId' = ${updateId}
      `.execute(t.ctx.db);
    expect(rows[0]!.n).toBe(FOLLOWERS);
    // Once more changes nothing: everyone was told once.
    await enqueue(t.ctx, 'updates.fanout', { updateId }, { dedupeKey: `again:${updateId}` });
    while ((await runDueJobs(t.ctx, 50)) > 0) steps++;
    const again = await sql<{ n: number }>`
        select count(*)::int as n from notifications where kind = 'update' and data->>'updateId' = ${updateId}
      `.execute(t.ctx.db);
    expect(again.rows[0]!.n).toBe(FOLLOWERS);
    console.log(
      `fanout: ${FOLLOWERS} followers told in ${seconds.toFixed(1)} s (${Math.round(FOLLOWERS / seconds)}/s, ${steps} runs)`,
    );
  }, 3_600_000);
});
