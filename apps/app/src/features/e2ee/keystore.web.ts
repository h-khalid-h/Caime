/**
 * This browser's keys for private conversations (R18), in IndexedDB, and what it has confirmed:
 * the device's key pairs (their private halves unexportable, so even this page can't read them
 * out); each device it has confirmed, with its keys (pins: a later answer from the server never
 * changes them); each person's security code last seen and the first devices of theirs accepted;
 * which conversations it has seen as private; and the newest edit of each private message
 * opened. Nothing here is ever sent. Everything of an account's goes when it signs out here.
 */
import type { PublicJwk } from '@caishy/core/e2ee';
import type { DeviceKeys } from '@caishy/core/e2ee-crypto';

export interface StoredDevice {
  id: string;
  keys: DeviceKeys;
}
export interface SeenCode {
  code: string;
  /** Compared with the person, and marked as theirs. */
  verified: boolean;
  /** The first devices of theirs accepted here (a new one after they start over, once seen). */
  roots?: string[];
}
/** A device confirmed here: whose it is and its keys, as they were then. */
export interface Pin {
  userId: string;
  encryptionKey: PublicJwk;
  signingKey: PublicJwk;
}
/** The newest edit of a private message opened here, and which message it was. */
export interface Opened {
  id: string;
  edit: number;
}

const NAME = 'caishy-e2ee';
const DEVICES = 'devices';
const SEEN = 'seen';
const PINS = 'pins';
const PRIVATE = 'private';
const EDITS = 'edits';
const STORES = [DEVICES, SEEN, PINS, PRIVATE, EDITS];

export const keystoreSupported = typeof indexedDB !== 'undefined';

let opening: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(NAME, 2);
    req.onupgradeneeded = () => {
      for (const s of STORES)
        if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s);
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
const get = async <T>(store: string, key: string): Promise<T | null> =>
  ((await run(store, 'readonly', (s) => s.get(key))) as T | undefined) ?? null;
const put = async (store: string, key: string, value: unknown): Promise<void> => {
  await run(store, 'readwrite', (s) => s.put(value, key));
};

/** This account's device on this browser, if it has one. */
export const loadDevice = (userId: string) => get<StoredDevice>(DEVICES, userId);
export const saveDevice = (userId: string, device: StoredDevice) => put(DEVICES, userId, device);

export const loadSeen = (key: string) => get<SeenCode>(SEEN, key);
export const saveSeen = (key: string, seen: SeenCode) => put(SEEN, key, seen);

export const loadPin = (key: string) => get<Pin>(PINS, key);
export const savePin = (key: string, pin: Pin) => put(PINS, key, pin);

export const loadPrivate = async (key: string) => Boolean(await get<boolean>(PRIVATE, key));
export const savePrivate = (key: string) => put(PRIVATE, key, true);

export const loadOpened = (key: string) => get<Opened>(EDITS, key);
export const saveOpened = (key: string, opened: Opened) => put(EDITS, key, opened);

/**
 * Signed out: this browser's keys for the account go, so nothing sealed for them opens here, and
 * everything else it kept of the account's private conversations with them.
 */
export async function forgetDevice(userId: string): Promise<void> {
  await run(DEVICES, 'readwrite', (s) => s.delete(userId));
  const mine = IDBKeyRange.bound(`${userId}|`, `${userId}|￿`);
  for (const store of [SEEN, PINS, PRIVATE, EDITS])
    await run(store, 'readwrite', (s) => s.delete(mine));
}
