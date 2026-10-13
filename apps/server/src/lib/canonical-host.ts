/**
 * One address (go-live, 2026-10-13): Caime's pages answer on `PUBLIC_URL`'s host alone. A page
 * asked for on any other name the service answers to (`www`, the address before it, the host's
 * own default) is sent there for good, its path and query kept, so there is one site, one
 * session cookie and one origin for push and the app's storage, and every link Caime writes
 * lands where the person already is. What machines call answers on every name: the API (`/v1`,
 * webhooks and feeds among it), the operator's `/metrics` and `/.well-known/`, since a webhook's
 * POST doesn't follow a redirect. A loopback name or an address is a local run or a health
 * check, and a Caime whose own address is one of those has no one address to send anyone to.
 */
import { isIP } from 'node:net';

/** Paths that answer on every name the service has. */
const MACHINE_PATHS = /^\/(?:v1|metrics|\.well-known)(?:[/?#]|$)/;

/** A host as the request named it: lowercase, without its port, brackets or a final dot. */
function bareHost(host: string): string {
  return host
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, '')
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '');
}

const isLocal = (host: string) =>
  host === 'localhost' || host.endsWith('.localhost') || isIP(host) !== 0;

/**
 * Where a request belongs, when that isn't where it was asked: `PUBLIC_URL` with the same path
 * and query, for a page (GET or HEAD outside the machines' paths) on another name. Null when it
 * answers here.
 */
export function canonicalLocation(
  publicUrl: string,
  request: { method: string; host: string | undefined; url: string },
): string | null {
  if (request.method !== 'GET' && request.method !== 'HEAD') return null;
  const { url } = request;
  if (!url.startsWith('/') || MACHINE_PATHS.test(url)) return null;
  const canonical = new URL(publicUrl);
  const own = bareHost(canonical.host);
  const asked = bareHost(request.host ?? '');
  if (!asked || asked === own || isLocal(asked) || isLocal(own)) return null;
  // Resolved against Caime's own origin, so a path can only ever lead there ("//elsewhere" can't).
  const target = new URL(url, canonical.origin);
  return target.origin === canonical.origin ? target.href : null;
}
