/**
 * Notifications in this browser (web push): the service worker (public/sw.js) shows what the
 * server pushes when Caishy isn't open in front, a call ringing above all. The browser asks the
 * person once, from something they pressed; after that, each sign-in on this browser gets its
 * pushes, and a session that ends gets none (the server sends only to live sessions).
 */
import { endpoints } from '@/api/endpoints';

export type PushState = 'unsupported' | 'default' | 'granted' | 'denied';

export const webPushSupported =
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window;

export function pushState(): PushState {
  return webPushSupported ? (Notification.permission as PushState) : 'unsupported';
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
  if (answer === 'granted') await subscribe();
  return answer;
}

/** Signed in where they already said yes: this session gets its pushes too. Never asks. */
export async function resumeWebPush(): Promise<void> {
  if (pushState() !== 'granted') return;
  await subscribe().catch(() => {});
}

/** Off in this browser: the server forgets it, and so does the browser. */
export async function disableWebPush(): Promise<void> {
  if (!webPushSupported) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await endpoints.unsubscribePush(sub.endpoint).catch(() => {});
  await sub.unsubscribe().catch(() => {});
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
