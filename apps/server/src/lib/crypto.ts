/**
 * Passwords (scrypt) and opaque tokens (ADR-7). Tokens are random and stored only as SHA-256.
 */
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';

const N = 32768;
const R = 8;
const P = 1;
const KEYLEN = 64;
const MAXMEM = 128 * N * R * 2;

function scrypt(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(
      password.normalize('NFKC'),
      salt,
      KEYLEN,
      { N, r: R, p: P, maxmem: MAXMEM },
      (err, key) => (err ? reject(err) : resolve(key)),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt);
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, saltB64, keyB64] = stored.split('$');
  if (alg !== 'scrypt' || !saltB64 || !keyB64) return false;
  const salt = Buffer.from(saltB64, 'base64url');
  const expected = Buffer.from(keyB64, 'base64url');
  const key = await new Promise<Buffer>((resolve, reject) => {
    const cost = Number(n);
    scryptCb(
      password.normalize('NFKC'),
      salt,
      expected.length,
      { N: cost, r: Number(r), p: Number(p), maxmem: 128 * cost * Number(r) * 2 },
      (err, derived) => (err ? reject(err) : resolve(derived)),
    );
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** A password hash to compare against when the account doesn't exist, so timing doesn't reveal it. */
let decoy: Promise<string> | null = null;
export function decoyHash(): Promise<string> {
  decoy ??= hashPassword(randomBytes(12).toString('hex'));
  return decoy;
}

export function newToken(prefix: string): string {
  return `${prefix}_${randomBytes(32).toString('base64url')}`;
}

export function hashToken(token: string): Buffer {
  return createHash('sha256').update(token).digest();
}

/** Human-typable recovery codes: 10 groups like "7K4Q-9XMP". No 0/O/1/I. */
export function recoveryCodes(count = 10): string[] {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  return Array.from({ length: count }, () => {
    const bytes = randomBytes(8);
    const chars = [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
    return `${chars.slice(0, 4)}-${chars.slice(4, 8)}`;
  });
}

/**
 * Recovery codes are hashed slowly, with a salt of their account's own (0033): a copy of the
 * database can't be tried against every one of 32^8 codes, as a fast hash of them could, and one
 * hash checks all of an account's codes. Codes are random, not chosen, so a lighter cost than a
 * password's does.
 */
const RECOVERY_N = 16384;

export function recoverySalt(): Buffer {
  return randomBytes(16);
}

export function hashRecoveryCode(code: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(
      normaliseRecoveryCode(code),
      salt,
      32,
      { N: RECOVERY_N, r: R, p: P, maxmem: 128 * RECOVERY_N * R * 2 },
      (err, key) => (err ? reject(err) : resolve(key)),
    );
  });
}

/**
 * The code among an account's unused ones that this is, if any, by one slow hash for each salt
 * they have (one: they're made together). At least one slow hash is always made, so how long a
 * try takes says nothing of whether the account exists or has codes left.
 */
export async function matchRecoveryCode(
  code: string,
  stored: Array<{ id: string; code_hash: Buffer; salt: Buffer }>,
  slowHash = hashRecoveryCode,
): Promise<string | null> {
  const slow = new Map<string, Buffer>();
  for (const s of stored)
    if (!slow.has(s.salt.toString('hex')))
      slow.set(s.salt.toString('hex'), await slowHash(code, s.salt));
  if (!slow.size) await slowHash(code, recoverySalt());
  let found: string | null = null;
  for (const s of stored) {
    const hash = slow.get(s.salt.toString('hex'));
    if (hash && hash.length === s.code_hash.length && timingSafeEqual(hash, s.code_hash))
      found ??= s.id;
  }
  return found;
}

export function normaliseRecoveryCode(code: string): string {
  return code
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/^(.{4})(.{4})$/, '$1-$2');
}
