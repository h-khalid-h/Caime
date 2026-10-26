/**
 * What a guest may do (R84). A guest is a provisional person (R75) with a session: someone
 * invited to a meeting by address, who joined from their own link. Every request a provisional
 * session makes is refused unless its route is here, checked once for all routes by the auth
 * plugin (plugins/auth.ts), so a route added later is closed to guests until it's added here on
 * purpose. `guest-routes.test.ts` walks every registered route to prove it.
 *
 * A guest is in one conversation, their meeting's space, or, reached by mail, their one-to-one
 * with whoever a card held on Caime is with (M16 F6c), and these are what being in it takes:
 * their session and their own name, reading it and its card, its call (ICE, what's live, start,
 * join or answer, decline, leave, signal, alive: a one-to-one's only by their link to a card
 * there, `callLinkIn`), and the live socket that rings them and carries the call's signals (it
 * tells each person only what's theirs, and drops a guest's typing),
 * their say in Cai's notes of that call (M16 F7), and keeping the meeting as their own account
 * (M16 C3f), which hands them what sign-up takes.
 * Each route still checks membership itself, so none reaches past the space. Writing in the
 * space, people, search, settings: never.
 */
export const GUEST_ROUTES: ReadonlySet<string> = new Set([
  'GET /v1/auth/session',
  'POST /v1/auth/logout',
  'GET /v1/me',
  'GET /v1/realtime',
  'GET /v1/join/:token',
  'POST /v1/join/:token',
  'POST /v1/guest/keep',
  'GET /v1/conversations/:id',
  'GET /v1/conversations/:id/messages',
  'GET /v1/calls/ice',
  'GET /v1/calls/live',
  'GET /v1/group-calls/live',
  'GET /v1/conversations/:id/group-call',
  'POST /v1/conversations/:id/group-calls',
  'POST /v1/group-calls/:id/join',
  'POST /v1/group-calls/:id/decline',
  'POST /v1/group-calls/:id/leave',
  'POST /v1/group-calls/:id/signal',
  'POST /v1/group-calls/:id/alive',
  // The call in their one-to-one, by their own link to a card there (M16 F6c).
  'POST /v1/conversations/:id/calls',
  'POST /v1/calls/:id/accept',
  'POST /v1/calls/:id/decline',
  'POST /v1/calls/:id/end',
  'POST /v1/calls/:id/signal',
  'POST /v1/calls/:id/alive',
  // Cai's notes in their meeting's call (M16 F7): a guest says yes or no, stops it, and reads
  // what was said; never asks (it's on an account's allowance) and never records (R85 (4)).
  'POST /v1/calls/:id/notes/answer',
  'POST /v1/calls/:id/notes/stop',
  'GET /v1/calls/:id/notes',
  'DELETE /v1/calls/:id/notes/lines/:lineId',
]);

/** The key a route is listed under: its method and its pattern (`/v1/messages/:id`). */
export const routeKey = (method: string, url: string | undefined) => `${method} ${url ?? ''}`;

/**
 * What a child's account reaches while it waits for their parent to agree (R122,
 * lib/family.ts): their session, signing out, their own account and family (which says whose
 * consent it waits for), and the live socket that tells them when it's given. Nothing else, so a
 * route added later is closed to them as to a guest.
 */
export const WAITING_ROUTES: ReadonlySet<string> = new Set([
  'GET /v1/auth/session',
  'POST /v1/auth/logout',
  'GET /v1/me',
  'GET /v1/me/family',
  'GET /v1/realtime',
  // What rings for them (nothing can: nobody is connected with them yet), which the socket asks
  // each time it connects.
  'GET /v1/calls/live',
]);
