/**
 * `/.well-known/security.txt` and `/.well-known/change-password` (`lib/well-known.ts`): plain
 * text cached an hour, and a redirect to Settings · Security on `PUBLIC_URL`.
 */
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../context';
import { CHANGE_PASSWORD_PATH, securityTxt } from '../lib/well-known';

export async function wellKnownRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get('/.well-known/security.txt', async (_req, reply) =>
    reply
      .header('cache-control', 'public, max-age=3600')
      .type('text/plain; charset=utf-8')
      .send(securityTxt(ctx.config, ctx.now())),
  );
  app.get('/.well-known/change-password', async (_req, reply) =>
    reply.redirect(`${ctx.config.PUBLIC_URL}${CHANGE_PASSWORD_PATH}`, 302),
  );
}
