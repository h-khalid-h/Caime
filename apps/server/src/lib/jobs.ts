/**
 * Background work (ADR-6): a Postgres job queue claimed with FOR UPDATE SKIP LOCKED, so any number
 * of instances can run workers and nothing is lost on restart; plus periodic scans (reminders,
 * held notifications, retention) that are idempotent by construction.
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
};

const handlers = new Map<string, JobHandler>();
const periodic: PeriodicTask[] = [];

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
}

const WORKER_ID = `${hostname()}:${process.pid}`;
/** Jobs run side by side, so one that waits on the network (a slow webhook) holds only its slot. */
const CONCURRENCY = 8;

/** Claim and run every job that is due. Returns how many ran. */
export async function runDueJobs(ctx: AppContext, limit = 50): Promise<number> {
  const claimed = await ctx.db
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
  let next = 0;
  const slot = async () => {
    for (let job = claimed[next++]; job; job = claimed[next++]) await runJob(ctx, job);
  };
  const slots = await Promise.allSettled(
    Array.from({ length: Math.min(CONCURRENCY, claimed.length) }, slot),
  );
  const failed = slots.find((s) => s.status === 'rejected');
  if (failed) throw failed.reason;
  return claimed.length;
}

async function runJob(ctx: AppContext, job: Selectable<JobsTable>): Promise<void> {
  const handler = handlers.get(job.kind);
  try {
    if (!handler) throw new Error(`no handler for ${job.kind}`);
    await handler(ctx, (job.payload ?? {}) as Record<string, unknown>);
    await ctx.db
      .updateTable('jobs')
      .set({ done_at: ctx.now(), locked_at: null, last_error: null })
      .where('id', '=', job.id)
      .execute();
  } catch (err) {
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
  const loop = async () => {
    while (!stopped) {
      try {
        const ran = await runDueJobs(ctx);
        const now = Date.now();
        for (const task of periodic) {
          if (now - (lastRun.get(task.name) ?? 0) >= task.everyMs) {
            lastRun.set(task.name, now);
            await task
              .run(ctx)
              .catch((err) => ctx.log.warn({ err, task: task.name }, 'periodic task failed'));
          }
        }
        if (ran === 0) await new Promise((r) => setTimeout(r, 1000));
      } catch (err) {
        ctx.log.error({ err }, 'worker loop error');
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  };
  void loop();
  return () => {
    stopped = true;
  };
}
