/**
 * Paths that links open inside the app. Pure (no React Native), so it is unit-tested: links come
 * from other people, and a bad one must open nothing rather than somewhere unexpected.
 */

/** The way in, never a place to return someone to. */
const ENTRY = /^\/(?:welcome|sign-in|sign-up|recover|onboarding)?(?:[/?#]|$)/;
// A query may carry a colon (an app's scope=messages:read, as browsers leave it); a path never.
const SAFE = /^\/(?!\/)[\w@.~%/=&+-]*(?:\?[\w@.~%/?=&+:-]*)?$/;
// Long enough for an app's authorization request (/oauth/authorize?…), short of junk.
const MAX_PATH = 1000;

/** A path inside the app worth opening from a link, or null (the way in, junk, another site). */
export function appPath(path: string | null | undefined): string | null {
  if (!path || path.length > MAX_PATH || !SAFE.test(path) || ENTRY.test(path)) return null;
  return path;
}

/** An app asking to act for someone (PRD §74): the way back to it survives signing in. */
export const isAuthorizeLink = (path: string | null | undefined) =>
  Boolean(path && /^\/oauth\/authorize(?:\?|$)/.test(path));

/** The in-app path of a link to Caishy itself (on `base`, its web origin), or null. */
export function ownLinkPath(url: string, base: string): string | null {
  if (!base || !url.startsWith(`${base}/`)) return null;
  return appPath(url.slice(base.length).split('#')[0]);
}

/**
 * The path a deep link opens: https://host/@noor → /@noor; caishy://o/datac → /o/datac (a
 * custom scheme's first segment reads as a host, and belongs to the path).
 */
export function deepLinkPath(url: string): string | null {
  const m = url.match(/^([a-z][a-z0-9+.-]*):\/\/([^/?#]*)([^#]*)/i);
  if (!m) return null;
  const [, scheme = '', host = '', rest = ''] = m;
  const path = /^https?$/i.test(scheme) ? rest || '/' : `/${host}${rest}`.replace(/^\/\//, '/');
  return appPath(path);
}

/** The handle a path opens (a person's or an organization's), to say whose link this is. */
export function handleIn(path: string | null | undefined): string | null {
  return path?.match(/^\/(?:@|o\/)([a-z0-9._]+)$/i)?.[1] ?? null;
}
