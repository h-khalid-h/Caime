/**
 * GET /metrics (PRD §81): the server's counts and timings in Prometheus's text format, for the
 * operator's scraper, behind METRICS_TOKEN. Without the token it doesn't exist.
 */
import type { FastifyInstance, FastifyReply } from 'fastify';
import { sql } from 'kysely';
import type { AppContext } from '../context';
import { syncGauges } from '../lib/gauges';
import { requireOperator } from '../lib/operator';

export async function metricsRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get('/metrics', async (req, reply): Promise<FastifyReply> => {
    requireOperator(ctx, req, ctx.config.METRICS_TOKEN);
    // What another instance's task found (the backup, the audit check, the probes).
    await syncGauges(ctx);
    // The queue as it is now: a stuck worker shows as jobs that wait and age.
    const q = await ctx.db
      .selectFrom('jobs')
      .select([
        sql<number>`count(*) filter (where dead_at is null)::int`.as('queued'),
        sql<number>`count(*) filter (where dead_at is not null)::int`.as('dead'),
        sql<number>`coalesce(extract(epoch from (now() - min(run_at) filter (where run_at <= now() and locked_at is null and dead_at is null))), 0)::int`.as(
          'oldest',
        ),
      ])
      .where('done_at', 'is', null)
      .executeTakeFirst();
    ctx.metrics.jobsQueued.set({}, q?.queued ?? 0);
    ctx.metrics.jobsDead.set({}, q?.dead ?? 0);
    ctx.metrics.jobsOldestSeconds.set({}, Math.max(0, q?.oldest ?? 0));
    // What waits on the operator (R49, M16 B6): open reports, a child's safety apart, and appeals.
    const waiting = await sql<{ kind: string; waiting: number; oldest: number }>`
      select 'report' as kind, count(*)::int as waiting,
        coalesce(extract(epoch from (now() - min(created_at))), 0)::int as oldest
      from reports where closed_at is null
      union all
      select 'child_safety', count(*)::int,
        coalesce(extract(epoch from (now() - min(created_at))), 0)::int
      from reports where closed_at is null and reason = 'child_safety'
      union all
      select 'appeal', count(*)::int,
        coalesce(extract(epoch from (now() - min(created_at))), 0)::int
      from appeals where decided_at is null`.execute(ctx.db);
    for (const w of waiting.rows) {
      ctx.metrics.moderationWaiting.set({ kind: w.kind }, w.waiting);
      ctx.metrics.moderationOldestSeconds.set({ kind: w.kind }, Math.max(0, w.oldest));
    }
    return reply
      .header('content-type', 'text/plain; version=0.0.4; charset=utf-8')
      .header('cache-control', 'no-store')
      .send(ctx.metrics.render());
  });
}
