/**
 * GET /metrics (PRD §81): the server's counts and timings in Prometheus's text format, for the
 * operator's scraper, behind METRICS_TOKEN. Without the token it doesn't exist.
 */
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../context';
import { requireOperator } from '../lib/operator';

export async function metricsRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get('/metrics', async (req, reply) => {
    requireOperator(ctx, req, ctx.config.METRICS_TOKEN);
    return reply
      .header('content-type', 'text/plain; version=0.0.4; charset=utf-8')
      .header('cache-control', 'no-store')
      .send(ctx.metrics.render());
  });
}
