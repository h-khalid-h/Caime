/**
 * Caime's own pages (lib/pages.ts) at /privacy, /terms and /help, for anyone, signed in or not:
 * About links to them, and so can the app stores. Each is made once, from the environment. One
 * published somewhere else (PRIVACY_URL, TERMS_URL, HELP_URL) sends people there instead, so
 * there's only ever one of each.
 */
import { SITE_PAGES, type SitePage } from '@caime/core/api';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../context';
import { renderPage } from '../lib/pages';
import { PERMISSIONS_POLICY } from '../lib/public-pages';

/** A page is its own text and styles: no script, nothing loaded from anywhere, never framed. */
export const PAGE_CSP = [
  "default-src 'none'",
  "style-src 'unsafe-inline'",
  "img-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

const SPELLED = new RegExp(`^/(${SITE_PAGES.join('|')})/?$`, 'i');

/**
 * The page a path names however it's spelled (/Privacy, /terms/), when it isn't already the
 * page's own path: for the server's unknown paths to send there, never to the app.
 */
export function sitePageAt(url: string): SitePage | null {
  const path = url.split(/[?#]/)[0] ?? '';
  const page = path.match(SPELLED)?.[1]?.toLowerCase() as SitePage | undefined;
  return page && path !== `/${page}` ? page : null;
}

export async function pageRoutes(app: FastifyInstance, ctx: AppContext) {
  const { config } = ctx;
  const base = config.PUBLIC_URL.replace(/\/+$/, '');
  const ownHost = new URL(base).hostname.toLowerCase();
  const set = (u: string | undefined) => (u ? new URL(u) : null);
  const there: Record<SitePage, URL | null> = {
    privacy: set(config.PRIVACY_URL),
    terms: set(config.TERMS_URL),
    help: set(config.HELP_URL),
  };
  /** Which of these pages an address is, when it's on this server, however it's written. */
  const pageAt = (u: URL, host: string): SitePage | null => {
    const h = u.hostname.toLowerCase();
    if (h !== ownHost && h !== host.toLowerCase()) return null;
    const path = u.pathname.replace(/\/+$/, '').toLowerCase();
    return SITE_PAGES.find((p) => path === `/${p}`) ?? null;
  };
  /**
   * Whether a page is served here: nothing else is set for it, or what's set comes back to it,
   * through these pages (a query, another scheme, PRIVACY_URL naming this very page, or pages
   * naming each other). Sending people on would send them round for ever.
   */
  const servedHere = (name: SitePage, host: string): boolean => {
    const seen = new Set<SitePage>();
    let u = there[name];
    if (!u) return true;
    while (u) {
      const next = pageAt(u, host);
      if (!next) return false;
      if (next === name) return true;
      // Round among the others: one of them is served here, and this sends people to it.
      if (seen.has(next)) return false;
      seen.add(next);
      u = there[next];
    }
    return false;
  };
  for (const name of SITE_PAGES) {
    const html = renderPage(name, {
      legalName: config.LEGAL_NAME,
      contactEmail: config.CONTACT_EMAIL,
      minimumAge: config.MINIMUM_AGE,
      publicUrl: base,
      stun: config.stunUrls.some((u) => /\.google\.com\b/i.test(u))
        ? 'google'
        : config.stunUrls.length
          ? 'other'
          : 'none',
      relay: config.cloudflareTurn ? 'cloudflare' : config.turnUrls.length > 0 ? 'own' : 'none',
    });
    app.get(`/${name}`, async (req, reply) => {
      const away = there[name];
      if (away && !servedHere(name, req.hostname)) return reply.redirect(away.href);
      return reply
        .header('cache-control', 'public, max-age=600')
        .header('content-security-policy', PAGE_CSP)
        .header('permissions-policy', PERMISSIONS_POLICY)
        .type('text/html; charset=utf-8')
        .send(html);
    });
  }
}
