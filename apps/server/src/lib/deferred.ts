/**
 * Work that runs after a response (`ctx.defer`): a mail, a message's effects, a suggestion.
 * At most `DEFER_CONCURRENCY` run at once on an instance and the rest wait their turn in order
 * (M16 D2a, review 2026-10-17 §4 M: unbounded, a burst of messages started every one's effects
 * at once against the pool the requests share). What runs and what waits is on `/metrics`
 * (`caime_deferred{state}`) and a failure is counted by its label, a name from the code.
 */
import type { FastifyBaseLogger } from 'fastify';
import type { Metrics } from './metrics';

/** How many run at once: the job loop's own number, leaving the pool's other slots to requests. */
export const DEFER_CONCURRENCY = 8;

export interface DeferredQueue {
  defer(label: string, work: () => Promise<unknown>): void;
  /** Until nothing runs or waits (tests, shutdown). */
  flush(): Promise<void>;
  readonly running: number;
  readonly waiting: number;
}

export function deferredQueue(opts: {
  log: FastifyBaseLogger;
  metrics: Metrics;
  isTest: boolean;
  concurrency?: number;
}): DeferredQueue {
  const concurrency = opts.concurrency ?? DEFER_CONCURRENCY;
  const queue: Array<{ label: string; work: () => Promise<unknown> }> = [];
  const pending = new Set<Promise<unknown>>();
  let running = 0;
  const count = () => {
    opts.metrics.deferred.set({ state: 'running' }, running);
    opts.metrics.deferred.set({ state: 'waiting' }, queue.length);
  };
  const start = (label: string, work: () => Promise<unknown>) => {
    running += 1;
    const p: Promise<unknown> = Promise.resolve()
      .then(work)
      .catch((err) => {
        opts.metrics.deferredFailed.inc({ label });
        opts.log.error({ err }, `deferred ${label} failed`);
        if (opts.isTest) console.error(`deferred ${label} failed`, err);
      })
      .finally(() => {
        running -= 1;
        pending.delete(p);
        const next = queue.shift();
        if (next) start(next.label, next.work);
        count();
      });
    pending.add(p);
    count();
  };
  return {
    defer(label, work) {
      if (running < concurrency) start(label, work);
      else {
        queue.push({ label, work });
        count();
      }
    },
    async flush() {
      while (pending.size || queue.length) await Promise.all([...pending]);
    },
    get running() {
      return running;
    },
    get waiting() {
      return queue.length;
    },
  };
}
