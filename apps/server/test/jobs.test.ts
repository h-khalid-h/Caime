import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { enqueue, registerJob, runDueJobs } from '../src/lib/jobs';
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
});
