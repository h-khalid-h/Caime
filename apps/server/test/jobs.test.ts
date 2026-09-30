import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { enqueue, nextJobDueInMs, registerJob, runDueJobs, startWorkers } from '../src/lib/jobs';
import { createTestApp, type TestApp } from './helpers';

let t: TestApp;

beforeAll(async () => {
  t = await createTestApp();
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
