/**
 * Caime as an app on this computer or phone, from the browser (R120): the browser's own install
 * offer, kept from the moment it comes (`beforeinstallprompt`, Chromium's), so the card on
 * Attention can offer it from a tap; Safari on a Mac, which installs from its File menu (Add to
 * Dock), told how; and the count of what needs you on the installed app's icon (the Badging API:
 * Chromium's installed apps, Safari's web apps), kept in step with the inbox while the page runs.
 * Loaded with the push module, after the first screen.
 */
import type { InboxAllResponse, OkResponse, Surface } from '@caime/core/api';
import { hashKey } from '@tanstack/react-query';
import { api } from '@/api/client';
import { qk } from '@/api/keys';
import { queryClient } from '@/api/queryClient';

/** Chromium's install offer, as the event that carries it. */
interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let offered: InstallPrompt | null = null;
const listeners = new Set<() => void>();
const changed = () => {
  for (const l of listeners) l();
};

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Kept for the card's button; the browser's own icon in its address bar stays.
    e.preventDefault();
    offered = e as InstallPrompt;
    changed();
  });
  window.addEventListener('appinstalled', () => {
    offered = null;
    changed();
  });
}

/** Opened as an installed app (from the dock, the Home Screen, the Start menu), or the desktop app. */
export function installedHere(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    (navigator as { standalone?: boolean }).standalone === true ||
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    /CaimeDesktop\//.test(navigator.userAgent)
  );
}

/** Safari on a Mac from 17 on (Sonoma), which adds a site to the Dock from its File menu. */
function safariOnMac(): boolean {
  const ua = navigator.userAgent;
  if (!/Macintosh/.test(ua) || navigator.maxTouchPoints > 1) return false;
  if (/Chrome|Chromium|Edg|Firefox|OPR/.test(ua)) return false;
  const [, major] = /Version\/(\d+)/.exec(ua) ?? [];
  return Number(major) >= 17;
}

/**
 * What this browser can do to install Caime: its own offer from a tap (`prompt`), Safari's Add to
 * Dock (`dock`), or nothing (installed already, or a browser that doesn't install sites).
 */
export function installOffer(): 'prompt' | 'dock' | null {
  if (typeof window === 'undefined' || installedHere()) return null;
  if (offered) return 'prompt';
  return safariOnMac() ? 'dock' : null;
}

/** Told when the offer comes or goes (it can arrive a moment after the page). */
export function onInstallOffer(heard: () => void): () => void {
  listeners.add(heard);
  return () => listeners.delete(heard);
}

/** The browser's install offer, from the person's tap: whether they took it. */
export async function install(): Promise<boolean> {
  const prompt = offered;
  if (!prompt) return false;
  offered = null;
  changed();
  await prompt.prompt();
  return (await prompt.userChoice).outcome === 'accepted';
}

type Badging = Navigator & {
  setAppBadge?: (count?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

/**
 * The count of what needs you (the Attention tab's own, R7) on the installed app's icon, from the
 * inbox as the page holds it, set again only when it changes, and cleared when this stops (a
 * sign-out). Browsers without the Badging API draw nothing.
 */
export function watchBadge(): () => void {
  const nav = navigator as Badging;
  if (typeof nav.setAppBadge !== 'function') return () => {};
  const inbox = hashKey(qk.inboxAll);
  let shown = 0;
  const show = () => {
    const data = queryClient.getQueryData<InboxAllResponse>(qk.inboxAll);
    const count = data ? data.conversations.filter((c) => c.section === 'needs_you').length : 0;
    if (count === shown) return;
    shown = count;
    void (count ? nav.setAppBadge?.(count) : nav.clearAppBadge?.())?.catch(() => {});
  };
  show();
  const stop = queryClient.getQueryCache().subscribe((e) => {
    if (e.query.queryHash === inbox) show();
  });
  return () => {
    stop();
    if (shown) void nav.clearAppBadge?.().catch(() => {});
  };
}

/**
 * Where this browser runs Caime (R120): the desktop app, the web app installed from the browser,
 * or a tab, said to the server once a launch for product metrics' count of who uses an installed
 * app; nothing waits on it.
 */
export function tellSurface(): void {
  const surface: Surface = /CaimeDesktop\//.test(navigator.userAgent)
    ? 'desktop'
    : installedHere()
      ? 'installed'
      : 'browser';
  void api.put<OkResponse>('/auth/sessions/current/surface', { surface }).catch(() => {});
}
