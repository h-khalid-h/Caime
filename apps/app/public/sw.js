/*
 * Caishy's service worker (web): it shows what the server pushes when Caishy isn't open in front
 * of the person, and opens the right place when one is tapped. It caches nothing and reads
 * nothing but the push itself: {id, title, body, tag, level, data}.
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
      if (tabs.some((t) => t.visibilityState === 'visible' && t.focused)) return;
      const urgent = n.level === 'urgency';
      await self.registration.showNotification(n.title || 'Caishy', {
        body: n.body || '',
        tag: n.tag || n.id || undefined,
        renotify: urgent,
        requireInteraction: urgent,
        data: { ...(n.data || {}), id: n.id || null },
        icon: '/icon-192.png',
        badge: '/notification-icon.png',
      });
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
