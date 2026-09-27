/**
 * End-to-end encryption for private conversations (R18, PRD §61), with the Web Crypto API (the
 * browser's, and Node's for tests), so no key or message text ever reaches the server in the
 * clear.
 *
 * Every device (a browser signed in to an account) has two P-256 key pairs of its own: one to
 * receive (ECDH) and one to sign (ECDSA). Their private halves are made non-extractable and never
 * leave the device. A message is encrypted once with a fresh AES-256-GCM key; that key is then
 * wrapped for each device allowed to read it (every device of everyone in the conversation, the
 * sender's included) with a key derived by HKDF from an ephemeral ECDH exchange with that device.
 * The sending device signs the whole envelope, so the server can neither read a message, nor
 * alter or forge one, nor move one to another conversation, nor pass it off as someone else's:
 * the conversation, the sender's message id, the device and whose it is are bound into the
 * encryption (as associated data) and into the signature.
 *
 * Which devices are whose isn't taken from the server either. A person's devices form a chain:
 * their first device vouches for itself (it signs its own introduction: whose it is, and its
 * keys), and every later one waits until one of theirs already in the chain signs its
 * introduction, on an "Is this you?" prompt. Nothing is sealed for a device still waiting. A
 * person's security code is a digest of their chain's first device, so it stays the same as they
 * add devices, and changes only when they start over (every device lost, or chosen): a device the
 * server adds to someone's account can't be passed off as theirs without their code changing.
 * Each device keeps what it confirmed (every device's keys, each person's first device), so a
 * later answer from the server never changes it.
 *
 * What this doesn't hide, and the app says so: who is in a conversation, when messages are sent
 * and how long they are, and reactions. A device added later can't read what was sent before it
 * was.
 */

export const E2EE_VERSION = 1;
export const E2EE_LABEL = 'caishy-e2ee/1';

/** At most this many devices read one person's private conversations. */
export const MAX_DEVICES = 20;
/** A private group holds at most this many people: every message is sealed for each device. */
export const PRIVATE_GROUP_MAX = 64;
/** So an envelope never needs more keys than this. */
export const MAX_ENVELOPE_KEYS = PRIVATE_GROUP_MAX * MAX_DEVICES;

/** A P-256 public key as JSON (a JWK's public parts). */
export interface PublicJwk {
  kty: string;
  crv: string;
  x: string;
  y: string;
}

/** A device as the server lists it: whose it is, and its public keys. */
export interface PublicDevice {
  id: string;
  userId: string;
  encryptionKey: PublicJwk;
  signingKey: PublicJwk;
}

/** A device and who vouched for it: the first of a person's chain vouches for itself. */
export interface IntroducedDevice extends PublicDevice {
  /** The device of the same person that approved this one; null for the first of a chain. */
  introducedBy: string | null;
  /** Its approver's signature (or, the first, its own) over its introduction. */
  introduction: string;
}

/** A private conversation's message as the server stores it: nothing it can read. */
export interface SealedMessage {
  v: 1;
  /** The sender's own id for the message (its clientId), bound into all of it. */
  cid: string;
  /** Which edit this is: 0 for the message as first sent. */
  edit: number;
  /** The sending device. */
  from: string;
  /** Whose device it is (their user id): no device can be passed off as someone else's. */
  by: string;
  /** This message's ephemeral public key, for every device to derive its wrapping key. */
  epk: PublicJwk;
  iv: string;
  ct: string;
  /** The message key, wrapped for each device that may read it, by device id. */
  keys: Record<string, string>;
  /** The sending device's signature over all of the above and the conversation. */
  sig: string;
}

/** What a private message carries inside. */
export interface PrivatePayload {
  body: string;
  /** The message it answers, by who sent it and their id for it: sealed, so it can't be moved. */
  replyTo?: { by: string; cid: string } | null;
}

/** JSON with keys in a fixed order, so both sides sign and check the same bytes. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.keys(value as Record<string, unknown>)
      .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  return JSON.stringify(value);
}

/** Only the parts of a public key that are the key (a JWK may carry more). */
export const ecPublic = (k: PublicJwk): PublicJwk => ({ kty: 'EC', crv: 'P-256', x: k.x, y: k.y });

/** What's signed to introduce a device: whose it is, which it is, and its keys. */
export const introductionText = (d: PublicDevice) =>
  canonical({
    label: `${E2EE_LABEL} device`,
    userId: d.userId,
    id: d.id,
    e: ecPublic(d.encryptionKey),
    s: ecPublic(d.signingKey),
  });

/** A signature as a device makes one: base64url, not too long. */
export const isSignature = (v: unknown): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= 200 && /^[A-Za-z0-9_-]+$/.test(v);

/** Is this a P-256 public key as a device would register one? */
export function isPublicKey(k: unknown): k is PublicJwk {
  if (!k || typeof k !== 'object') return false;
  const j = k as Record<string, unknown>;
  const coord = (v: unknown) => typeof v === 'string' && /^[A-Za-z0-9_-]{43}$/.test(v);
  return j.kty === 'EC' && j.crv === 'P-256' && coord(j.x) && coord(j.y) && !('d' in j);
}

/** Is this an envelope a device could have made (its shape, not its truth)? */
export function isSealed(value: unknown): value is SealedMessage {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  const b64 = (x: unknown, max: number) =>
    typeof x === 'string' && x.length <= max && /^[A-Za-z0-9_-]*$/.test(x);
  return (
    v.v === 1 &&
    typeof v.cid === 'string' &&
    v.cid.length >= 8 &&
    v.cid.length <= 100 &&
    Number.isInteger(v.edit) &&
    (v.edit as number) >= 0 &&
    (v.edit as number) < 10_000 &&
    typeof v.from === 'string' &&
    v.from.length <= 64 &&
    typeof v.by === 'string' &&
    v.by.length > 0 &&
    v.by.length <= 64 &&
    isPublicKey(v.epk) &&
    b64(v.iv, 16) &&
    b64(v.ct, 64_000) &&
    b64(v.sig, 200) &&
    Boolean(v.keys) &&
    typeof v.keys === 'object' &&
    !Array.isArray(v.keys) &&
    Object.keys(v.keys as object).length > 0 &&
    Object.keys(v.keys as object).length <= MAX_ENVELOPE_KEYS &&
    Object.entries(v.keys as Record<string, unknown>).every(
      ([k, w]) => k.length <= 64 && b64(w, 80),
    )
  );
}
