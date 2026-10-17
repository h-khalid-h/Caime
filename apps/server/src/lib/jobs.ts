/**
 * Background work (ADR-6): a Postgres job queue claimed with FOR UPDATE SKIP LOCKED, so any number
 * of instances can run workers and nothing is lost on restart; plus periodic scans (reminders,
 * held notifications, retention) that are idempotent by construction.
 *
 * The worker loop sleeps until something is due (the next job's time, the next periodic task,
 * or a NOTIFY from `enqueue`), never polling by the second (docs/RESOURCES.md): an idle server
 * asks the queue as often as its soonest sweep, and a job enqueued now runs now.
 *
 * A job that fails its last attempt is dead (`dead_at`; review 2026-10-17 §4 M2): out of the due
 * index, counted on /metrics, listed to the operator with its last error, retried by hand
 * (`retryJob`). While a job runs, its lock is renewed (`HEARTBEAT_MS`), so a lock older than
 * `STALE_LOCK_MS` is a worker that died, never a long job still going; and a job has a time
 * limit (`JOB_TIMEOUT_MS`, or the kind's own), past which it counts as failed. A periodic task
 * runs on one instance per interval (`claimPeriodic`, `periodic_runs`), not on every worker.
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

const handlers = new Map<string, { handler: JobHandler; timeoutMs: number }>();
const periodic: PeriodicTask[] = [];
/** `enqueue` says so here, and every instance's loop wakes at once. */
export const JOBS_CHANNEL = 'caime_jobs';
/** However quiet, the loop looks again after this long (a job retried, a clock nudged). */
const IDLE_MAX_MS = 30_000;
/** A running job renews its lock this often; a lock older than the stale limit is a dead worker's. */
export const HEARTBEAT_MS = 60_000;
export const STALE_LOCK_MS = 5 * 60_000;
/** The most a job may run unless its kind says otherwise: past it, it failed. */
export const JOB_TIMEOUT_MS = 10 * 60_000;

export function registerJob(
  kind: string,
  handler: JobHandler,
  opts: { timeoutMs?: number } = {},
): void {
  handlers.set(kind, { handler, timeoutMs: opts.timeoutMs ?? JOB_TIMEOUT_MS });
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

/** How long until the soonest job that isn't done or dead, or null when none waits. */
export async function nextJobDueInMs(ctx: AppContext): Promise<number | null> {
  const row = await ctx.db
    .selectFrom('jobs')
    .select(sql<Date | null>`min(run_at)`.as('at'))
    .where('done_at', 'is', null)
    .where('dead_at', 'is', null)
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
        .where('dead_at', 'is', null)
        .where('run_at', '<=', ctx.now())
        .where((eb) =>
          eb.or([
            eb('locked_at', 'is', null),
            eb('locked_at', '<', new Date(ctx.now().getTime() - STALE_LOCK_MS)),
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

/** `work`, or an error once `ms` have passed (the work itself goes on; its result is dropped). */
function withTimeout<T>(work: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  return Promise.race([
    work.finally(() => clearTimeout(timer)),
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${what} timed out after ${ms} ms`)), ms);
    }),
  ]);
}

async function runJob(ctx: AppContext, job: Selectable<JobsTable>): Promise<void> {
  const known = handlers.get(job.kind);
  const started = performance.now();
  const took = () =>
    ctx.metrics.jobSeconds.observe({ kind: job.kind }, (performance.now() - started) / 1000);
  // Still going: the lock stays fresh, so no other worker takes a long job as a dead worker's.
  const beat = setInterval(() => {
    void ctx.db
      .updateTable('jobs')
      .set({ locked_at: ctx.now() })
      .where('id', '=', job.id)
      .execute()
      .catch(() => {});
  }, HEARTBEAT_MS);
  beat.unref?.();
  try {
    if (!known) throw new Error(`no handler for ${job.kind}`);
    await withTimeout(
      known.handler(ctx, (job.payload ?? {}) as Record<string, unknown>),
      known.timeoutMs,
      job.kind,
    );
    await ctx.db
      .updateTable('jobs')
      .set({ done_at: ctx.now(), locked_at: null, last_error: null })
      .where('id', '=', job.id)
      .execute();
    took();
    ctx.metrics.jobs.inc({ kind: job.kind, outcome: 'done' });
  } catch (err) {
    took();
    const error = String((err as Error).message ?? err).slice(0, 500);
    // Its last attempt (`attempts` was counted at the claim): dead, for the operator to see.
    if (job.attempts >= job.max_attempts) {
      await ctx.db
        .updateTable('jobs')
        .set({ locked_at: null, last_error: error, dead_at: ctx.now() })
        .where('id', '=', job.id)
        .execute();
      ctx.metrics.jobs.inc({ kind: job.kind, outcome: 'dead' });
      ctx.log.error({ err, kind: job.kind, jobId: job.id }, 'job dead: out of attempts');
      return;
    }
    ctx.metrics.jobs.inc({ kind: job.kind, outcome: 'failed' });
    const backoff = Math.min(60 * 60_000, 2 ** job.attempts * 15_000);
    await ctx.db
      .updateTable('jobs')
      .set({
        locked_at: null,
        last_error: error,
        run_at: new Date(ctx.now().getTime() + backoff),
      })
      .where('id', '=', job.id)
      .execute();
    ctx.log.warn({ err, kind: job.kind }, 'job failed');
  } finally {
    clearInterval(beat);
  }
}

/** A job the operator may need to see: dead, or failing (tried and due again). Never its payload. */
export interface TroubledJob {
  id: string;
  kind: string;
  attempts: number;
  maxAttempts: number;
  runAt: string;
  lockedAt: string | null;
  deadAt: string | null;
  lastError: string | null;
  createdAt: string;
}

export async function troubledJobs(
  ctx: AppContext,
  limit = 100,
): Promise<{ jobs: TroubledJob[]; dead: number }> {
  const rows = await ctx.db
    .selectFrom('jobs')
    .select([
      'id',
      'kind',
      'attempts',
      'max_attempts',
      'run_at',
      'locked_at',
      'dead_at',
      'last_error',
      'created_at',
    ])
    .where((eb) =>
      eb.or([
        eb('dead_at', 'is not', null),
        eb.and([
          eb('done_at', 'is', null),
          eb('attempts', '>', 0),
          eb('last_error', 'is not', null),
        ]),
      ]),
    )
    .orderBy(sql`coalesce(dead_at, run_at)`, 'desc')
    .limit(limit)
    .execute();
  const dead = await ctx.db
    .selectFrom('jobs')
    .select(sql<number>`count(*)::int`.as('n'))
    .where('dead_at', 'is not', null)
    .executeTakeFirst();
  return {
    jobs: rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      attempts: r.attempts,
      maxAttempts: r.max_attempts,
      runAt: r.run_at.toISOString(),
      lockedAt: r.locked_at?.toISOString() ?? null,
      deadAt: r.dead_at?.toISOString() ?? null,
      lastError: r.last_error,
      createdAt: r.created_at.toISOString(),
    })),
    dead: dead?.n ?? 0,
  };
}

/** A dead job given its attempts back and run now; false when there's no such job. */
export async function retryJob(ctx: AppContext, id: string): Promise<boolean> {
  const row = await ctx.db
    .updateTable('jobs')
    .set({ dead_at: null, attempts: 0, locked_at: null, run_at: ctx.now() })
    .where('id', '=', id)
    .where('done_at', 'is', null)
    .returning('id')
    .executeTakeFirst();
  if (!row) return false;
  await sql`select pg_notify(${JOBS_CHANNEL}, '')`.execute(ctx.db);
  return true;
}

/** Every periodic task, run once, claims and all (a test's direct runner; the loop claims). */
export async function runPeriodic(ctx: AppContext): Promise<void> {
  for (const task of periodic) {
    try {
      await task.run(ctx);
    } catch (err) {
      ctx.log.warn({ err, task: task.name }, 'periodic task failed');
    }
  }
}

/**
 * Whether this instance runs `task` now: the one claim an interval gets across every instance
 * (`periodic_runs`). A claim older than the task's interval is a worker that died mid-run, and
 * is taken over.
 */
export async function claimPeriodic(
  ctx: AppContext,
  task: Pick<PeriodicTask, 'name' | 'everyMs'>,
  instance = WORKER_ID,
): Promise<boolean> {
  const now = ctx.now();
  const since = new Date(now.getTime() - task.everyMs);
  const row = await sql<{ name: string }>`
    insert into periodic_runs (name, started_at, finished_at, instance)
    values (${task.name}, ${now}, null, ${instance})
    on conflict (name) do update
      set started_at = excluded.started_at, finished_at = null, instance = excluded.instance
      where periodic_runs.started_at < ${since}
    returning name
  `.execute(ctx.db);
  return row.rows.length > 0;
}

async function finishPeriodic(ctx: AppContext, name: string): Promise<void> {
  await ctx.db
    .updateTable('periodic_runs')
    .set({ finished_at: ctx.now() })
    .where('name', '=', name)
    .execute()
    .catch(() => {});
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
            // Asked once an interval, whoever wins it: the loser waits its own interval too.
            lastRun.set(task.name, now);
            if (!(await claimPeriodic(ctx, task))) continue;
            const run = task
              .run(ctx)
              .catch((err) => ctx.log.warn({ err, task: task.name }, 'periodic task failed'))
              .finally(() => finishPeriodic(ctx, task.name));
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
