/**
 * Background work (ADR-6): a Postgres job queue claimed with FOR UPDATE SKIP LOCKED, so any number
 * of instances can run workers and nothing is lost on restart; plus periodic scans (reminders,
 * held notifications, retention) that are idempotent by construction.
 *
 * The worker loop sleeps until something is due (the next job's time, the next periodic task,
 * or a NOTIFY from `enqueue`), never polling by the second (docs/RESOURCES.md): an idle server
 * asks the queue as often as its soonest sweep, and a job enqueued now runs now.
 */
import { hostname } from 'node:os';
import { type Selectable, sql } from 'kysely';
import type { AppContext } from '../context';
import type { JobsTable } from '../db/schema';

export type JobHandler = (ctx: AppContext, payload: Record<string, unknown>) => Promise<void>;
export type PeriodicTask = {
  name: string;
  everyMs: number;
  run: (ctx: AppContext) => Promise<void>;
  /**
   * Long work (a sweep of old records): the loop starts it and goes on with jobs and the other
   * tasks meanwhile, and never starts it again while it's still going.
   */
  background?: boolean;
};

const handlers = new Map<string, JobHandler>();
const periodic: PeriodicTask[] = [];
/** `enqueue` says so here, and every instance's loop wakes at once. */
export const JOBS_CHANNEL = 'caime_jobs';
/** However quiet, the loop looks again after this long (a job retried, a clock nudged). */
const IDLE_MAX_MS = 30_000;

export function registerJob(kind: string, handler: JobHandler): void {
  handlers.set(kind, handler);
}

export function registerPeriodic(task: PeriodicTask): void {
  if (!periodic.some((p) => p.name === task.name)) periodic.push(task);
}

export async function enqueue(
  ctx: AppContext,
  kind: string,
  payload: Record<string, unknown>,
  opts: { runAt?: Date; dedupeKey?: string; maxAttempts?: number } = {},
): Promise<void> {
  await ctx.db
    .insertInto('jobs')
    .values({
      kind,
      payload: JSON.stringify(payload),
      run_at: opts.runAt ?? ctx.now(),
      dedupe_key: opts.dedupeKey ?? null,
      max_attempts: opts.maxAttempts ?? 5,
    })
    .onConflict((oc) => oc.column('dedupe_key').doNothing())
    .execute();
  // Due before the loop's longest rest could end (M24: Cai's reply, 800 ms out, waited for the
  // next look): wake it, and it rests again until this one. One due later runs at its time.
  if (!opts.runAt || opts.runAt.getTime() <= ctx.now().getTime() + IDLE_MAX_MS)
    await sql`select pg_notify(${JOBS_CHANNEL}, '')`.execute(ctx.db);
}

/** How long until the soonest job that isn't done, or null when none waits. */
export async function nextJobDueInMs(ctx: AppContext): Promise<number | null> {
  const row = await ctx.db
    .selectFrom('jobs')
    .select(sql<Date | null>`min(run_at)`.as('at'))
    .where('done_at', 'is', null)
    .where(sql<boolean>`attempts < max_attempts`)
    .executeTakeFirst();
  if (!row?.at) return null;
  return Math.max(0, new Date(row.at).getTime() - ctx.now().getTime());
}

const WORKER_ID = `${hostname()}:${process.pid}`;
/** Jobs run side by side, so one that waits on the network (a slow webhook) holds only its slot. */
const CONCURRENCY = 8;

/** How many batches one call claims before it lets the periodic tasks have their turn. */
const BATCHES_PER_RUN = 4;

/**
 * Claim and run every job that is due, `CONCURRENCY` at a time. A slot that runs out of work
 * claims another batch while the others are still busy (M23: the whole batch was awaited
 * before anything new was claimed, so a slow webhook held seven idle slots), up to
 * `BATCHES_PER_RUN`; then the loop looks at its periodic tasks and comes straight back.
 * Returns how many ran.
 */
export async function runDueJobs(ctx: AppContext, limit = 50): Promise<number> {
  const queue = await claimDue(ctx, limit);
  if (!queue.length) return 0;
  let batches = 1;
  let ran = 0;
  // One claim at a time, shared by every slot that finds the queue empty.
  let refilling: Promise<boolean> | null = null;
  const refill = () => {
    if (!refilling)
      refilling = (async () => {
        if (batches >= BATCHES_PER_RUN) return false;
        const more = await claimDue(ctx, limit);
        batches++;
        queue.push(...more);
        return more.length > 0;
      })().finally(() => {
        refilling = null;
      });
    return refilling;
  };
  const slot = async () => {
    for (;;) {
      const job = queue.shift();
      if (!job) {
        if (await refill()) continue;
        return;
      }
      await runJob(ctx, job);
      ran++;
    }
  };
  const slots = await Promise.allSettled(
    Array.from({ length: Math.min(CONCURRENCY, queue.length) }, slot),
  );
  const failed = slots.find((s) => s.status === 'rejected');
  if (failed) throw failed.reason;
  return ran;
}

/** Every job due now that nobody holds, claimed for this worker: at most `limit`. */
async function claimDue(ctx: AppContext, limit: number): Promise<Selectable<JobsTable>[]> {
  return ctx.db
    .updateTable('jobs')
    .set({ locked_at: ctx.now(), locked_by: WORKER_ID, attempts: sql`attempts + 1` })
    .where(
      'id',
      'in',
      ctx.db
        .selectFrom('jobs')
        .select('id')
        .where('done_at', 'is', null)
        .where('run_at', '<=', ctx.now())
        .where((eb) =>
          eb.or([
            eb('locked_at', 'is', null),
            eb('locked_at', '<', new Date(ctx.now().getTime() - 5 * 60_000)),
          ]),
        )
        .where(sql<boolean>`attempts < max_attempts`)
        .orderBy('run_at')
        .limit(limit)
        .forUpdate()
        .skipLocked(),
    )
    .returningAll()
    .execute();
}

async function runJob(ctx: AppContext, job: Selectable<JobsTable>): Promise<void> {
  const handler = handlers.get(job.kind);
  const started = performance.now();
  const took = () =>
    ctx.metrics.jobSeconds.observe({ kind: job.kind }, (performance.now() - started) / 1000);
  try {
    if (!handler) throw new Error(`no handler for ${job.kind}`);
    await handler(ctx, (job.payload ?? {}) as Record<string, unknown>);
    await ctx.db
      .updateTable('jobs')
      .set({ done_at: ctx.now(), locked_at: null, last_error: null })
      .where('id', '=', job.id)
      .execute();
    took();
    ctx.metrics.jobs.inc({ kind: job.kind, outcome: 'done' });
  } catch (err) {
    took();
    ctx.metrics.jobs.inc({ kind: job.kind, outcome: 'failed' });
    const backoff = Math.min(60 * 60_000, 2 ** job.attempts * 15_000);
    await ctx.db
      .updateTable('jobs')
      .set({
        locked_at: null,
        last_error: String((err as Error).message ?? err).slice(0, 500),
        run_at: new Date(ctx.now().getTime() + backoff),
      })
      .where('id', '=', job.id)
      .execute();
    ctx.log.warn({ err, kind: job.kind }, 'job failed');
  }
}

export async function runPeriodic(ctx: AppContext): Promise<void> {
  for (const task of periodic) {
    try {
      await task.run(ctx);
    } catch (err) {
      ctx.log.warn({ err, task: task.name }, 'periodic task failed');
    }
  }
}

export function startWorkers(ctx: AppContext): () => void {
  let stopped = false;
  const lastRun = new Map<string, number>();
  const going = new Set<string>();
  // The loop's rest, cut short by a stop or by a job enqueued for now.
  let wake: (() => void) | null = null;
  const rest = (ms: number) =>
    new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        wake = null;
        resolve();
      }, ms);
      wake = () => {
        clearTimeout(timer);
        wake = null;
        resolve();
      };
    });
  let unlisten: (() => void) | null = null;
  void ctx.bus
    .onNotify(JOBS_CHANNEL, () => wake?.())
    .then((off) => {
      if (stopped) off();
      else unlisten = off;
    })
    .catch((err) => ctx.log.warn({ err }, 'job queue: not listening; polling instead'));
  const loop = async () => {
    while (!stopped) {
      try {
        const ran = await runDueJobs(ctx);
        const now = Date.now();
        for (const task of periodic) {
          if (going.has(task.name)) continue;
          if (now - (lastRun.get(task.name) ?? 0) >= task.everyMs) {
            lastRun.set(task.name, now);
            const run = task
              .run(ctx)
              .catch((err) => ctx.log.warn({ err, task: task.name }, 'periodic task failed'));
            if (!task.background) {
              await run;
              continue;
            }
            going.add(task.name);
            void run.finally(() => going.delete(task.name));
          }
        }
        if (ran > 0) continue;
        // Nothing ran: rest until the soonest thing is due, a job or a periodic task.
        const jobIn = await nextJobDueInMs(ctx);
        const periodicIn = Math.min(
          ...periodic.map((task) => task.everyMs - (Date.now() - (lastRun.get(task.name) ?? 0))),
        );
        const delay = Math.max(0, Math.min(IDLE_MAX_MS, jobIn ?? IDLE_MAX_MS, periodicIn));
        if (delay > 0 && !stopped) await rest(delay);
      } catch (err) {
        ctx.log.error({ err }, 'worker loop error');
        await rest(5000);
      }
    }
  };
  void loop();
  return () => {
    stopped = true;
    unlisten?.();
    wake?.();
  };
}
