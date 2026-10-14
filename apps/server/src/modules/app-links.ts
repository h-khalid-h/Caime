/**
 * `/.well-known/apple-app-site-association` and `/.well-known/assetlinks.json` (R35,
 * `lib/app-links.ts`): JSON, on every name the service answers (`MACHINE_PATHS`), cached an hour,
 * and the same 404 as any missing path until the phone apps' ids are configured.
 */
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../context';
import { appleAppSiteAssociation, assetLinks } from '../lib/app-links';

export async function appLinkRoutes(app: FastifyInstance, ctx: AppContext) {
  const apple = appleAppSiteAssociation(ctx.config);
  const android = assetLinks(ctx.config);
  app.get('/.well-known/apple-app-site-association', async (_req, reply) => {
    if (!apple) return reply.callNotFound();
    return reply
      .header('cache-control', 'public, max-age=3600')
      .type('application/json')
      .send(apple);
  });
  app.get('/.well-known/assetlinks.json', async (_req, reply) => {
    if (!android) return reply.callNotFound();
    return reply
      .header('cache-control', 'public, max-age=3600')
      .type('application/json')
      .send(android);
  });
}
