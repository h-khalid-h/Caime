/**
 * The Web Crypto half of end-to-end encryption (R18; see e2ee.ts for the design): making a
 * device's keys, sealing and opening messages, and security codes. The browser's Web Crypto (and
 * Node's, for tests); the server never imports this, and never needs to.
 */
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

type Subtle = typeof globalThis.crypto.subtle;
/** A Web Crypto key, in whichever runtime's types (the browser's, or Node's for tests). */
export type Key = Awaited<ReturnType<Subtle['importKey']>>;
export interface KeyPair {
  publicKey: Key;
  privateKey: Key;
}

/** A device's keys, as kept on the device: the private halves can't be exported. */
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

/** A new device's keys: made here, their private halves unexportable. */
export async function newDeviceKeys(): Promise<DeviceKeys> {
  const [encryption, signing] = await Promise.all([
    subtle().generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']),
    subtle().generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']),
  ]);
  return { encryption: encryption as KeyPair, signing: signing as KeyPair };
}

/** A device's public keys, to register with the server. */
export async function publicKeys(
  keys: DeviceKeys,
): Promise<{ encryptionKey: PublicJwk; signingKey: PublicJwk }> {
  const [encryptionKey, signingKey] = await Promise.all([
    subtle().exportKey('jwk', keys.encryption.publicKey),
    subtle().exportKey('jwk', keys.signing.publicKey),
  ]);
  return {
    encryptionKey: ecPublic(encryptionKey as PublicJwk),
    signingKey: ecPublic(signingKey as PublicJwk),
  };
}

const importEcdh = (k: PublicJwk) =>
  subtle().importKey('jwk', ecPublic(k), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
const importVerify = (k: PublicJwk) =>
  subtle().importKey('jwk', ecPublic(k), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);

/** The key that wraps a message's key for one device, from an ECDH secret shared with it. */
async function wrappingKey(
  privateKey: Key,
  publicKey: Key,
  cid: string,
  deviceId: string,
): Promise<Key> {
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

/** Bound into the encryption: which conversation, which message, which device (and whose). */
const associated = (
  conversationId: string,
  s: Pick<SealedMessage, 'cid' | 'edit' | 'from' | 'by'>,
) => utf8(`${LABEL}|${conversationId}|${s.cid}|${s.edit}|${s.from}|${s.by}`);

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
  /** This device, and whose it is. */
  from: { id: string; userId: string; keys: DeviceKeys };
  to: Array<Pick<PublicDevice, 'id' | 'encryptionKey'>>;
}): Promise<SealedMessage> {
  const s = subtle();
  const head = {
    v: 1 as const,
    cid: input.cid,
    edit: input.edit ?? 0,
    from: input.from.id,
    by: input.from.userId,
  };
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
    epk: ecPublic((await s.exportKey('jwk', ephemeral.publicKey)) as PublicJwk),
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
  const s = subtle();
  try {
    if (!input.sender || input.sender.id !== sealed.from || input.sender.userId !== sealed.by)
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
  const sig = await subtle().sign(
    ECDSA,
    signer.keys.signing.privateKey,
    utf8(introductionText(device)),
  );
  return toBase64Url(sig);
}

async function introducedBy(device: IntroducedDevice, signingKey: PublicJwk): Promise<boolean> {
  try {
    return await subtle().verify(
      ECDSA,
      await importVerify(signingKey),
      fromBase64Url(device.introduction),
      utf8(introductionText(device)),
    );
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
    if (!d.introducedBy) return (await introducedBy(d, d.signingKey)) ? d : null;
    const by = lookup(d.introducedBy);
    if (!by || !(await introducedBy(d, by.signingKey))) return null;
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
