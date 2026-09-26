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
