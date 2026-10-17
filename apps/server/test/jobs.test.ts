import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  claimPeriodic,
  enqueue,
  nextJobDueInMs,
  registerJob,
  runDueJobs,
  startWorkers,
} from '../src/lib/jobs';
import { createTestApp, type TestApp } from './helpers';

let t: TestApp;

const ADMIN = 'operator-token-for-the-jobs-test-0123456789';
const METRICS = 'metrics-token-for-the-jobs-test-0123456789';
const operator = (method: 'GET' | 'POST', url: string) =>
  t.app.inject({ method, url, headers: { authorization: `Bearer ${ADMIN}` } });

beforeAll(async () => {
  t = await createTestApp({ ADMIN_TOKEN: ADMIN, METRICS_TOKEN: METRICS });
});

afterAll(async () => {
  await t.close();
});

describe('jobs', () => {
  it('a slow job doesn’t hold up the others', async () => {
    // Each job waits until the other has started: run one at a time, neither would finish.
    let started = 0;
    let bothStarted!: () => void;
    const barrier = new Promise<void>((resolve) => {
      bothStarted = resolve;
    });
    registerJob('test_barrier', async () => {
      started += 1;
      if (started === 2) bothStarted();
      await barrier;
    });
    await enqueue(t.ctx, 'test_barrier', { n: 1 });
    await enqueue(t.ctx, 'test_barrier', { n: 2 });
    expect(await runDueJobs(t.ctx)).toBe(2);
    const left = await t.ctx.db
      .selectFrom('jobs')
      .select('id')
      .where('done_at', 'is', null)
      .execute();
    expect(left).toEqual([]);
  });

  it('the worker wakes when a job is enqueued, and knows when the next one is due', async () => {
    const ran: number[] = [];
    registerJob('test_wake', async (_ctx, payload) => {
      ran.push(payload.n as number);
    });
    const stop = startWorkers(t.ctx);
    try {
      // Nothing due: the loop rests; a job for now wakes it through NOTIFY, not a poll.
      await new Promise((r) => setTimeout(r, 300));
      await enqueue(t.ctx, 'test_wake', { n: 1 });
      const started = Date.now();
      while (!ran.length && Date.now() - started < 3000)
        await new Promise((r) => setTimeout(r, 25));
      expect(ran).toEqual([1]);
      expect(Date.now() - started).toBeLessThan(1500);
    } finally {
      stop();
    }
    // A job for later says how long the loop may rest.
    await enqueue(
      t.ctx,
      'test_wake',
      { n: 2 },
      { runAt: new Date(t.ctx.now().getTime() + 20_000) },
    );
    const due = await nextJobDueInMs(t.ctx);
    expect(due).toBeGreaterThan(15_000);
    expect(due).toBeLessThanOrEqual(20_000);
    expect(await runDueJobs(t.ctx)).toBe(0);
  });
});

describe('the dead-letter, the time limit and one run per interval (review 2026-10-17)', () => {
  it('a job out of attempts is dead: counted, listed with its error, retried by hand', async () => {
    let works = false;
    let tries = 0;
    registerJob('test_dies', async () => {
      tries += 1;
      if (!works) throw new Error('the provider said no');
    });
    await enqueue(t.ctx, 'test_dies', { n: 1 }, { maxAttempts: 2 });
    // (Jobs the tests above left due may run alongside: only this one's row is looked at.)
    await runDueJobs(t.ctx);
    expect(tries).toBe(1);
    // Failed once: due again after its backoff, not dead yet.
    const after = await t.ctx.db
      .selectFrom('jobs')
      .select(['dead_at', 'attempts', 'last_error'])
      .where('kind', '=', 'test_dies')
      .executeTakeFirstOrThrow();
    expect(after).toMatchObject({ dead_at: null, attempts: 1, last_error: 'the provider said no' });
    t.clock.advance(31_000);
    await runDueJobs(t.ctx);
    expect(tries).toBe(2);
    const dead = await t.ctx.db
      .selectFrom('jobs')
      .select(['id', 'dead_at', 'attempts'])
      .where('kind', '=', 'test_dies')
      .executeTakeFirstOrThrow();
    expect(dead.dead_at).not.toBeNull();
    expect(dead.attempts).toBe(2);
    // Out of the queue: however long it waits, it isn't tried again; and the gauge counts it.
    t.clock.advance(3_600_000);
    await runDueJobs(t.ctx);
    expect(tries).toBe(2);
    const scraped = await t.app.inject({
      url: '/metrics',
      headers: { authorization: `Bearer ${METRICS}` },
    });
    expect(scraped.body).toContain('caime_jobs_dead 1');
    // The operator sees it, without its payload, and gives it its attempts back.
    const listed = await operator('GET', '/v1/admin/jobs');
    expect(listed.statusCode).toBe(200);
    expect(listed.json().dead).toBe(1);
    expect(listed.json().jobs.find((j: { kind: string }) => j.kind === 'test_dies')).toMatchObject({
      id: dead.id,
      kind: 'test_dies',
      attempts: 2,
      maxAttempts: 2,
      lastError: 'the provider said no',
    });
    expect(JSON.stringify(listed.json())).not.toContain('"n":1');
    works = true;
    expect((await operator('POST', `/v1/admin/jobs/${dead.id}/retry`)).statusCode).toBe(200);
    expect((await operator('POST', '/v1/admin/jobs/999999999/retry')).statusCode).toBe(404);
    await runDueJobs(t.ctx);
    expect(tries).toBe(3);
    const done = await t.ctx.db
      .selectFrom('jobs')
      .select(['done_at', 'dead_at', 'last_error'])
      .where('id', '=', dead.id)
      .executeTakeFirstOrThrow();
    expect(done.done_at).not.toBeNull();
    expect(done.dead_at).toBeNull();
    expect(done.last_error).toBeNull();
    expect((await operator('GET', '/v1/admin/jobs')).json().dead).toBe(0);
  });

  it('a job past its kind’s time limit counts as failed, and the last one dies with that reason', async () => {
    registerJob('test_slow', () => new Promise<void>((r) => setTimeout(r, 400)), {
      timeoutMs: 50,
    });
    await enqueue(t.ctx, 'test_slow', {}, { maxAttempts: 1 });
    await runDueJobs(t.ctx);
    const row = await t.ctx.db
      .selectFrom('jobs')
      .select(['dead_at', 'last_error'])
      .where('kind', '=', 'test_slow')
      .executeTakeFirstOrThrow();
    expect(row.dead_at).not.toBeNull();
    expect(row.last_error).toMatch(/timed out after 50 ms/);
  });

  it('a periodic task is claimed by one instance per interval, and taken over after one', async () => {
    const task = { name: 'test.sweep', everyMs: 60_000 };
    expect(await claimPeriodic(t.ctx, task, 'instance-a')).toBe(true);
    expect(await claimPeriodic(t.ctx, task, 'instance-b')).toBe(false);
    t.clock.advance(59_000);
    expect(await claimPeriodic(t.ctx, task, 'instance-b')).toBe(false);
    t.clock.advance(2_000);
    expect(await claimPeriodic(t.ctx, task, 'instance-b')).toBe(true);
    const run = await t.ctx.db
      .selectFrom('periodic_runs')
      .select(['instance', 'finished_at'])
      .where('name', '=', 'test.sweep')
      .executeTakeFirstOrThrow();
    expect(run).toEqual({ instance: 'instance-b', finished_at: null });
  });
});
