/**
 * On the web, the service worker keeps the app itself (public/sw.js), so Caime opens and moves
 * between screens offline (PRD §49). Not while developing: the dev server's files aren't a build.
 */
export function keepAppForOffline(): void {
  if (__DEV__ || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  void navigator.serviceWorker.register('/sw.js').catch(() => {});
}
