/**
 * The recovery key for private conversations (R41; see e2ee.ts for the design): 160 random bits,
 * shown to the person once as 32 letters and digits in eight groups of four, and never sent
 * anywhere. From it, deterministically, a device of the person's own: the recovery device, which
 * their approving device introduces into their chain like any other, and which every private
 * message is then sealed for too. Its private keys exist only where the key is typed. Losing
 * every device, a new one derives the same keys from the key, reads everything sealed since the
 * recovery device was made, and introduces itself signed by it, so the chain (and the person's
 * security code) is the same as before.
 *
 * The letters are Crockford's base32: no I, L, O or U, so a key written down reads back the same;
 * typed with them, or in lowercase, or without the dashes, it's understood.
 */
import { p256 } from '@noble/curves/nist.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { randomBytes } from '@noble/hashes/utils.js';
import { E2EE_LABEL, type PublicJwk } from './e2ee';
import { tr } from './i18n';

export const RECOVERY_KEY_BYTES = 20;
const GROUPS = 8;
const GROUP = 4;

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const INDEX = new Map<string, number>([...ALPHABET].map((c, i) => [c, i]));
// Read as their look-alikes: a written key survives a slip of the pen.
INDEX.set('O', 0);
INDEX.set('I', 1);
INDEX.set('L', 1);

/** A key pair with its private half as bytes: what a recovery key derives to. */
export interface RawKeyPair {
  publicKey: PublicJwk;
  privateKey: Uint8Array;
}
export interface RawDeviceKeys {
  encryption: RawKeyPair;
  signing: RawKeyPair;
}

/** A new recovery key, as the person is shown it. */
export function newRecoveryKey(): string {
  return formatRecoveryKey(randomBytes(RECOVERY_KEY_BYTES));
}

/** The key's bytes as the person sees them: XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX. */
export function formatRecoveryKey(bytes: Uint8Array): string {
  if (bytes.length !== RECOVERY_KEY_BYTES) throw new Error(tr('Not a recovery key.'));
  let bits = 0;
  let value = 0;
  let out = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += ALPHABET[(value >> bits) & 31] as string;
    }
  }
  return (out.match(new RegExp(`.{${GROUP}}`, 'g')) as string[]).join('-');
}

/**
 * What someone typed as their key, or null if it isn't one. Case, dashes and spaces don't
 * matter, nor do O for 0 and I or L for 1.
 */
export function parseRecoveryKey(typed: string): Uint8Array | null {
  const chars = typed.toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (chars.length !== GROUPS * GROUP) return null;
  const out = new Uint8Array(RECOVERY_KEY_BYTES);
  let bits = 0;
  let value = 0;
  let o = 0;
  for (const c of chars) {
    const v = INDEX.get(c);
    if (v === undefined) return null;
    value = (value << 5) | v;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (value >> bits) & 0xff;
    }
  }
  return out;
}

/** Whether what's typed has a key's shape, for a field to say so before it's tried. */
export const looksLikeRecoveryKey = (typed: string) => parseRecoveryKey(typed) !== null;

const base64url = (b: Uint8Array) =>
  btoa(String.fromCharCode(...b))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');

function jwkOf(privateKey: Uint8Array): PublicJwk {
  const point = p256.getPublicKey(privateKey, false);
  return {
    kty: 'EC',
    crv: 'P-256',
    x: base64url(point.slice(1, 33)),
    y: base64url(point.slice(33, 65)),
  };
}

const derive = (key: Uint8Array, info: string, length: number) =>
  hkdf(
    sha256,
    key,
    new TextEncoder().encode(`${E2EE_LABEL} recovery`),
    new TextEncoder().encode(info),
    length,
  );

/** A P-256 private key from the recovery key, the way the curve turns seed bytes into one. */
function scalar(key: Uint8Array, info: string): Uint8Array {
  return p256.utils.randomSecretKey(derive(key, info, p256.lengths.seed ?? 40));
}

/**
 * The recovery device a key stands for: its id (a UUID, so the server takes it like any device's)
 * and its keys, the same every time from the same key. Its public halves are what the approving
 * device registers; its private halves are made again only where the key is typed.
 */
export function recoveryDevice(key: Uint8Array): { id: string; keys: RawDeviceKeys } {
  if (key.length !== RECOVERY_KEY_BYTES) throw new Error(tr('Not a recovery key.'));
  const id = derive(key, 'id', 16);
  // A version 4, variant 1 UUID, so nothing reads it as anything but an id.
  id[6] = ((id[6] as number) & 0x0f) | 0x40;
  id[8] = ((id[8] as number) & 0x3f) | 0x80;
  const hex = [...id].map((b) => b.toString(16).padStart(2, '0')).join('');
  const encryption = scalar(key, 'encryption');
  const signing = scalar(key, 'signing');
  return {
    id: `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`,
    keys: {
      encryption: { publicKey: jwkOf(encryption), privateKey: encryption },
      signing: { publicKey: jwkOf(signing), privateKey: signing },
    },
  };
}
