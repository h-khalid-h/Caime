/**
 * Base64url without padding, in plain JavaScript and the same on every platform: the phone's
 * private-conversation crypto (`e2ee-noble.ts`) and an account's sealed access
 * (`contact-seal.ts`) both read and write it.
 */
import { tr } from './i18n';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const INDEX = new Map([...ALPHABET].map((c, i) => [c, i]));

export function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < b.length; i += 3) {
    const n = ((b[i] as number) << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0);
    s += ALPHABET[(n >> 18) & 63] as string;
    s += ALPHABET[(n >> 12) & 63] as string;
    if (i + 1 < b.length) s += ALPHABET[(n >> 6) & 63] as string;
    if (i + 2 < b.length) s += ALPHABET[n & 63] as string;
  }
  return s;
}

export function fromBase64Url(s: string): Uint8Array {
  const clean = s.replace(/=+$/, '').replaceAll('+', '-').replaceAll('/', '_');
  if (clean.length % 4 === 1) throw new Error(tr('Not base64.'));
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let bits = 0;
  let value = 0;
  let o = 0;
  for (const c of clean) {
    const v = INDEX.get(c);
    if (v === undefined) throw new Error(tr('Not base64.'));
    value = (value << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (value >> bits) & 0xff;
    }
  }
  return out;
}
