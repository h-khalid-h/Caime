/*
 * Caishy's service worker (web). It shows what the server pushes when Caishy isn't open in front
 * of the person, and opens the right place when one is tapped; of a push it reads only
 * {id, title, body, tag, level, data, quiet}. And it keeps the app itself (PRD §49): its page and
 * the files this build is made of, so Caishy opens and moves between screens with no network,
 * showing what's on the device. It never keeps what the API answers: the app keeps its own.
 */

const FILES = 'caishy-files-v1';
/** The app is one page for every path, kept once, under "/". */
const SHELL = '/';
let keeping = null;

/**
 * The page and every file of its build, kept together: the page replaces the one kept only once
 * all of its files are, and the files of builds before it go. Anything unfinished is tried again
 * on the next page load.
 */
/** A file that takes longer than this is tried again on the next page load. */
const DEADLINE_MS = 20_000;
const deadline = () =>
  typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
    ? { signal: AbortSignal.timeout(DEADLINE_MS) }
    : {};
/** What a build is made of: its scripts, and its fonts and images. */
const BUILT = ['/_expo/static/', '/assets/'];

async function keep(page) {
  const list = await self.fetch('/app-files.json', { cache: 'no-store', ...deadline() });
  if (!list.ok) return;
  const { files } = await list.json();
  if (!Array.isArray(files)) return;
  const current = new Set(files);
  // A page and a list from two builds (a deploy half done): kept only when the list is the
  // page's own, so nothing is mixed and nothing the page needs is deleted.
  const html = await page.clone().text();
  const own = [...html.matchAll(/(?:src|href)="(\/_expo\/static\/[^"]+)"/g)].map((m) => m[1]);
  if (!own.every((f) => current.has(f))) return;
  const cache = await self.caches.open(FILES);
  const have = new Set((await cache.keys()).map((r) => new URL(r.url).pathname));
  for (const file of files) {
    if (have.has(file)) continue;
    const res = await self.fetch(file, deadline());
    if (!res.ok) return;
    await cache.put(file, res);
  }
  // From what was read of it at the start: its own download may be past its deadline by now.
  await cache.put(
    SHELL,
    new Response(html, { status: page.status, statusText: page.statusText, headers: page.headers }),
  );
  for (const r of await cache.keys()) {
    const path = new URL(r.url).pathname;
    if (BUILT.some((dir) => path.startsWith(dir)) && !current.has(path)) await cache.delete(r);
  }
}

function keepOnce(page) {
  keeping ??= keep(page)
    .catch(() => {})
    .finally(() => {
      keeping = null;
    });
  return keeping;
}

const keptPage = async () => (await self.caches.open(FILES)).match(SHELL);

/**
 * A page: always the network's while there is one. With none, or while the server can't answer
 * (a deploy restarting it), the one kept.
 */
async function page(event) {
  let res;
  try {
    res = await self.fetch(event.request);
  } catch (err) {
    const kept = await keptPage();
    if (kept) return kept;
    throw err;
  }
  if (res.status >= 500) return (await keptPage()) || res;
  if (res.ok && (res.headers.get('content-type') || '').includes('text/html'))
    event.waitUntil(keepOnce(res.clone()));
  return res;
}

/** A file of a build: named for what's in it, so a kept one is always right. */
async function file(request) {
  const cache = await self.caches.open(FILES);
  const kept = await cache.match(request);
  if (kept) return kept;
  const res = await self.fetch(request);
  if (res.ok) await cache.put(request, res.clone());
  return res;
}

// The app is open already: it's kept as this worker installs, while it controls nothing and
// nothing waits on it. Activating (when every request from open tabs does wait) is only taking
// charge and letting go of what earlier ones kept.
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    self
      .fetch(SHELL, { cache: 'no-store', ...deadline() })
      .then((res) => (res.ok ? keepOnce(res) : null))
      .catch(() => {}),
  );
});
self.addEventListener('activate', (event) =>
  event.waitUntil(
    (async () => {
      await self.clients.claim();
      for (const name of await self.caches.keys())
        if (name.startsWith('caishy-') && name !== FILES) await self.caches.delete(name);
    })(),
  ),
);

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // The API, and the list of files itself, are always the network's.
  if (url.pathname === '/v1' || url.pathname.startsWith('/v1/')) return;
  if (url.pathname === '/app-files.json' || url.pathname === '/sw.js') return;
  if (request.mode === 'navigate') {
    event.respondWith(page(event));
    return;
  }
  if (url.pathname.startsWith('/_expo/static/') || url.pathname.startsWith('/assets/'))
    event.respondWith(file(request));
});

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
