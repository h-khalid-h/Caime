import { randomBytes } from 'node:crypto';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

/**
 * People and organizations listed at any size cost the same (M16 D1, review 2026-10-17 §4 H6):
 * every list is a fixed number of queries, never a few per person (connections cost 1 + 2N, a
 * search up to 400 at a keystroke, an organization's search a seat each). Each list is asked of
 * someone with a few and of someone with many, and the two must cost the same, under a ceiling.
 */
const FEW = 3;
const MANY = 30;
/** What any of these lists may cost, whoever asks: the session's, the list's and the people's. */
const CEILING = 16;

let t: TestApp;
let few: Client;
let many: Client;

/** n people connected to them, n asking to connect, n organizations they own: by SQL, at once. */
async function seed(viewer: Client, n: number) {
  const me = viewer.user.id;
  const tag = randomBytes(3).toString('hex');
  const people = (prefix: string, name: string) => sql`
    insert into users (id, email, handle, password_hash, display_name, privacy, onboarded_at, birth_date)
    select gen_random_uuid(), ${prefix} || ${tag} || i || '@example.com', ${prefix} || ${tag} || 'x' || i,
           'x', ${name} || ' ' || ${tag} || ' ' || i, '{}'::jsonb, now(), date '1990-12-31'
    from generate_series(1, ${n}::int) as i
  `;
  await people('c', 'Linked').execute(t.ctx.db);
  await people('r', 'Asking').execute(t.ctx.db);
  await sql`
    insert into connections (id, user_a, user_b)
    select gen_random_uuid(), least(u.id, ${me}::uuid), greatest(u.id, ${me}::uuid)
    from users u where u.handle like ${`c${tag}x%`}
  `.execute(t.ctx.db);
  await sql`
    insert into connection_sides (connection_id, owner_id, other_id)
    select c.id, ${me}::uuid, case when c.user_a = ${me}::uuid then c.user_b else c.user_a end
    from connections c where ${me}::uuid in (c.user_a, c.user_b)
    union all
    select c.id, case when c.user_a = ${me}::uuid then c.user_b else c.user_a end, ${me}::uuid
    from connections c where ${me}::uuid in (c.user_a, c.user_b)
  `.execute(t.ctx.db);
  await sql`
    insert into connection_requests (id, from_user, to_user)
    select gen_random_uuid(), u.id, ${me}::uuid from users u where u.handle like ${`r${tag}x%`}
  `.execute(t.ctx.db);
  await sql`
    insert into organizations (id, name, handle, kind, created_by)
    select gen_random_uuid(), 'Org ' || ${tag} || ' ' || i, 'o' || ${tag} || 'x' || i, 'business', ${me}::uuid
    from generate_series(1, ${n}::int) as i
  `.execute(t.ctx.db);
  await sql`
    insert into org_members (org_id, user_id, role)
    select o.id, ${me}::uuid, 'owner' from organizations o where o.handle like ${`o${tag}x%`}
  `.execute(t.ctx.db);
  return tag;
}

let fewTag: string;
let manyTag: string;

beforeAll(async () => {
  t = await createTestApp();
  few = await signup(t, { displayName: 'Rana Few' });
  many = await signup(t, { displayName: 'Rami Many' });
  fewTag = await seed(few, FEW);
  manyTag = await seed(many, MANY);
}, 120_000);
afterAll(() => t.close());

/** What one request cost the server, asked once before so nothing first-time is counted. */
async function cost(c: Client, url: string): Promise<{ queries: number; body: any }> {
  expect((await c.req('GET', url)).statusCode).toBe(200);
  const before = t.queries();
  const res = await c.req('GET', url);
  expect(res.statusCode).toBe(200);
  return { queries: t.queries() - before, body: res.json() };
}

describe('people and organizations listed at any size (M16 D1)', () => {
  const lists: Array<[string, (tag: string) => string, (body: any) => number]> = [
    ['connections', () => '/v1/connections', (b) => b.connections.length],
    ['requests', () => '/v1/connections/requests', (b) => b.requests.length],
    [
      'people search',
      (tag) => `/v1/people/search?q=${encodeURIComponent(`Linked ${tag}`)}&limit=50`,
      (b) => b.results.length,
    ],
    ['organizations', () => '/v1/orgs', (b) => b.orgs.length],
    [
      'organization search',
      (tag) => `/v1/orgs/search?q=${encodeURIComponent(`Org ${tag}`)}`,
      (b) => b.orgs.length,
    ],
    ['Business inboxes', () => '/v1/business/summary', (b) => b.orgs.length],
  ];
  for (const [name, url, count] of lists)
    it(`${name}: the same queries for ${FEW} as for ${MANY}`, async () => {
      const small = await cost(few, url(fewTag));
      const large = await cost(many, url(manyTag));
      console.log(`${name}: ${small.queries} queries for ${FEW}, ${large.queries} for ${MANY}`);
      // A search of people also finds names like these (that's its job), and one of
      // organizations answers twenty at most; everything else lists them all.
      if (name === 'people search') {
        expect(count(small.body)).toBeGreaterThanOrEqual(FEW);
        expect(count(large.body)).toBeGreaterThanOrEqual(MANY);
      } else {
        expect(count(small.body)).toBe(FEW);
        expect(count(large.body)).toBe(name === 'organization search' ? 20 : MANY);
      }
      expect(
        large.queries,
        `${name}: ${small.queries} for ${FEW}, ${large.queries} for ${MANY}`,
      ).toBe(small.queries);
      expect(large.queries).toBeLessThanOrEqual(CEILING);
    });

  it('draws each person as before: names, trust, and what they are to me', async () => {
    const { body } = await cost(many, '/v1/connections');
    const first = body.connections[0];
    expect(first.person.displayName).toMatch(/^Linked /);
    expect(first.person.trust).toBeTruthy();
    const asking = (await cost(many, '/v1/connections/requests')).body.requests[0];
    expect(asking.person.displayName).toMatch(/^Asking /);
    const found = (
      await cost(many, `/v1/people/search?q=${encodeURIComponent(`Linked ${manyTag}`)}`)
    ).body.results[0];
    expect(found.connection).toBeTruthy();
    expect(found.person.displayName).toMatch(/^Linked /);
  });
});
