/**
 * Whether this browser can show Caime's notifications, and what it allows: all the Chats prompt
 * needs up front, so the rest (webPush) loads only when something is pressed or signed in.
 */
export type PushState = 'unsupported' | 'default' | 'granted' | 'denied';

export const webPushSupported =
  typeof window !== 'undefined' &&
  typeof navigator !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window;

export function pushState(): PushState {
  return webPushSupported ? (Notification.permission as PushState) : 'unsupported';
}
