/**
 * Whether the device is online, and when that changes. On the web these are the browser's own
 * `online`/`offline` events: NetInfo's web build listens to `navigator.connection` instead, which
 * Chromium fires when the network drops but not when it returns, so the app stayed "offline"
 * after every blip. Native uses NetInfo (network.native.ts).
 */
export function onNetworkChange(listener: (online: boolean) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const online = () => listener(true);
  const offline = () => listener(false);
  window.addEventListener('online', online);
  window.addEventListener('offline', offline);
  if (typeof navigator !== 'undefined' && navigator.onLine === false) listener(false);
  return () => {
    window.removeEventListener('online', online);
    window.removeEventListener('offline', offline);
  };
}
