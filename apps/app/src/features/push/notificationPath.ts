/**
 * Where a tapped notification leads, from what the server put in its `data`: the phone's twin of
 * the service worker's `pathOf` (public/sw.js, plain JavaScript with no build, so it can't import
 * this). `sw.test.ts` holds the two to the same answers; anything new pushed with a `data` field
 * that opens somewhere joins both.
 */
export function notificationPath(data: unknown): string {
  const d = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  // A meeting starting (R83): its join address, which the app checks against the card.
  if (typeof d.path === 'string' && /^\/c\/[^/?#]+\?/.test(d.path)) return d.path;
  if (typeof d.conversationId === 'string') return `/c/${encodeURIComponent(d.conversationId)}`;
  // Someone asking to join a space one runs (C3h): its page, where who asked waits.
  if (typeof d.spaceId === 'string') return `/s/${encodeURIComponent(d.spaceId)}`;
  if (typeof d.handle === 'string') return `/o/${encodeURIComponent(d.handle)}`;
  if (typeof d.userId === 'string') return `/p/${encodeURIComponent(d.userId)}`;
  return '/notifications';
}
