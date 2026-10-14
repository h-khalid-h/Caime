/**
 * An account's access, sealed to the device that asked for it (R89). The device makes a key and
 * gives it to the server with its request to start; the server seals the provider's access to it
 * before handing it back through the browser, so whatever reads the address it comes back on
 * (another app that claims Caime's scheme, a browser's history) reads nothing it can use, and
 * the server keeps nothing. AES-256-GCM: a 12-byte nonce, then the ciphertext with its tag; the
 * account's name is the associated data, so one account's access never opens as another's.
 *
 * The server seals with Node's own AES-GCM (`lib/contact-accounts.ts`), byte for byte this.
 */
import { gcm } from '@noble/ciphers/aes.js';
import { fromBase64Url, toBase64Url } from './base64url';
import { type ContactAccount, contactSealLabel } from './contact-return';

export const CONTACT_KEY_BYTES = 32;
const NONCE_BYTES = 12;

/** A fresh key for one request, as the device sends it. */
export function newContactKey(): string {
  const key = new Uint8Array(CONTACT_KEY_BYTES);
  globalThis.crypto.getRandomValues(key);
  return toBase64Url(key);
}

function keyOf(key: string): Uint8Array | null {
  try {
    const bytes = fromBase64Url(key);
    return bytes.length === CONTACT_KEY_BYTES ? bytes : null;
  } catch {
    return null;
  }
}

/** Seals an access for the device holding `key` (what the server does; here for the tests). */
export function sealContactAccess(key: string, account: ContactAccount, access: string): string {
  const k = keyOf(key);
  if (!k) throw new Error('not a contact key');
  const nonce = new Uint8Array(NONCE_BYTES);
  globalThis.crypto.getRandomValues(nonce);
  const label = new TextEncoder().encode(contactSealLabel(account));
  const sealed = gcm(k, nonce, label).encrypt(new TextEncoder().encode(access));
  const out = new Uint8Array(NONCE_BYTES + sealed.length);
  out.set(nonce);
  out.set(sealed, NONCE_BYTES);
  return toBase64Url(out);
}

/** The access sealed for this device, or null when it wasn't sealed with its key, or for it. */
export function openContactAccess(
  key: string,
  account: ContactAccount,
  sealed: string,
): string | null {
  const k = keyOf(key);
  if (!k) return null;
  try {
    const bytes = fromBase64Url(sealed);
    if (bytes.length <= NONCE_BYTES + 16) return null;
    const label = new TextEncoder().encode(contactSealLabel(account));
    const plain = gcm(k, bytes.slice(0, NONCE_BYTES), label).decrypt(bytes.slice(NONCE_BYTES));
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}
