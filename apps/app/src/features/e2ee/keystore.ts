/**
 * The phone's keys for private conversations (R18), and what it has confirmed; the web's are in
 * keystore.web.ts, with the same shape. A device's private keys are in the phone's own secure
 * storage (the iOS Keychain, the Android Keystore), readable once the phone has been unlocked
 * since it started, and never copied to a backup or another phone (`THIS_DEVICE_ONLY`): a phone
 * restored from a backup is a new device, and asks to be approved like one. What isn't secret
 * (the devices confirmed here and their public keys, the security codes seen, which
 * conversations are private, the newest edit opened) is in AsyncStorage. Nothing here is ever
 * sent. A phone keeps them when the account signs out (R41), unlike a browser.
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
/**
 * A phone keeps its keys when the account signs out (R41): it's personal and behind its lock, so
 * signing in again picks the same device up, approved as it was. A browser lets them go.
 */
export const keystoreKeepsKeys = true;

const SECURE = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
} as const;
/** Secure storage takes letters, digits, dots, dashes and underscores in its keys. */
const deviceKey = (userId: string) => `caime-e2ee.device.${userId.replace(/[^\w.-]/g, '_')}`;
const recoveryKey = (userId: string) => `caime-e2ee.recovery.${userId.replace(/[^\w.-]/g, '_')}`;

/** What the secure storage holds for a device: its id and its keys' halves. */
interface Kept {
  id: string;
  e: { pub: PublicJwk; key: string };
  s: { pub: PublicJwk; key: string };
}

async function loadKept(at: string): Promise<StoredDevice | null> {
  const raw = await SecureStore.getItemAsync(at, SECURE);
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
async function saveKept(at: string, device: StoredDevice): Promise<void> {
  const { encryption: e, signing: s } = device.keys;
  const kept: Kept = {
    id: device.id,
    e: { pub: e.publicKey, key: toBase64Url(e.privateKey) },
    s: { pub: s.publicKey, key: toBase64Url(s.privateKey) },
  };
  await SecureStore.setItemAsync(at, JSON.stringify(kept), SECURE);
}

/** This account's device on this phone, if it has one. */
export const loadDevice = (userId: string) => loadKept(deviceKey(userId));
export const saveDevice = (userId: string, device: StoredDevice) =>
  saveKept(deviceKey(userId), device);

/** The recovery device's keys, derived here from the key the person typed (R41). */
export const loadRecovery = (userId: string) => loadKept(recoveryKey(userId));
export const saveRecovery = (userId: string, device: StoredDevice) =>
  saveKept(recoveryKey(userId), device);
export const forgetRecovery = (userId: string) =>
  SecureStore.deleteItemAsync(recoveryKey(userId), SECURE);

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
 * Signed out: a phone keeps the account's keys and what it confirmed (R41), so signing in again
 * picks its device up; nothing here opens without the account signed in and the device still
 * the account's on the server. What's gone for good goes with the device: removed from another
 * device, or the account starting over there, it registers afresh next time (`dropDevice`).
 */
export async function forgetDevice(_userId: string): Promise<void> {}

/** This phone's device is no longer the account's: its keys go (what it confirmed stays). */
export async function dropDevice(userId: string): Promise<void> {
  await SecureStore.deleteItemAsync(deviceKey(userId), SECURE);
  await SecureStore.deleteItemAsync(recoveryKey(userId), SECURE);
}
