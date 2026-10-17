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
    return reply
      .header('content-type', 'text/plain; version=0.0.4; charset=utf-8')
      .header('cache-control', 'no-store')
      .send(ctx.metrics.render());
  });
}
