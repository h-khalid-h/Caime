/**
 * Notifications in this browser (web push): the service worker (public/sw.js) shows what the
 * server pushes when Caishy isn't open in front, a call ringing above all. The browser asks the
 * person once, from something they pressed; after that, each sign-in on this browser gets its
 * pushes, and a session that ends gets none (the server sends only to live sessions).
 */
import { endpoints } from '@/api/endpoints';
import { type PushState, pushState, webPushSupported } from './support';

export { type PushState, pushState, webPushSupported };

/**
 * Turned off here, it stays off: the browser still allows them (a page can't take that back), so
 * this says not to subscribe again on the next load or sign-in, until they turn them on.
 */
const OFF_KEY = 'caishy.push-off';
function turnedOff(): boolean {
  try {
    return globalThis.localStorage?.getItem(OFF_KEY) === '1';
  } catch {
    return false;
  }
}
function setTurnedOff(off: boolean): void {
  try {
    if (off) globalThis.localStorage?.setItem(OFF_KEY, '1');
    else globalThis.localStorage?.removeItem(OFF_KEY);
  } catch {
    // Storage blocked: nothing to remember it in.
  }
}

/** A VAPID public key, as the browser wants it. */
function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const padded = `${base64url}${'='.repeat((4 - (base64url.length % 4)) % 4)}`
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const sameKey = (sub: PushSubscription, key: Uint8Array) => {
  const held = sub.options.applicationServerKey;
  if (!held) return false;
  const bytes = new Uint8Array(held);
  return bytes.length === key.length && bytes.every((b, i) => b === key[i]);
};

async function registration(): Promise<ServiceWorkerRegistration> {
  await navigator.serviceWorker.register('/sw.js');
  return navigator.serviceWorker.ready;
}

/** This browser's subscription, made (or made again, for a new server key) and told to the server. */
async function subscribe(): Promise<void> {
  const reg = await registration();
  const key = keyBytes((await endpoints.pushKey()).publicKey);
  let sub = await reg.pushManager.getSubscription();
  if (sub && !sameKey(sub, key)) {
    await sub.unsubscribe().catch(() => {});
    sub = null;
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) throw new Error('No subscription');
  await endpoints.subscribePush({
    kind: 'webpush',
    subscription: {
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    },
  });
}

/** Turn them on, from a button: the browser asks the person. */
export async function enableWebPush(): Promise<PushState> {
  if (!webPushSupported) return 'unsupported';
  const answer = (await Notification.requestPermission()) as PushState;
  if (answer === 'granted') {
    setTurnedOff(false);
    await subscribe();
  }
  return answer;
}

/**
 * Signed in where they already said yes: this session gets its pushes too. Never asks, and never
 * while they've turned them off here.
 */
export async function resumeWebPush(): Promise<void> {
  if (pushState() !== 'granted' || turnedOff()) return;
  await subscribe().catch(() => {});
}

/** This browser's subscription gone: from the server (while it can still be asked), and here. */
async function unsubscribe(tellServer: boolean): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  if (tellServer) await endpoints.unsubscribePush(sub.endpoint).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}

/** Off in this browser, and kept off: the server forgets it, and so does the browser. */
export async function disableWebPush(): Promise<void> {
  if (!webPushSupported) return;
  setTurnedOff(true);
  await unsubscribe(true);
}

/**
 * What this browser shows of Caishy's notifications, closed: those read (on any device), or all.
 * A notification read in the app has nothing more to say on the lock screen.
 */
export async function closeShownNotifications(ids: string[] | null): Promise<void> {
  if (!webPushSupported) return;
  const reg = await navigator.serviceWorker.getRegistration().catch(() => undefined);
  if (!reg?.getNotifications) return;
  const shown = await reg.getNotifications().catch(() => []);
  for (const n of shown) {
    const id = (n.data as { id?: unknown } | null)?.id;
    if (ids === null || (typeof id === 'string' && ids.includes(id))) n.close();
  }
}

/**
 * Signing out here: pushes for this session stop even if the server can't be told (the browser
 * drops its subscription), and what's shown goes with it, so the next person to use this browser
 * sees none of it. Signing in again subscribes afresh, unless they'd turned them off.
 */
export async function leaveThisBrowser({ tellServer }: { tellServer: boolean }): Promise<void> {
  if (!webPushSupported) return;
  await unsubscribe(tellServer).catch(() => {});
  await closeShownNotifications(null);
}

/** Whether this browser has a subscription now (for Settings). */
export async function webPushOn(): Promise<boolean> {
  if (pushState() !== 'granted') return false;
  const reg = await navigator.serviceWorker.getRegistration();
  return Boolean(await reg?.pushManager.getSubscription());
}

/** A tapped notification asks the open tab to go there (no reload: a call or draft stays). */
export function onOpenFromNotification(go: (path: string) => void): () => void {
  if (!webPushSupported) return () => {};
  const heard = (e: MessageEvent) => {
    const m = e.data as { type?: string; path?: unknown } | null;
    if (m?.type === 'caishy.open' && typeof m.path === 'string' && m.path.startsWith('/'))
      go(m.path);
  };
  navigator.serviceWorker.addEventListener('message', heard);
  return () => navigator.serviceWorker.removeEventListener('message', heard);
}
