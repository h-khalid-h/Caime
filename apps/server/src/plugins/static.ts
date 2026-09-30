/**
 * Serves the exported web app from WEB_DIR on the same origin as the API (ADR-7: the session
 * cookie stays first-party). Hashed bundles are cached forever; the HTML never is, so a deploy
 * reaches everyone on their next load. Any unknown non-API GET gets the app (client routing).
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AppContext } from '../context';
import {
  injectPublic,
  PERMISSIONS_POLICY,
  publicPageFor,
  renderPublic,
  robotsTxt,
  sitemapXml,
} from '../lib/public-pages';
import { SESSION_COOKIE } from './auth';

export function webCsp(publicUrl: string): string {
  const ws = publicUrl.replace(/^http/, 'ws');
  return [
    "default-src 'self'",
    "script-src 'self'",
    // react-native-web writes its styles at runtime.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self' ${ws}`,
    "media-src 'self' blob:",
    "worker-src 'self'",
    "manifest-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
}

/** Every file of the build under _expo/static, as the paths the app asks for them by. */
export function builtFiles(dir: string): string[] {
  // Its scripts, and the fonts and images they use (without which it opens offline in the
  // wrong font).
  return [join(dir, '_expo', 'static'), join(dir, 'assets')]
    .filter((root) => existsSync(root))
    .flatMap((root) =>
      (readdirSync(root, { recursive: true }) as string[])
        .map((name) => join(root, name))
        .filter((path) => statSync(path).isFile()),
    )
    .map((path) => `/${relative(dir, path).split(sep).join('/')}`)
    .sort();
}

export interface WebApp {
  /** Answer a request with the app shell when it's a page navigation outside the API. */
  handles: (req: FastifyRequest) => boolean;
  serve: (req: FastifyRequest, reply: FastifyReply) => Promise<FastifyReply>;
}

export async function registerWeb(app: FastifyInstance, ctx: AppContext): Promise<WebApp | null> {
  const dir = ctx.config.WEB_DIR ? resolve(ctx.config.WEB_DIR) : null;
  if (!dir || !existsSync(join(dir, 'index.html'))) return null;
  const csp = webCsp(ctx.config.PUBLIC_URL);
  await app.register(fastifyStatic, {
    root: dir,
    prefix: '/',
    index: false,
    wildcard: true,
    decorateReply: true,
    setHeaders(res, path) {
      if (path.includes(`${join('_expo', 'static')}`)) {
        res.header('cache-control', 'public, max-age=31536000, immutable');
      } else if (path.endsWith('sw.js')) {
        // The service worker: a new one reaches every browser on its next check.
        res.header('cache-control', 'no-cache');
      } else if (path.endsWith('.html')) {
        res.header('cache-control', 'no-cache');
        res.header('content-security-policy', csp);
      } else {
        res.header('cache-control', 'public, max-age=3600');
      }
    },
  });
  const template = readFileSync(join(dir, 'index.html'), 'utf8');
  /**
   * The shell, with the page's own head and plain body in it (R44): the landing page for a
   * visitor who isn't signed in, a person's or an organization's public face, a 404 for a
   * handle nobody has, and for the app's own screens a shell that asks not to be indexed.
   */
  const serve = async (req: FastifyRequest, reply: FastifyReply) => {
    const path = req.url.split(/[?#]/)[0] ?? '/';
    // Signed in (a session cookie, whatever it's worth): the app, not a page about Caime.
    const page =
      path === '/' && req.cookies?.[SESSION_COOKIE]
        ? { kind: 'app' as const }
        : await publicPageFor(ctx.db, path, ctx.now());
    const rendered = renderPublic(page, ctx.config.PUBLIC_URL, path);
    return reply
      .status(rendered.status)
      .header('cache-control', 'no-cache')
      .header('content-security-policy', csp)
      .header('permissions-policy', PERMISSIONS_POLICY)
      .type('text/html; charset=utf-8')
      .send(injectPublic(template, rendered));
  };
  // The root is a directory to the static handler; it must be the app, not a listing.
  app.get('/', (req, reply) => serve(req, reply));
  // For search engines: Caime's own rules, and the pages worth indexing.
  app.get('/robots.txt', (_req, reply) =>
    reply
      .header('cache-control', 'public, max-age=3600')
      .type('text/plain; charset=utf-8')
      .send(robotsTxt(ctx.config.PUBLIC_URL)),
  );
  app.get('/sitemap.xml', async (_req, reply) => {
    const here = (['privacy', 'terms', 'help'] as const).filter(
      (p) => !ctx.config[`${p.toUpperCase() as 'PRIVACY' | 'TERMS' | 'HELP'}_URL`],
    );
    return reply
      .header('cache-control', 'public, max-age=3600')
      .type('application/xml; charset=utf-8')
      .send(await sitemapXml(ctx.db, ctx.config.PUBLIC_URL, here));
  });
  // What this build is made of, for the service worker to keep so the app opens offline (PRD
  // §49): every hashed file under _expo/static, the same for everyone.
  const files = builtFiles(dir);
  app.get('/app-files.json', (_req, reply) =>
    reply.header('cache-control', 'no-cache').send({ files }),
  );
  return {
    handles: (req) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return false;
      const path = req.url.split(/[?#]/)[0] ?? '';
      if (path === '/v1' || path.startsWith('/v1/')) return false;
      // A page load gets the app whatever the path looks like: handles have dots (/o/nile.dental).
      if (/\btext\/html\b/.test(req.headers.accept ?? '')) return true;
      // Anything else shaped like a file is a missing file, never the app as a script or image.
      return !/\.[a-z0-9]{2,5}$/i.test(path);
    },
    serve,
  };
}
