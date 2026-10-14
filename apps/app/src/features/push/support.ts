/**
 * Whether this browser can show Caime's notifications, and what it allows: all the Chats prompt
 * needs up front, so the rest (push.web.ts) loads only when something is pressed or signed in.
 * A phone answers the same questions in support.native.ts.
 */
export type PushState = 'unsupported' | 'default' | 'granted' | 'denied';

export const pushSupported =
  typeof window !== 'undefined' &&
  typeof navigator !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window;

export function pushState(): PushState {
  return pushSupported ? (Notification.permission as PushState) : 'unsupported';
}

/** What it allows now, as a phone has to ask: a browser knows at once. */
export async function readPushState(): Promise<PushState> {
  return pushState();
}

const SEEN = 'caime.push-prompt';
function seen(): boolean {
  try {
    return globalThis.localStorage?.getItem(SEEN) === '1';
  } catch {
    return true;
  }
}

/** Whether Chats offers to turn them on, known at the first frame (a browser that wasn't asked). */
export function promptAtStart(): boolean {
  return pushState() === 'default' && !seen();
}

/** The same, for a device that has to look it up: a browser knows already. */
export async function promptLater(): Promise<boolean> {
  return promptAtStart();
}

/** Asked once: whatever they answered, Chats doesn't offer it again here. */
export function promptAnswered(): void {
  try {
    globalThis.localStorage?.setItem(SEEN, '1');
  } catch {
    // Private browsing: it asks again next time.
  }
}
