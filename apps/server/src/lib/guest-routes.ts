/**
 * What a guest may do (R84). A guest is a provisional person (R75) with a session: someone
 * invited to a meeting by address, who joined from their own link. Every request a provisional
 * session makes is refused unless its route is here, checked once for all routes by the auth
 * plugin (plugins/auth.ts), so a route added later is closed to guests until it's added here on
 * purpose. `guest-routes.test.ts` walks every registered route to prove it.
 *
 * For now only what any session needs to end itself: the routes a guest uses in a meeting's
 * space (its messages, its card, its call) are added with that space (R84 (1)).
 */
export const GUEST_ROUTES: ReadonlySet<string> = new Set([
  'GET /v1/auth/session',
  'POST /v1/auth/logout',
]);

/** The key a route is listed under: its method and its pattern (`/v1/messages/:id`). */
export const routeKey = (method: string, url: string | undefined) => `${method} ${url ?? ''}`;
