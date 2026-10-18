/**
 * Sealing secrets with AES-256-GCM (R78, R90): a third party's credential kept for someone is
 * sealed with a server key and bound to what it's for (the label, authenticated but not
 * secret), never a column of plain text. A label that doesn't match, or bytes that were
 * changed, opens to nothing. Layout: nonce (12) | body | tag (16).
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const NONCE = 12;
const TAG = 16;

/**
 * A key's id (M16 B5): the first nine bytes of a labelled SHA-256 of it, which names the key a
 * value was sealed with and tells nobody the key.
 */
export function keyId(purpose: 'vault' | 'backup', key: Buffer): Buffer {
  return createHash('sha256')
    .update(`caime ${purpose} key id v1\n`)
    .update(key)
    .digest()
    .subarray(0, 9);
}

/** 32 random bytes written as base64 or base64url (`openssl rand -base64 32`), or null. */
export function key32(text: string | undefined): Buffer | null {
  const v = text?.trim() ?? '';
  if (!/^[A-Za-z0-9+/_-]{43}=?$/.test(v)) return null;
  // Node reads both alphabets as base64.
  const key = Buffer.from(v, 'base64');
  return key.length === 32 ? key : null;
}

export function seal(key: Buffer, plain: Buffer, label: string): Buffer {
  const nonce = randomBytes(NONCE);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(Buffer.from(label));
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([nonce, body, cipher.getAuthTag()]);
}

export function unseal(key: Buffer, sealed: Buffer, label: string): Buffer | null {
  if (sealed.length <= NONCE + TAG) return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, sealed.subarray(0, NONCE));
    decipher.setAAD(Buffer.from(label));
    decipher.setAuthTag(sealed.subarray(sealed.length - TAG));
    return Buffer.concat([
      decipher.update(sealed.subarray(NONCE, sealed.length - TAG)),
      decipher.final(),
    ]);
  } catch {
    return null;
  }
}
