import { tr } from './i18n';
/**
 * Acting as a person (PRD §73–74): a personal access token someone makes for their own scripts,
 * and third-party apps they let in through OAuth. Either reaches a short list of routes, each
 * behind a permission they chose, and never their account itself: no password, sessions,
 * privacy, tokens, export or deletion. Whatever it sends says what sent it.
 */

export const PERSONAL_SCOPES = [
  'profile:read',
  'messages:read',
  'messages:write',
  'actions:read',
  'actions:write',
] as const;
export type PersonalScope = (typeof PERSONAL_SCOPES)[number];

export const PERSONAL_SCOPE_LABELS: Record<PersonalScope, string> = {
  'profile:read': 'See your name and handle',
  'messages:read': 'Read your conversations and search them',
  'messages:write': 'Send messages as you, marked with what sent them',
  'actions:read': 'See your actions and what you’re waiting for',
  'actions:write': 'Add, change and finish your actions',
};

export function isPersonalScope(value: string): value is PersonalScope {
  return (PERSONAL_SCOPES as readonly string[]).includes(value);
}

/** Tokens say what they are, so a leaked one is recognisable (and scannable). */
export const PERSONAL_TOKEN_PREFIX = 'cap_';
export const OAUTH_ACCESS_PREFIX = 'cao_';
export const OAUTH_REFRESH_PREFIX = 'car_';
export const OAUTH_SECRET_PREFIX = 'cas_';

/** A token that acts as a person: their own, or one an app they let in holds. */
export function isPersonToken(token: string): boolean {
  return token.startsWith(PERSONAL_TOKEN_PREFIX) || token.startsWith(OAUTH_ACCESS_PREFIX);
}

/** How long a personal token lasts: a month, three, a year, or until it's revoked. */
export const TOKEN_LIFETIMES = [30, 90, 365, null] as const;

/** How long an app's access token lasts; its refresh token lasts a month, and is used once. */
export const OAUTH_ACCESS_SECONDS = 3600;
export const OAUTH_REFRESH_DAYS = 30;

/**
 * Where an app may send someone back to after they allow it: an https address, a loopback one
 * while it's being built, or an app's own scheme (myapp://callback). Never javascript:, data:
 * or file:, never a fragment, and never plain http elsewhere.
 */
export function redirectUriError(uri: string): string | null {
  let u: URL;
  try {
    u = new URL(uri);
  } catch {
    return tr('{uri} isn’t an address.', { uri });
  }
  if (u.hash) return tr('A return address can’t have a # part.');
  if (u.username || u.password) return tr('A return address can’t hold a name or password.');
  const scheme = u.protocol.slice(0, -1);
  if (scheme === 'https') return null;
  if (scheme === 'http')
    return ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)
      ? null
      : tr('Use https (plain http is only for localhost).');
  if (
    ['javascript', 'data', 'file', 'blob', 'vbscript', 'about', 'ftp', 'ws', 'wss'].includes(scheme)
  )
    return tr('{scheme}: addresses can’t be used.', { scheme });
  // An app's own scheme: at least a dot or a few letters, so it's clearly the app's.
  return /^[a-z][a-z0-9+.-]{2,}$/.test(scheme) ? null : tr('Use https, or your app’s own scheme.');
}
