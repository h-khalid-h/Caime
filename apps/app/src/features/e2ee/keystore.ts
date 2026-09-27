/**
 * Private conversations open on the web for now (R18): the phone apps have no keys of their own
 * yet. The web build uses keystore.web.ts; these keep the same shape.
 */
import type { DeviceKeys } from '@caishy/core/e2ee-crypto';

export interface StoredDevice {
  id: string;
  keys: DeviceKeys;
}
export interface SeenCode {
  code: string;
  verified: boolean;
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
