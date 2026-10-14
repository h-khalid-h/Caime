/**
 * Sealing secrets with AES-256-GCM (R78, R90): a third party's credential kept for someone is
 * sealed with a server key and bound to what it's for (the label, authenticated but not
 * secret), never a column of plain text. A label that doesn't match, or bytes that were
 * changed, opens to nothing. Layout: nonce (12) | body | tag (16).
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const NONCE = 12;
const TAG = 16;

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
