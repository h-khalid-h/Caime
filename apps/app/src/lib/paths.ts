/**
 * Paths that links open inside the app. Pure (no React Native), so it is unit-tested: links come
 * from other people, and a bad one must open nothing rather than somewhere unexpected.
 */

import { MARKETING_PAGES, SITE_PAGES } from '@caime/core/api';

/** The way in, never a place to return someone to. */
const ENTRY = /^\/(?:welcome|sign-in|sign-up|recover|onboarding)?(?:[/?#]|$)/;
/**
 * Caime's own pages outside the app (the server's: its policies, the site, the marketplace and
 * an app's page in it, R80): never a screen of it, so a link to one opens the page.
 */
const SITE_PAGE = new RegExp(
  `^/(?:${[...SITE_PAGES, ...MARKETING_PAGES].join('|')})(?:/[^?#]*)?/?(?:[?#]|$)`,
  'i',
);
/** A link to someone's file (M16 H6): the server's page for whoever has it, never a screen. */
const FILE_LINK = /^\/f\/[^/?#]+\/?(?:[?#]|$)/;
// A query may carry a colon (an app's scope=messages:read, as browsers leave it); a path never.
const SAFE = /^\/(?!\/)[\w@.~%/=&+-]*(?:\?[\w@.~%/?=&+:-]*)?$/;
// Long enough for an app's authorization request (/oauth/authorize?…), short of junk.
const MAX_PATH = 1000;

/**
 * A path inside the app worth opening from a link, or null (the way in, junk, another site, or
 * one of Caime's own pages, which open as the pages they are).
 */
export function appPath(path: string | null | undefined): string | null {
  if (!path || path.length > MAX_PATH || !SAFE.test(path) || ENTRY.test(path)) return null;
  if (SITE_PAGE.test(path) || FILE_LINK.test(path)) return null;
  return path;
}

/** An app asking to act for someone (PRD §74): the way back to it survives signing in. */
export const isAuthorizeLink = (path: string | null | undefined) =>
  Boolean(path && /^\/oauth\/authorize(?:\?|$)/.test(path));

/** The in-app path of a link to Caime itself (on `base`, its web origin), or null. */
export function ownLinkPath(url: string, base: string): string | null {
  if (!base || !url.startsWith(`${base}/`)) return null;
  return appPath(url.slice(base.length).split('#')[0]);
}

/**
 * The path a deep link opens: https://host/@noor → /@noor; caime://o/datac → /o/datac (a
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
  return path?.match(HOST_LINK)?.[1] ?? null;
}

/**
 * A host's page, or one of its items' or collections' (R61, `/o/<handle>/<slug>`; a slug is
 * letters of any script, percent-encoded on the way), with its way in (`?write`, `?book`,
 * `?order`).
 */
const HOST_LINK = /^\/(?:@|o\/)([a-z0-9._]+)(?:\/([\w%-]{1,200}))?(?:\?(write|book|order|pay))?$/i;

/** The item's or collection's address in a link to one (R61), decoded, or null. */
export function itemIn(path: string | null | undefined): string | null {
  const slug = path?.match(HOST_LINK)?.[2];
  if (!slug) return null;
  try {
    return decodeURIComponent(slug).toLowerCase();
  } catch {
    return null;
  }
}

/**
 * A link that books (`/@handle?book`, `/o/<handle>?book`, R58): the page's Book, which opens
 * the appointment card's form once the person is in the conversation. Null for any other path.
 */
export function bookIn(path: string | null | undefined): string | null {
  const m = path?.match(HOST_LINK);
  return m?.[3] === 'book' ? (m[1] ?? null) : null;
}

/** A link that orders (`/@handle?order`, `/o/<handle>?order`, R60), as `bookIn` books. */
export function orderIn(path: string | null | undefined): string | null {
  const m = path?.match(HOST_LINK);
  return m?.[3] === 'order' ? (m[1] ?? null) : null;
}

/**
 * The handle of an organization's door (`/o/<handle>?write`, R53): a link that writes to it,
 * so whoever comes in through it lands in the conversation. Null for any other path.
 */
export function doorIn(path: string | null | undefined): string | null {
  return path?.match(/^\/o\/([a-z0-9._]+)\?write$/i)?.[1] ?? null;
}

/** The token of an invite link (`/i/<token>`, R1), or null. */
export function inviteIn(path: string | null | undefined): string | null {
  return path?.match(/^\/i\/([A-Za-z0-9_-]{16,64})$/)?.[1] ?? null;
}

/** The token of a team invite (`/t/<token>`, M16 C3a), or null. */
export function teamInviteIn(path: string | null | undefined): string | null {
  return path?.match(/^\/t\/(t_[A-Za-z0-9_-]{43})$/)?.[1] ?? null;
}

/**
 * The conversation a link opens (`/c/<id>`, nothing after it), or null: a meeting kept by its
 * guest (M16 C3f) arrives at its conversation as a link does.
 */
export function conversationIn(path: string | null | undefined): string | null {
  return (
    path?.match(/^\/c\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i)?.[1] ??
    null
  );
}

/** The token of a link to join a group or a space (`/g/<token>`, M16 C3e), or null. */
export function joinLinkIn(path: string | null | undefined): string | null {
  return path?.match(/^\/g\/(g_[A-Za-z0-9_-]{43})$/)?.[1] ?? null;
}
