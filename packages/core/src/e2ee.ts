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
 * alter or forge one, nor move one to another conversation: the conversation and the sender's
 * message id are bound into the encryption (as associated data) and into the signature.
 *
 * What this doesn't hide, and the app says so: who is in a conversation, when messages are sent
 * and how long they are, and reactions. The server hands out the device keys, so it could add a
 * device of its own to someone's account: each person's security code (a digest of their device
 * keys) lets two people compare, and a changed one is shown in the conversation. A device added
 * later can't read what was sent before it was.
 */

export const E2EE_VERSION = 1;
const LABEL = 'caishy-e2ee/1';

/** A device's keys, as kept on the device: the private halves can't be exported. */
export interface DeviceKeys {
  encryption: CryptoKeyPair;
  signing: CryptoKeyPair;
}

/** A device as the server lists it: whose it is, and its public keys. */
export interface PublicDevice {
  id: string;
  userId: string;
  encryptionKey: JsonWebKey;
  signingKey: JsonWebKey;
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
  /** This message's ephemeral public key, for every device to derive its wrapping key. */
  epk: JsonWebKey;
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
}

export type OpenResult =
  | { ok: true; payload: PrivatePayload }
  /** This device wasn't one it was sent to (it was added later, or signed in after). */
  | { ok: false; reason: 'not_for_this_device' }
  /** The signature doesn't match the device it says it's from: never shown. */
  | { ok: false; reason: 'unverified' }
  | { ok: false; reason: 'unreadable' };

const subtle = () => {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new Error('This device can’t encrypt messages.');
  return s;
};
/** Whether this runtime has what private conversations need. */
export const e2eeSupported = () => Boolean(globalThis.crypto?.subtle);

const utf8 = (s: string) => new TextEncoder().encode(s);
export function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}
export function fromBase64Url(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s.replaceAll('-', '+').replaceAll('_', '/'));
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
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
const ecPublic = (k: JsonWebKey): JsonWebKey => ({ kty: 'EC', crv: 'P-256', x: k.x, y: k.y });

/** A new device's keys: made here, their private halves unexportable. */
export async function newDeviceKeys(): Promise<DeviceKeys> {
  const [encryption, signing] = await Promise.all([
    subtle().generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']),
    subtle().generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']),
  ]);
  return { encryption, signing };
}

/** A device's public keys, to register with the server. */
export async function publicKeys(
  keys: DeviceKeys,
): Promise<{ encryptionKey: JsonWebKey; signingKey: JsonWebKey }> {
  const [encryptionKey, signingKey] = await Promise.all([
    subtle().exportKey('jwk', keys.encryption.publicKey),
    subtle().exportKey('jwk', keys.signing.publicKey),
  ]);
  return { encryptionKey: ecPublic(encryptionKey), signingKey: ecPublic(signingKey) };
}

/** Is this a P-256 public key as a device would register one? */
export function isPublicKey(k: unknown): k is JsonWebKey {
  if (!k || typeof k !== 'object') return false;
  const j = k as Record<string, unknown>;
  const coord = (v: unknown) => typeof v === 'string' && /^[A-Za-z0-9_-]{43}$/.test(v);
  return j.kty === 'EC' && j.crv === 'P-256' && coord(j.x) && coord(j.y) && !('d' in j);
}

const importEcdh = (k: JsonWebKey) =>
  subtle().importKey('jwk', ecPublic(k), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
const importVerify = (k: JsonWebKey) =>
  subtle().importKey('jwk', ecPublic(k), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);

/** The key that wraps a message's key for one device, from an ECDH secret shared with it. */
async function wrappingKey(
  privateKey: CryptoKey,
  publicKey: CryptoKey,
  cid: string,
  deviceId: string,
): Promise<CryptoKey> {
  const secret = await subtle().deriveBits({ name: 'ECDH', public: publicKey }, privateKey, 256);
  const hkdf = await subtle().importKey('raw', secret, 'HKDF', false, ['deriveKey']);
  return subtle().deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: utf8(cid), info: utf8(`${LABEL} wrap|${deviceId}`) },
    hkdf,
    { name: 'AES-KW', length: 256 },
    false,
    ['wrapKey', 'unwrapKey'],
  );
}

/** Bound into the encryption: which conversation, which message, which device sent it. */
const associated = (conversationId: string, s: Pick<SealedMessage, 'cid' | 'edit' | 'from'>) =>
  utf8(`${LABEL}|${conversationId}|${s.cid}|${s.edit}|${s.from}`);

/** The bytes the sending device signs: everything in the envelope, and its conversation. */
const signed = (conversationId: string, s: Omit<SealedMessage, 'sig'>) =>
  utf8(canonical({ ...s, epk: ecPublic(s.epk), conversationId, label: LABEL }));

const ECDSA = { name: 'ECDSA', hash: 'SHA-256' } as const;

/**
 * Encrypt a message for these devices, from this one. `to` should be every device of everyone
 * in the conversation (this person's own included): no other device will ever read it.
 */
export async function seal(input: {
  conversationId: string;
  cid: string;
  edit?: number;
  payload: PrivatePayload;
  from: { id: string; keys: DeviceKeys };
  to: Array<Pick<PublicDevice, 'id' | 'encryptionKey'>>;
}): Promise<SealedMessage> {
  const s = subtle();
  const head = { v: 1 as const, cid: input.cid, edit: input.edit ?? 0, from: input.from.id };
  const messageKey = await s.generateKey({ name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ]);
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = await s.encrypt(
    { name: 'AES-GCM', iv, additionalData: associated(input.conversationId, head) },
    messageKey,
    utf8(JSON.stringify(input.payload)),
  );
  const ephemeral = await s.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ]);
  const keys: Record<string, string> = {};
  for (const d of input.to) {
    if (keys[d.id]) continue;
    const wrap = await wrappingKey(
      ephemeral.privateKey,
      await importEcdh(d.encryptionKey),
      input.cid,
      d.id,
    );
    keys[d.id] = toBase64Url(await s.wrapKey('raw', messageKey, wrap, 'AES-KW'));
  }
  const body: Omit<SealedMessage, 'sig'> = {
    ...head,
    epk: ecPublic(await s.exportKey('jwk', ephemeral.publicKey)),
    iv: toBase64Url(iv),
    ct: toBase64Url(ct),
    keys,
  };
  const sig = await s.sign(
    ECDSA,
    input.from.keys.signing.privateKey,
    signed(input.conversationId, body),
  );
  return { ...body, sig: toBase64Url(sig) };
}

/**
 * Read a message on this device: only if it was sealed for it, and only if the device it says
 * it's from signed it. `sender` is that device as the server lists it.
 */
export async function open(input: {
  conversationId: string;
  sealed: SealedMessage;
  me: { id: string; keys: DeviceKeys };
  sender: Pick<PublicDevice, 'id' | 'signingKey'> | null;
}): Promise<OpenResult> {
  const { sealed } = input;
  const s = subtle();
  try {
    if (!input.sender || input.sender.id !== sealed.from)
      return { ok: false, reason: 'unverified' };
    const { sig, ...body } = sealed;
    const good = await s.verify(
      ECDSA,
      await importVerify(input.sender.signingKey),
      fromBase64Url(sig),
      signed(input.conversationId, body),
    );
    if (!good) return { ok: false, reason: 'unverified' };
    const mine = sealed.keys[input.me.id];
    if (!mine) return { ok: false, reason: 'not_for_this_device' };
    const unwrap = await wrappingKey(
      input.me.keys.encryption.privateKey,
      await importEcdh(sealed.epk),
      sealed.cid,
      input.me.id,
    );
    const messageKey = await s.unwrapKey(
      'raw',
      fromBase64Url(mine),
      unwrap,
      'AES-KW',
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt'],
    );
    const plain = await s.decrypt(
      {
        name: 'AES-GCM',
        iv: fromBase64Url(sealed.iv),
        additionalData: associated(input.conversationId, sealed),
      },
      messageKey,
      fromBase64Url(sealed.ct),
    );
    const payload = JSON.parse(new TextDecoder().decode(plain)) as PrivatePayload;
    if (typeof payload?.body !== 'string') return { ok: false, reason: 'unreadable' };
    return { ok: true, payload };
  } catch {
    return { ok: false, reason: 'unreadable' };
  }
}

/**
 * Someone's security code: 30 digits from their devices' public keys, the same wherever it's
 * worked out. Two people compare them; it changes when a device is added or removed.
 */
export async function securityCode(
  devices: Array<Pick<PublicDevice, 'id' | 'encryptionKey' | 'signingKey'>>,
): Promise<string> {
  const lines = devices
    .map((d) => canonical({ id: d.id, e: ecPublic(d.encryptionKey), s: ecPublic(d.signingKey) }))
    .sort();
  const digest = new Uint8Array(
    await subtle().digest('SHA-256', utf8(`${LABEL}|${lines.join('\n')}`)),
  );
  const groups: string[] = [];
  for (let i = 0; i < 6; i++) {
    let n = 0;
    for (let j = 0; j < 5; j++) n = n * 256 + (digest[i * 5 + j] ?? 0);
    groups.push(String(n % 100_000).padStart(5, '0'));
  }
  return groups.join(' ');
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
    isPublicKey(v.epk) &&
    b64(v.iv, 16) &&
    b64(v.ct, 64_000) &&
    b64(v.sig, 200) &&
    Boolean(v.keys) &&
    typeof v.keys === 'object' &&
    !Array.isArray(v.keys) &&
    Object.keys(v.keys as object).length > 0 &&
    Object.keys(v.keys as object).length <= 512 &&
    Object.entries(v.keys as Record<string, unknown>).every(
      ([k, w]) => k.length <= 64 && b64(w, 80),
    )
  );
}
