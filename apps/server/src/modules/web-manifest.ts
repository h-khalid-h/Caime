/**
 * `/manifest.webmanifest` (R120, `lib/web-manifest.ts`): the installed web app's manifest in the
 * language of whoever installs it (`?lang=`, else the browser's), cached an hour by language.
 */
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../context';
import { inLanguage } from '../lib/i18n';
import { siteLanguage } from '../lib/site-pages';
import { webManifest } from '../lib/web-manifest';

export async function webManifestRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get('/manifest.webmanifest', async (req, reply) => {
    const { language } = siteLanguage(
      (req.query as Record<string, unknown>).lang,
      req.headers['accept-language'],
    );
    return reply
      .header('cache-control', 'public, max-age=3600')
      .header('vary', 'Accept-Language')
      .type('application/manifest+json')
      .send(inLanguage(language, () => webManifest(language, ctx.config)));
  });
}
