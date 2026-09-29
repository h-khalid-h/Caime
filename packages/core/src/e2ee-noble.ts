/**
 * The same end-to-end encryption as e2ee-crypto.ts (R18; see e2ee.ts for the design), without
 * Web Crypto: for the phone apps, whose JavaScript engine has none. Pure JavaScript from the
 * audited @noble libraries: P-256 for ECDH and ECDSA, HKDF and SHA-256, AES-KW and AES-GCM.
 *
 * What it makes and reads is byte for byte what Web Crypto makes and reads: a message sealed in
 * a browser opens on a phone and the other way round, introductions and security codes match
 * (e2ee-noble.test.ts checks each against Web Crypto). The one difference is where a private key
 * lives: Web Crypto keeps it unexportable, here it's 32 bytes the app keeps in the phone's own
 * secure storage (the iOS Keychain, the Android Keystore). The two modules export the same
 * functions; only what DeviceKeys holds differs, and nothing outside them looks inside it.
 */
import { aeskw, gcm } from '@noble/ciphers/aes.js';
import { p256 } from '@noble/curves/nist.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { randomBytes } from '@noble/hashes/utils.js';
import {
  canonical,
  ecPublic,
  type IntroducedDevice,
  introductionText,
  E2EE_LABEL as LABEL,
  type PrivatePayload,
  type PublicDevice,
  type PublicJwk,
  type SealedMessage,
} from './e2ee';
import type { RawDeviceKeys } from './e2ee-recovery';

/** A P-256 key pair: the public half as JSON, the private half as its 32 bytes. */
export interface KeyPair {
  publicKey: PublicJwk;
  privateKey: Uint8Array;
}

/** A device's keys, as kept on the device (in its secure storage, never sent). */
export interface DeviceKeys {
  encryption: KeyPair;
  signing: KeyPair;
}

export type OpenResult =
  | { ok: true; payload: PrivatePayload }
  /** This device wasn't one it was sent to (it was added later, or signed in after). */
  | { ok: false; reason: 'not_for_this_device' }
  /** The signature doesn't match the device it says it's from: never shown. */
  | { ok: false; reason: 'unverified' }
  | { ok: false; reason: 'unreadable' };

/** Whether this runtime has what private conversations need: a source of secure randomness. */
export const e2eeSupported = () => typeof globalThis.crypto?.getRandomValues === 'function';

// UTF-8 and base64url by hand: the phones' engine has no TextDecoder, and atob isn't everywhere.
function utf8(s: string): Uint8Array {
  const out: number[] = [];
  for (const ch of s) {
    const at = ch.codePointAt(0) as number;
    // A lone surrogate is written as U+FFFD, as TextEncoder writes it.
    const c = at >= 0xd800 && at <= 0xdfff ? 0xfffd : at;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else
      out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return Uint8Array.from(out);
}

/** Strict UTF-8: anything malformed throws, as Web Crypto's reader (TextDecoder) would not. */
function fromUtf8(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; ) {
    const x = b[i++] as number;
    const more = x < 0x80 ? 0 : x >= 0xf0 ? 3 : x >= 0xe0 ? 2 : x >= 0xc0 ? 1 : -1;
    if (more < 0 || i + more > b.length) throw new Error('Not UTF-8.');
    let c = more === 0 ? x : x & (0x3f >> more);
    for (let k = 0; k < more; k++) {
      const y = b[i++] as number;
      if ((y & 0xc0) !== 0x80) throw new Error('Not UTF-8.');
      c = (c << 6) | (y & 63);
    }
    s += String.fromCodePoint(c);
  }
  return s;
}

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
  if (clean.length % 4 === 1) throw new Error('Not base64.');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let bits = 0;
  let value = 0;
  let o = 0;
  for (const c of clean) {
    const v = INDEX.get(c);
    if (v === undefined) throw new Error('Not base64.');
    value = (value << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (value >> bits) & 0xff;
    }
  }
  return out;
}

/** A private key's public half as the JWK Web Crypto exports. */
function jwkOf(privateKey: Uint8Array): PublicJwk {
  const point = p256.getPublicKey(privateKey, false);
  return {
    kty: 'EC',
    crv: 'P-256',
    x: toBase64Url(point.slice(1, 33)),
    y: toBase64Url(point.slice(33, 65)),
  };
}

/** A public JWK as the uncompressed point P-256 takes (checked to be on the curve). */
function pointOf(k: PublicJwk): Uint8Array {
  const { kty, crv, x, y } = ecPublic(k);
  if (kty !== 'EC' || crv !== 'P-256') throw new Error('Not a P-256 key.');
  const xs = fromBase64Url(x);
  const ys = fromBase64Url(y);
  if (xs.length !== 32 || ys.length !== 32) throw new Error('Not a P-256 key.');
  const point = new Uint8Array(65);
  point[0] = 4;
  point.set(xs, 1);
  point.set(ys, 33);
  p256.Point.fromBytes(point).assertValidity();
  return point;
}

const pair = (): KeyPair => {
  const privateKey = p256.utils.randomSecretKey();
  return { publicKey: jwkOf(privateKey), privateKey };
};

/** A new device's keys, made here. */
export async function newDeviceKeys(): Promise<DeviceKeys> {
  return { encryption: pair(), signing: pair() };
}

/** Keys made elsewhere (the recovery device's), as this device holds keys: as they are. */
export async function importDeviceKeys(raw: RawDeviceKeys): Promise<DeviceKeys> {
  return {
    encryption: {
      publicKey: ecPublic(raw.encryption.publicKey),
      privateKey: raw.encryption.privateKey,
    },
    signing: { publicKey: ecPublic(raw.signing.publicKey), privateKey: raw.signing.privateKey },
  };
}

/** A device's public keys, to register with the server. */
export async function publicKeys(
  keys: DeviceKeys,
): Promise<{ encryptionKey: PublicJwk; signingKey: PublicJwk }> {
  return {
    encryptionKey: ecPublic(keys.encryption.publicKey),
    signingKey: ecPublic(keys.signing.publicKey),
  };
}

/**
 * The key that wraps a message's key for one device: Web Crypto's ECDH deriveBits (the shared
 * point's x coordinate), then HKDF-SHA-256 into an AES-KW key.
 */
function wrappingKey(
  privateKey: Uint8Array,
  publicKey: PublicJwk,
  cid: string,
  deviceId: string,
): Uint8Array {
  const secret = p256.getSharedSecret(privateKey, pointOf(publicKey), true).slice(1);
  return hkdf(sha256, secret, utf8(cid), utf8(`${LABEL} wrap|${deviceId}`), 32);
}

/** Bound into the encryption: which conversation, which message, which device (and whose). */
const associated = (
  conversationId: string,
  s: Pick<SealedMessage, 'cid' | 'edit' | 'from' | 'by'>,
) => utf8(`${LABEL}|${conversationId}|${s.cid}|${s.edit}|${s.from}|${s.by}`);

/** The bytes the sending device signs: everything in the envelope, and its conversation. */
const signed = (conversationId: string, s: Omit<SealedMessage, 'sig'>) =>
  utf8(canonical({ ...s, epk: ecPublic(s.epk), conversationId, label: LABEL }));

/** ECDSA with SHA-256, as Web Crypto signs: r and s, 32 bytes each. */
const sign = (privateKey: Uint8Array, message: Uint8Array) =>
  p256.sign(message, privateKey, { prehash: true, format: 'compact' });

/** Web Crypto's signatures aren't normalized to a low s, so both halves of the curve verify. */
function verify(signingKey: PublicJwk, signature: Uint8Array, message: Uint8Array): boolean {
  try {
    return p256.verify(signature, message, pointOf(signingKey), {
      prehash: true,
      lowS: false,
      format: 'compact',
    });
  } catch {
    return false;
  }
}

/**
 * Encrypt a message for these devices, from this one. `to` should be every device of everyone
 * in the conversation (this person's own included): no other device will ever read it.
 */
export async function seal(input: {
  conversationId: string;
  cid: string;
  edit?: number;
  payload: PrivatePayload;
  /** This device, and whose it is. */
  from: { id: string; userId: string; keys: DeviceKeys };
  to: Array<Pick<PublicDevice, 'id' | 'encryptionKey'>>;
}): Promise<SealedMessage> {
  const head = {
    v: 1 as const,
    cid: input.cid,
    edit: input.edit ?? 0,
    from: input.from.id,
    by: input.from.userId,
  };
  const messageKey = randomBytes(32);
  const iv = randomBytes(12);
  const ct = gcm(messageKey, iv, associated(input.conversationId, head)).encrypt(
    utf8(JSON.stringify(input.payload)),
  );
  const ephemeral = pair();
  const keys: Record<string, string> = {};
  for (const d of input.to) {
    if (keys[d.id]) continue;
    const wrap = wrappingKey(ephemeral.privateKey, d.encryptionKey, input.cid, d.id);
    keys[d.id] = toBase64Url(aeskw(wrap).encrypt(messageKey));
  }
  const body: Omit<SealedMessage, 'sig'> = {
    ...head,
    epk: ephemeral.publicKey,
    iv: toBase64Url(iv),
    ct: toBase64Url(ct),
    keys,
  };
  const sig = sign(input.from.keys.signing.privateKey, signed(input.conversationId, body));
  return { ...body, sig: toBase64Url(sig) };
}

/**
 * Read a message on this device: only if it was sealed for it, and only if the device it says
 * it's from signed it, as the person the server lists that device under. `sender` is that
 * device as the server lists it.
 */
export async function open(input: {
  conversationId: string;
  sealed: SealedMessage;
  me: { id: string; keys: DeviceKeys };
  sender: Pick<PublicDevice, 'id' | 'userId' | 'signingKey'> | null;
}): Promise<OpenResult> {
  const { sealed } = input;
  try {
    if (!input.sender || input.sender.id !== sealed.from || input.sender.userId !== sealed.by)
      return { ok: false, reason: 'unverified' };
    const { sig, ...body } = sealed;
    if (!verify(input.sender.signingKey, fromBase64Url(sig), signed(input.conversationId, body)))
      return { ok: false, reason: 'unverified' };
    const mine = sealed.keys[input.me.id];
    if (!mine) return { ok: false, reason: 'not_for_this_device' };
    const unwrap = wrappingKey(
      input.me.keys.encryption.privateKey,
      sealed.epk,
      sealed.cid,
      input.me.id,
    );
    const messageKey = aeskw(unwrap).decrypt(fromBase64Url(mine));
    if (messageKey.length !== 32) return { ok: false, reason: 'unreadable' };
    const plain = gcm(
      messageKey,
      fromBase64Url(sealed.iv),
      associated(input.conversationId, sealed),
    ).decrypt(fromBase64Url(sealed.ct));
    const payload = JSON.parse(fromUtf8(plain)) as PrivatePayload;
    if (typeof payload?.body !== 'string') return { ok: false, reason: 'unreadable' };
    const r = payload.replyTo;
    if (
      r != null &&
      (typeof r !== 'object' || typeof r.by !== 'string' || typeof r.cid !== 'string')
    )
      return { ok: false, reason: 'unreadable' };
    return { ok: true, payload };
  } catch {
    return { ok: false, reason: 'unreadable' };
  }
}

/**
 * Introduce a device: signed by the device of the same person that approves it, or, the first of
 * a chain, by the device itself.
 */
export async function introduce(
  signer: { keys: DeviceKeys },
  device: PublicDevice,
): Promise<string> {
  return toBase64Url(sign(signer.keys.signing.privateKey, utf8(introductionText(device))));
}

function introducedBy(device: IntroducedDevice, signingKey: PublicJwk): boolean {
  try {
    return verify(signingKey, fromBase64Url(device.introduction), utf8(introductionText(device)));
  } catch {
    return false;
  }
}

/**
 * The first device of the chain a device belongs to: each introduction checked against the device
 * that made it, all of one person's, up to one that vouches for itself. Null if any link doesn't
 * hold (or the chain loops, or runs away), or `stop` is reached first: a device already confirmed,
 * whose own chain was checked when it was.
 */
export async function chainRoot(
  device: IntroducedDevice,
  lookup: (id: string) => IntroducedDevice | undefined,
  stop?: (d: IntroducedDevice) => boolean,
): Promise<IntroducedDevice | null> {
  const seen = new Set<string>();
  let d: IntroducedDevice | undefined = device;
  while (d && seen.size < 500) {
    if (seen.has(d.id) || d.userId !== device.userId) return null;
    seen.add(d.id);
    if (d !== device && stop?.(d)) return d;
    if (!d.introducedBy) return introducedBy(d, d.signingKey) ? d : null;
    const by = lookup(d.introducedBy);
    if (!by || !introducedBy(d, by.signingKey)) return null;
    d = by;
  }
  return null;
}

/**
 * Someone's security code: 30 digits from the public keys of the first device of their chain, the
 * same wherever it's worked out. Two people compare them; it changes only when they start over.
 */
export async function securityCode(
  devices: Array<Pick<PublicDevice, 'id' | 'encryptionKey' | 'signingKey'>>,
): Promise<string> {
  const lines = devices
    .map((d) => canonical({ id: d.id, e: ecPublic(d.encryptionKey), s: ecPublic(d.signingKey) }))
    .sort();
  const digest = sha256(utf8(`${LABEL}|${lines.join('\n')}`));
  const groups: string[] = [];
  for (let i = 0; i < 6; i++) {
    let n = 0;
    for (let j = 0; j < 5; j++) n = n * 256 + (digest[i * 5 + j] ?? 0);
    groups.push(String(n % 100_000).padStart(5, '0'));
  }
  return groups.join(' ');
}
