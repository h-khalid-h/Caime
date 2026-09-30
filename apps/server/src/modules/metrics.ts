/**
 * GET /metrics (PRD §81): the server's counts and timings in Prometheus's text format, for the
 * operator's scraper, behind METRICS_TOKEN. Without the token it doesn't exist.
 */
import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import type { AppContext } from '../context';
import { requireOperator } from '../lib/operator';

export async function metricsRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get('/metrics', async (req, reply) => {
    requireOperator(ctx, req, ctx.config.METRICS_TOKEN);
    // The queue as it is now: a stuck worker shows as jobs that wait and age.
    const q = await ctx.db
      .selectFrom('jobs')
      .select([
        sql<number>`count(*)::int`.as('queued'),
        sql<number>`coalesce(extract(epoch from (now() - min(run_at) filter (where run_at <= now() and locked_at is null))), 0)::int`.as(
          'oldest',
        ),
      ])
      .where('done_at', 'is', null)
      .executeTakeFirst();
    ctx.metrics.jobsQueued.set({}, q?.queued ?? 0);
    ctx.metrics.jobsOldestSeconds.set({}, Math.max(0, q?.oldest ?? 0));
    return reply
      .header('content-type', 'text/plain; version=0.0.4; charset=utf-8')
      .header('cache-control', 'no-store')
      .send(ctx.metrics.render());
  });
}
