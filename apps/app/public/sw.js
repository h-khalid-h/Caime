/*
 * Caishy's service worker (web): it shows what the server pushes when Caishy isn't open in front
 * of the person, and opens the right place when one is tapped. It caches nothing and reads
 * nothing but the push itself: {id, title, body, tag, level, data, quiet}.
 */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

/** Where a notification leads, from what it's about. */
function pathOf(data) {
  const d = data || {};
  if (typeof d.conversationId === 'string') return `/c/${encodeURIComponent(d.conversationId)}`;
  if (typeof d.handle === 'string') return `/o/${encodeURIComponent(d.handle)}`;
  if (typeof d.userId === 'string') return `/p/${encodeURIComponent(d.userId)}`;
  return '/notifications';
}

/**
 * Safari takes a site's pushes away once a few have shown nothing, whatever tab is open; there,
 * every push shows something, if only for a moment. Other browsers let the open app show it.
 */
const webkit = (() => {
  const ua = (self.navigator && self.navigator.userAgent) || '';
  return (
    /AppleWebKit/.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR|Firefox|FxiOS|SamsungBrowser/.test(ua)
  );
})();

self.addEventListener('push', (event) => {
  let n = {};
  try {
    n = event.data ? event.data.json() : {};
  } catch {
    n = { title: 'Caishy', body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    (async () => {
      // Open and in front: the app shows it itself.
      const tabs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const inFront = tabs.some((t) => t.visibilityState === 'visible' && t.focused);
      if (inFront && !webkit) return;
      const urgent = n.level === 'urgency';
      // A replacement (a ring that's over) swaps what's shown without a sound.
      const quiet = n.quiet === true || inFront;
      const tag = n.tag || n.id || undefined;
      const id = n.id || null;
      await self.registration.showNotification(n.title || 'Caishy', {
        body: n.body || '',
        tag,
        // Something new alerts, even over an older one about the same thing.
        renotify: Boolean(tag) && !quiet,
        silent: quiet,
        requireInteraction: urgent && !quiet,
        data: { ...(n.data || {}), id },
        icon: '/icon-192.png',
        badge: '/notification-icon.png',
      });
      // Shown only so Safari keeps the pushes coming: the app in front has it already.
      if (inFront)
        for (const shown of await self.registration.getNotifications(tag ? { tag } : {}))
          if (shown.data && shown.data.id === id) shown.close();
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const path = pathOf(event.notification.data);
  event.waitUntil(
    (async () => {
      const tabs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const tab = tabs.find((t) => new URL(t.url).origin === self.location.origin);
      if (tab) {
        // The app moves there itself, so a call or a draft in it isn't lost to a reload.
        tab.postMessage({ type: 'caishy.open', path });
        await tab.focus();
        return;
      }
      await self.clients.openWindow(path);
    })(),
  );
});
