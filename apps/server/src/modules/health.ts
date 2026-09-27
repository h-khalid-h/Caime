import type { AboutView } from '@caishy/core';
import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import type { AppContext } from '../context';

export async function healthRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get('/healthz', async () => ({ ok: true }));
  // Where this Caishy's policies and help live, as its operator set them: never a domain of
  // the code's own.
  app.get('/about', async (): Promise<AboutView> => ctx.config.aboutLinks);
  app.get('/readyz', async (_req, reply) => {
    try {
      await sql`select 1`.execute(ctx.db);
      return { ok: true };
    } catch {
      return reply.status(503).send({ ok: false });
    }
  });
}
