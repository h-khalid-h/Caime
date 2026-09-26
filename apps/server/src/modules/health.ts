import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import type { AppContext } from '../context';

export async function healthRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get('/healthz', async () => ({ ok: true }));
  app.get('/readyz', async (_req, reply) => {
    try {
      await sql`select 1`.execute(ctx.db);
      return { ok: true };
    } catch {
      return reply.status(503).send({ ok: false });
    }
  });
}
