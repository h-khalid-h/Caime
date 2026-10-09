/**
 * Where the phone's bar is (the five places and Search): on every screen a person moves between
 * places from, so going from someone's page to Spaces is one tap, not Back, Back and a tab; and
 * never where it would sit on what they're doing (a conversation's composer, a form that makes
 * something, a flow with its own end). Pure, so it's tested as rules.
 */

/** The five places, by route name, and the path each one's root is at. */
export const PLACES = ['index', 'chats', 'people', 'spaces', 'actions'] as const;
export type Place = (typeof PLACES)[number];

export const placePath = (place: Place) => (place === 'index' ? '/' : `/${place}`);

/** Where the bar would sit on what someone's doing: a conversation, making something, a flow. */
const HIDDEN = [
  /^\/c\//,
  /^\/onboarding(?:\/|$)/,
  /^\/oauth\//,
  /^\/i\//,
  /^\/new-group(?:\/|$)/,
  /^\/new-space(?:\/|$)/,
  /^\/orgs\/new(?:\/|$)/,
];

export function phoneBarShown(pathname: string): boolean {
  return !HIDDEN.some((re) => re.test(pathname));
}

/** The place a path is the root of, or null for anything opened over the places. */
export function placeAt(pathname: string): Place | null {
  return PLACES.find((p) => placePath(p) === pathname) ?? null;
}

/**
 * The place lit in the bar: the one whose root is open, else the one someone came from (a
 * person's page opened from Chats is still in Chats), so the bar always says where Back leads.
 */
export function litPlace(pathname: string, last: Place | null): Place | null {
  if (pathname === '/search') return null;
  return placeAt(pathname) ?? last;
}
