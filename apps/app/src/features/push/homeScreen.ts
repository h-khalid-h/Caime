/**
 * Whether to tell an iPhone or iPad browser how to get Caime's notifications (review 2026-10-17
 * §1 H7): Safari pushes only to a web app added to the Home Screen, so in a tab it has no way to
 * notify and says nothing about why. Read by the card on Attention, which loads only on an Apple
 * device's tab without push, so none of this is in the startup chunk. Phones are told nothing
 * (homeScreen.native.ts): the app notifies.
 */
const KEY = 'caime.home-screen-hint';

/** An iPhone or an iPad (which says it's a Mac, with touch), in a browser tab, not yet told. */
export function homeScreenHint(): 'iphone' | 'ipad' | null {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return null;
  const ua = navigator.userAgent;
  const ipad = /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (!ipad && !/iPhone|iPod/.test(ua)) return null;
  // Pushes reach the Home Screen from iOS 16.4: before it, there's no way to tell them of.
  const [, major, minor] =
    /OS (\d+)_(\d+)\S* like Mac OS X/.exec(ua) ?? /Version\/(\d+)\.(\d+)/.exec(ua) ?? [];
  if (Number(major) * 100 + Number(minor) < 1604) return null;
  // Opened from the Home Screen: it can notify, and the prompt on Chats asks.
  const standalone =
    (navigator as { standalone?: boolean }).standalone === true ||
    window.matchMedia?.('(display-mode: standalone)').matches === true;
  if (standalone || 'PushManager' in window) return null;
  try {
    if (localStorage.getItem(KEY) === '1') return null;
  } catch {
    return null;
  }
  return ipad ? 'ipad' : 'iphone';
}

/** Told once is enough on this browser: "Not now" is remembered here, as turning push off is. */
export function dismissHomeScreenHint(): void {
  try {
    localStorage.setItem(KEY, '1');
  } catch {}
}

const INSTALL_KEY = 'caime.install-hint';

/** Whether "Not now" was said to installing Caime on this browser (R120). */
export function installHintDismissed(): boolean {
  try {
    return localStorage.getItem(INSTALL_KEY) === '1';
  } catch {
    return true;
  }
}

/** Installing is offered once on a browser: "Not now" is remembered here. */
export function dismissInstallHint(): void {
  try {
    localStorage.setItem(INSTALL_KEY, '1');
  } catch {}
}

/** Offered once someone has come back: never in the first two days of their account. */
export const INSTALL_AFTER_MS = 2 * 86_400_000;
