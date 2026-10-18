import type pg from 'pg';
import { describe, expect, it } from 'vitest';
import { deferredQueue } from '../src/lib/deferred';
import { createMetrics } from '../src/lib/metrics';

/**
 * Work after a response runs a few at a time and the rest in order (M16 D2a): never all at once
 * against the pool the requests share, counted on /metrics, a failure counted by its label and
 * never stopping what's behind it, and `flush` waits for all of it.
 */
const quiet = { error() {} } as never;
const metricsFor = () =>
  createMetrics({ totalCount: 0, idleCount: 0, waitingCount: 0 } as unknown as pg.Pool);
const lines = (m: ReturnType<typeof createMetrics>) => [
  ...m.deferred.lines(),
  ...m.deferredFailed.lines(),
];

describe('work after a response (M16 D2a)', () => {
  it('runs a few at once, the rest in order, and flush waits for all of it', async () => {
    const metrics = metricsFor();
    const q = deferredQueue({ log: quiet, metrics, isTest: false, concurrency: 3 });
    const order: number[] = [];
    const gates: Array<() => void> = [];
    let most = 0;
    for (let i = 0; i < 10; i++)
      q.defer('test.work', async () => {
        most = Math.max(most, q.running);
        await new Promise<void>((done) => gates.push(done));
        order.push(i);
      });
    await Promise.resolve();
    expect(q.running).toBe(3);
    expect(q.waiting).toBe(7);
    expect(lines(metrics)).toContain('caime_deferred{state="waiting"} 7');
    // Each one done lets the next in, in the order they came.
    const release = async () => {
      while (gates.length || q.running) {
        gates.shift()?.();
        await new Promise((r) => setTimeout(r, 0));
      }
    };
    await Promise.all([release(), q.flush()]);
    expect(order).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(most).toBeLessThanOrEqual(3);
    expect(q.running).toBe(0);
    expect(q.waiting).toBe(0);
    expect(lines(metrics)).toContain('caime_deferred{state="running"} 0');
  });

  it('counts a failure by its label and keeps going', async () => {
    const metrics = metricsFor();
    const q = deferredQueue({ log: quiet, metrics, isTest: false, concurrency: 1 });
    let after = false;
    q.defer('email.code', async () => {
      throw new Error('the mail server is away');
    });
    // A throw before any await counts the same.
    q.defer('email.code', (() => {
      throw new Error('at once');
    }) as () => Promise<unknown>);
    q.defer('after-message', async () => {
      after = true;
    });
    await q.flush();
    expect(after).toBe(true);
    expect(lines(metrics)).toContain('caime_deferred_failed_total{label="email.code"} 2');
  });
});
