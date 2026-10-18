/** Who is told how to get notifications on an iPhone or an iPad (H7), and who never is. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0.6668.69 Mobile/15E148 Safari/604.1';
const IPHONE_OLD =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1';
const IPAD_AS_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15';
const ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';

let stored: Map<string, string>;
function browser(ua: string, opts: { touch?: number; push?: boolean; standalone?: boolean } = {}) {
  vi.stubGlobal('navigator', {
    userAgent: ua,
    maxTouchPoints: opts.touch ?? 5,
    standalone: opts.standalone ?? false,
  });
  vi.stubGlobal('window', {
    ...(opts.push ? { PushManager: class {} } : {}),
    matchMedia: () => ({ matches: opts.standalone ?? false }),
  });
}

beforeEach(() => {
  stored = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => stored.get(k) ?? null,
    setItem: (k: string, v: string) => stored.set(k, v),
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('homeScreenHint', () => {
  it('tells an iPhone’s browser tab, Safari or another, and an iPad that says it’s a Mac', async () => {
    const { homeScreenHint } = await import('./homeScreen');
    browser(IPHONE_SAFARI);
    expect(homeScreenHint()).toBe('iphone');
    browser(IPHONE_CHROME);
    expect(homeScreenHint()).toBe('iphone');
    browser(IPAD_AS_MAC);
    expect(homeScreenHint()).toBe('ipad');
  });

  it('tells nobody who can be notified already, or never could be', async () => {
    const { homeScreenHint } = await import('./homeScreen');
    // Opened from the Home Screen, where Safari has its push.
    browser(IPHONE_SAFARI, { standalone: true, push: true });
    expect(homeScreenHint()).toBeNull();
    browser(IPHONE_SAFARI, { push: true });
    expect(homeScreenHint()).toBeNull();
    // Before iOS 16.4, not even the Home Screen is notified.
    browser(IPHONE_OLD);
    expect(homeScreenHint()).toBeNull();
    // A Mac (no touch) and anything else push in the tab, or say so themselves.
    browser(IPAD_AS_MAC, { touch: 0, push: true });
    expect(homeScreenHint()).toBeNull();
    browser(IPAD_AS_MAC, { touch: 0 });
    expect(homeScreenHint()).toBeNull();
    browser(ANDROID, { push: true });
    expect(homeScreenHint()).toBeNull();
  });

  it('is told once on a browser: “Not now” is remembered there', async () => {
    const { dismissHomeScreenHint, homeScreenHint } = await import('./homeScreen');
    browser(IPHONE_SAFARI);
    expect(homeScreenHint()).toBe('iphone');
    dismissHomeScreenHint();
    expect(homeScreenHint()).toBeNull();
  });
});
