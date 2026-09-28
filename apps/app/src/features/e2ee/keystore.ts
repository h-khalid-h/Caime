/**
 * The phone's keys for private conversations (R18), and what it has confirmed; the web's are in
 * keystore.web.ts, with the same shape. A device's private keys are in the phone's own secure
 * storage (the iOS Keychain, the Android Keystore), readable once the phone has been unlocked
 * since it started, and never copied to a backup or another phone (`THIS_DEVICE_ONLY`): a phone
 * restored from a backup is a new device, and asks to be approved like one. What isn't secret
 * (the devices confirmed here and their public keys, the security codes seen, which
 * conversations are private, the newest edit opened) is in AsyncStorage. Nothing here is ever
 * sent, and everything of an account's goes when it signs out here.
 *
 * A failed read of the secure storage throws, never answers "no keys": the caller must not make
 * new ones and leave everything sealed for this phone unreadable.
 */
import type { PublicJwk } from '@caime/core/e2ee';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { type DeviceKeys, fromBase64Url, toBase64Url } from './crypto';

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

export const keystoreSupported = true;

const SECURE = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
} as const;
/** Secure storage takes letters, digits, dots, dashes and underscores in its keys. */
const deviceKey = (userId: string) => `caime-e2ee.device.${userId.replace(/[^\w.-]/g, '_')}`;

/** What the secure storage holds for a device: its id and its keys' halves. */
interface Kept {
  id: string;
  e: { pub: PublicJwk; key: string };
  s: { pub: PublicJwk; key: string };
}

/** This account's device on this phone, if it has one. */
export async function loadDevice(userId: string): Promise<StoredDevice | null> {
  const raw = await SecureStore.getItemAsync(deviceKey(userId), SECURE);
  if (raw == null) return null;
  const kept = JSON.parse(raw) as Kept;
  return {
    id: kept.id,
    keys: {
      encryption: { publicKey: kept.e.pub, privateKey: fromBase64Url(kept.e.key) },
      signing: { publicKey: kept.s.pub, privateKey: fromBase64Url(kept.s.key) },
    },
  };
}

export async function saveDevice(userId: string, device: StoredDevice): Promise<void> {
  const { encryption: e, signing: s } = device.keys;
  const kept: Kept = {
    id: device.id,
    e: { pub: e.publicKey, key: toBase64Url(e.privateKey) },
    s: { pub: s.publicKey, key: toBase64Url(s.privateKey) },
  };
  await SecureStore.setItemAsync(deviceKey(userId), JSON.stringify(kept), SECURE);
}

// The rest, by store and key (each key starts with the account's id and "|", as on the web).
const PREFIX = 'caime-e2ee:';
const at = (store: string, key: string) => `${PREFIX}${store}:${key}`;
async function get<T>(store: string, key: string): Promise<T | null> {
  const raw = await AsyncStorage.getItem(at(store, key));
  return raw == null ? null : (JSON.parse(raw) as T);
}
const put = (store: string, key: string, value: unknown) =>
  AsyncStorage.setItem(at(store, key), JSON.stringify(value));

export const loadSeen = (key: string) => get<SeenCode>('seen', key);
export const saveSeen = (key: string, seen: SeenCode) => put('seen', key, seen);

export const loadPin = (key: string) => get<Pin>('pins', key);
export const savePin = (key: string, pin: Pin) => put('pins', key, pin);

export const loadPrivate = async (key: string) => Boolean(await get<boolean>('private', key));
export const savePrivate = (key: string) => put('private', key, true);

export const loadOpened = (key: string) => get<Opened>('edits', key);
export const saveOpened = (key: string, opened: Opened) => put('edits', key, opened);

/**
 * Signed out: this phone's keys for the account go, so nothing sealed for them opens here, and
 * everything else it kept of the account's private conversations with them.
 */
export async function forgetDevice(userId: string): Promise<void> {
  await SecureStore.deleteItemAsync(deviceKey(userId), SECURE);
  const mine = (await AsyncStorage.getAllKeys()).filter((k) => {
    if (!k.startsWith(PREFIX)) return false;
    const rest = k.slice(k.indexOf(':', PREFIX.length) + 1);
    return rest.startsWith(`${userId}|`);
  });
  if (mine.length) await AsyncStorage.multiRemove(mine);
}
