import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AUDIT_VERIFY_ROWS, audit, verifyAuditChain } from '../src/lib/audit';
import { runPeriodic } from '../src/lib/jobs';
import { auditState } from '../src/lib/metrics';
import { type Client, createTestApp, signup, type TestApp } from './helpers';

/**
 * The audit log is a hash chain (R78, migration 0072): sealed as each row's transaction
 * commits, in commit order, over a canonical form the database holds; a row changed, taken
 * out of the middle or put in reads as a break, and the operator and a daily task verify it.
 */
let t: TestApp;
let noor: Client;
const ADMIN = 'operator-token-0123456789abcdef';
const METRICS = 'metrics-token-0123456789abcdef';

const admin = (url: string) =>
  t.app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${ADMIN}` } });
const rows = () =>
  t.ctx.db
    .selectFrom('audit_log')
    .select(['seq', 'action', 'prev_hash', 'hash'])
    .orderBy('seq')
    .execute();

beforeAll(async () => {
  t = await createTestApp({ ADMIN_TOKEN: ADMIN, METRICS_TOKEN: METRICS });
  noor = await signup(t, { displayName: 'Noor Haddad' });
});

afterAll(async () => {
  await t.close();
});

describe('the audit chain (R78)', () => {
  it('seals every row at commit, each linked to the one before, in commit order, and nothing for a rollback', async () => {
    await audit(t.ctx.db, { actorId: noor.user.id, action: 'token.created', target: 'a' });
    const first = await rows();
    expect(first.length).toBeGreaterThan(1);
    expect(first[0]?.prev_hash).toBeNull();
    for (let i = 0; i < first.length; i++) {
      expect(first[i]?.seq).toBe(String(i + 1));
      expect(first[i]?.hash).toMatch(/^[0-9a-f]{64}$/);
      if (i > 0) expect(first[i]?.prev_hash).toBe(first[i - 1]?.hash);
    }
    // Two transactions open at once: the one that commits first comes first in the chain,
    // whatever order they wrote in, so the order is the one the database can vouch for.
    const a = await t.ctx.pool.connect();
    const b = await t.ctx.pool.connect();
    try {
      await a.query('begin');
      await a.query("insert into audit_log (action) values ('test.second')");
      await b.query('begin');
      await b.query("insert into audit_log (action) values ('test.first')");
      await b.query('commit');
      // Meanwhile a's row is unsealed and unseen; it takes its place as a commits.
      await a.query('commit');
      await a.query('begin');
      await a.query("insert into audit_log (action) values ('test.rolled')");
      await a.query('rollback');
    } finally {
      a.release();
      b.release();
    }
    const after = await rows();
    const tail = after.slice(-2).map((r) => r.action);
    expect(tail).toEqual(['test.first', 'test.second']);
    expect(after.some((r) => r.action === 'test.rolled')).toBe(false);
    expect(after.map((r) => Number(r.seq))).toEqual(after.map((_, i) => i + 1));
    const report = await verifyAuditChain(t.ctx.db);
    expect(report).toMatchObject({
      checked: after.length,
      firstSeq: 1,
      lastSeq: after.length,
      head: after.at(-1)?.hash,
      altered: [],
      broken: [],
      ok: true,
    });
  });

  it('reads a row changed in place, one taken out of the middle and one put in as breaks', async () => {
    // A few more, so the newest rows sit well past the one tampered with.
    for (const target of ['b', 'c', 'd', 'e'])
      await audit(t.ctx.db, { actorId: noor.user.id, action: 'token.revoked', target });
    const before = await rows();
    const target = before[2];
    if (before.length < 8 || !target) throw new Error('needs eight rows');
    // Changed in place: its hash no longer matches its fields.
    await t.ctx.db
      .updateTable('audit_log')
      .set({ action: 'auth.login' })
      .where('seq', '=', target.seq)
      .execute();
    let report = await verifyAuditChain(t.ctx.db);
    expect(report.altered).toEqual([Number(target.seq)]);
    expect(report.broken).toEqual([]);
    expect(report.ok).toBe(false);
    // Put back by hand: a rewrite of the row with the right words reads intact again, which
    // is why the head goes in the log each day, off the database.
    await t.ctx.db
      .updateTable('audit_log')
      .set({ action: target.action })
      .where('seq', '=', target.seq)
      .execute();
    expect((await verifyAuditChain(t.ctx.db)).ok).toBe(true);
    // Taken out of the middle: the row after it no longer links to the one before it.
    await t.ctx.db.deleteFrom('audit_log').where('seq', '=', target.seq).execute();
    report = await verifyAuditChain(t.ctx.db);
    expect(report.altered).toEqual([]);
    expect(report.broken).toEqual([Number(before[3]?.seq)]);
    // The window's first row's link isn't asked for: the newest two alone read fine.
    expect((await verifyAuditChain(t.ctx.db, 2)).ok).toBe(true);
    expect((await verifyAuditChain(t.ctx.db, before.length)).ok).toBe(false);
  });

  it('the operator verifies it, and the daily task does, with the head on /metrics', async () => {
    const res = await admin('/v1/admin/audit?limit=2');
    expect(res.statusCode).toBe(200);
    expect(res.json().chain).toMatchObject({ checked: 2, ok: true });
    expect(await admin('/v1/admin/audit?limit=0').then((r) => r.statusCode)).toBe(400);
    const whole = (await admin('/v1/admin/audit')).json().chain;
    expect(whole.ok).toBe(false);
    expect(whole.broken.length).toBe(1);
    const noted = await t.ctx.db
      .selectFrom('audit_log')
      .select(['metadata'])
      .where('action', '=', 'admin.audit_verified')
      .orderBy('seq', 'desc')
      .executeTakeFirstOrThrow();
    expect(noted.metadata).toMatchObject({ operator: 'operator', ok: false });
    expect(AUDIT_VERIFY_ROWS).toBeGreaterThanOrEqual(1000);

    expect(auditState.checkedAt).toBe(0);
    await runPeriodic(t.ctx);
    expect(auditState.checkedAt).toBeGreaterThan(0);
    expect(auditState.ok).toBe(false);
    const scrape = await t.app.inject({
      method: 'GET',
      url: '/metrics',
      headers: { authorization: `Bearer ${METRICS}` },
    });
    expect(scrape.body).toMatch(/^caime_audit_chain_ok 0$/m);
    // The head as it stands now: the operator's own looks were sealed since `whole` was read.
    const head = await t.ctx.db
      .selectFrom('audit_log')
      .select(sql<number>`max(seq)::int`.as('seq'))
      .executeTakeFirstOrThrow();
    expect(head.seq).toBe(whole.lastSeq + 1);
    expect(scrape.body).toMatch(new RegExp(`^caime_audit_chain_seq ${head.seq}$`, 'm'));
  });
});
