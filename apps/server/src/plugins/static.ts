/**
 * Serves the exported web app from WEB_DIR on the same origin as the API (ADR-7: the session
 * cookie stays first-party). Hashed bundles are cached forever; the HTML never is, so a deploy
 * reaches everyone on their next load. Any unknown non-API GET gets the app (client routing).
 */
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AppContext } from '../context';

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

export interface WebApp {
  /** Answer a request with the app shell when it's a page navigation outside the API. */
  handles: (req: FastifyRequest) => boolean;
  serve: (reply: FastifyReply) => FastifyReply;
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
  const serve = (reply: FastifyReply) =>
    reply
      .header('cache-control', 'no-cache')
      .header('content-security-policy', csp)
      .type('text/html; charset=utf-8')
      .sendFile('index.html');
  // The root is a directory to the static handler; it must be the app, not a listing.
  app.get('/', (_req, reply) => serve(reply));
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
