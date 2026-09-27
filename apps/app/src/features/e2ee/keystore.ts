/**
 * Private conversations open on the web for now (R18): the phone apps have no keys of their own
 * yet. The web build uses keystore.web.ts; these keep the same shape.
 */
import type { PublicJwk } from '@caishy/core/e2ee';
import type { DeviceKeys } from '@caishy/core/e2ee-crypto';

export interface StoredDevice {
  id: string;
  keys: DeviceKeys;
}
export interface SeenCode {
  code: string;
  verified: boolean;
  roots?: string[];
}
export interface Pin {
  userId: string;
  encryptionKey: PublicJwk;
  signingKey: PublicJwk;
}
export interface Opened {
  id: string;
  edit: number;
}

export const keystoreSupported = false;
export async function loadDevice(_userId: string): Promise<StoredDevice | null> {
  return null;
}
export async function saveDevice(_userId: string, _device: StoredDevice): Promise<void> {}
export async function forgetDevice(_userId: string): Promise<void> {}
export async function loadSeen(_key: string): Promise<SeenCode | null> {
  return null;
}
export async function saveSeen(_key: string, _seen: SeenCode): Promise<void> {}
export async function loadPin(_key: string): Promise<Pin | null> {
  return null;
}
export async function savePin(_key: string, _pin: Pin): Promise<void> {}
export async function loadPrivate(_key: string): Promise<boolean> {
  return false;
}
export async function savePrivate(_key: string): Promise<void> {}
export async function loadOpened(_key: string): Promise<Opened | null> {
  return null;
}
export async function saveOpened(_key: string, _opened: Opened): Promise<void> {}
