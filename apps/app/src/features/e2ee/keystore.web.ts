/**
 * This browser's keys for private conversations (R18), in IndexedDB: the device's key pairs
 * (their private halves unexportable, so even this page can't read them out), and the security
 * code last seen for each person, to say when one changes. Nothing here is ever sent.
 */
import type { DeviceKeys } from '@caishy/core/e2ee-crypto';

export interface StoredDevice {
  id: string;
  keys: DeviceKeys;
}
export interface SeenCode {
  code: string;
  /** Compared with the person, and marked as theirs. */
  verified: boolean;
}

const NAME = 'caishy-e2ee';
const DEVICES = 'devices';
const SEEN = 'seen';

export const keystoreSupported = typeof indexedDB !== 'undefined';

let opening: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(DEVICES);
      req.result.createObjectStore(SEEN);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      opening = null;
      reject(req.error);
    };
  });
  return opening;
}

async function run<T>(
  store: string,
  mode: IDBTransactionMode,
  f: (s: IDBObjectStore) => IDBRequest<T>,
) {
  const d = await db();
  return new Promise<T>((resolve, reject) => {
    const tx = d.transaction(store, mode);
    const req = f(tx.objectStore(store));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** This account's device on this browser, if it has one. */
export async function loadDevice(userId: string): Promise<StoredDevice | null> {
  return (
    ((await run(DEVICES, 'readonly', (s) => s.get(userId))) as StoredDevice | undefined) ?? null
  );
}
export async function saveDevice(userId: string, device: StoredDevice): Promise<void> {
  await run(DEVICES, 'readwrite', (s) => s.put(device, userId));
}
/** Signed out: this browser's keys for the account go, and nothing sealed for them opens here. */
export async function forgetDevice(userId: string): Promise<void> {
  await run(DEVICES, 'readwrite', (s) => s.delete(userId));
}

export async function loadSeen(key: string): Promise<SeenCode | null> {
  return ((await run(SEEN, 'readonly', (s) => s.get(key))) as SeenCode | undefined) ?? null;
}
export async function saveSeen(key: string, seen: SeenCode): Promise<void> {
  await run(SEEN, 'readwrite', (s) => s.put(seen, key));
}
