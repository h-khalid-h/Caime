/**
 * Passkeys (R36): WebAuthn credentials a person signs in with, bound to Caime's domain (the
 * relying party is `PUBLIC_URL`'s name, so a passkey made on `cai.me` works on `cai.me` alone).
 * Caime keeps each one's public key and what its authenticator says of itself, never a secret or
 * a biometric. Adding one keeps its challenge for one use within a few minutes, in the database,
 * so any instance can finish what another began. Signing in stores nothing until a passkey has
 * answered: its challenge is signed by the server (a key made once, kept in `server_settings`,
 * the same for every instance) and carries its own deadline, and only a sign-in that worked
 * writes its nonce down, so the same answer is never taken twice. The daily records sweep takes
 * both kinds once their time is up. Verification is `@simplewebauthn/server`'s (pinned), never
 * by hand.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { uuidv7 } from '@caime/core';
import type { PasskeyView } from '@caime/core/api';
import type { Config } from '../config';
import type { AppContext } from '../context';
import { serverKey } from './server-keys';

/** How many passkeys one account keeps: a phone, a laptop, a key or two, with room to spare. */
export const PASSKEYS_MAX = 20;
/** A ceremony's window: long enough to find the key, short enough that a stale one is no use. */
const CHALLENGE_MS = 5 * 60_000;

/** Who the passkeys are for: Caime, at `PUBLIC_URL`'s name and origin. */
export function relyingParty(config: Pick<Config, 'PUBLIC_URL'>) {
  const url = new URL(config.PUBLIC_URL);
  return { id: url.hostname, origin: url.origin, name: 'Caime' };
}

/** Adding one: its challenge, kept for one use; its id is what the browser's answer comes back with. */
export async function keepChallenge(
  ctx: AppContext,
  userId: string,
  challenge: string,
): Promise<string> {
  const id = uuidv7();
  await ctx.db
    .insertInto('passkey_challenges')
    .values({
      id,
      user_id: userId,
      purpose: 'register',
      challenge,
      expires_at: new Date(ctx.now().getTime() + CHALLENGE_MS),
    })
    .execute();
  return id;
}

/** The challenge `id` stands for, used up by asking: null once it's gone, stale or someone else's. */
export async function takeChallenge(
  ctx: AppContext,
  id: string,
  userId: string,
): Promise<string | null> {
  const row = await ctx.db
    .deleteFrom('passkey_challenges')
    .where('id', '=', id)
    .where('purpose', '=', 'register')
    .where('user_id', '=', userId)
    .returning(['challenge', 'expires_at'])
    .executeTakeFirst();
  return row && row.expires_at > ctx.now() ? row.challenge : null;
}

const SIGNIN = Buffer.from('caime passkey sign-in v1');
const NONCE = 16;

/** The key sign-in challenges are signed with: made once, for every instance. */
export function signingKey(ctx: AppContext): Promise<Buffer> {
  return serverKey(ctx, 'passkey.signin');
}

const mac = (key: Buffer, nonce: Buffer, until: Buffer) =>
  createHmac('sha256', key).update(SIGNIN).update(nonce).update(until).digest();

/** A sign-in challenge: a nonce and its deadline, signed, so nothing need be kept to know it. */
export function signinChallenge(key: Buffer, now: Date): Uint8Array<ArrayBuffer> {
  const nonce = randomBytes(NONCE);
  const until = Buffer.alloc(8);
  until.writeBigUInt64BE(BigInt(now.getTime() + CHALLENGE_MS));
  const bytes = Buffer.concat([nonce, until, mac(key, nonce, until)]);
  const out = new Uint8Array(new ArrayBuffer(bytes.length));
  out.set(bytes);
  return out;
}

/** A sign-in challenge this server signed and whose time isn't up (base64url, as a passkey returns it). */
export function readSigninChallenge(
  key: Buffer,
  challenge: string,
  now: Date,
): { nonce: Buffer; until: Date } | null {
  const bytes = Buffer.from(challenge, 'base64url');
  if (bytes.length !== NONCE + 8 + 32) return null;
  const nonce = bytes.subarray(0, NONCE);
  const until = bytes.subarray(NONCE, NONCE + 8);
  if (!timingSafeEqual(bytes.subarray(NONCE + 8), mac(key, nonce, until))) return null;
  const at = Number(until.readBigUInt64BE());
  return at > now.getTime() ? { nonce, until: new Date(at) } : null;
}

/** The challenge a passkey's answer signed, as its client data says (null when it says none). */
export function answeredChallenge(clientDataJSON: unknown): string | null {
  if (typeof clientDataJSON !== 'string') return null;
  try {
    const data = JSON.parse(Buffer.from(clientDataJSON, 'base64url').toString('utf8'));
    return typeof data?.challenge === 'string' ? data.challenge : null;
  } catch {
    return null;
  }
}

/** A sign-in that worked, written down: false when its answer was taken once already. */
export async function spendSigninChallenge(
  ctx: AppContext,
  challenge: string,
  issued: { nonce: Buffer; until: Date },
): Promise<boolean> {
  const hex = issued.nonce.toString('hex');
  const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  const row = await ctx.db
    .insertInto('passkey_challenges')
    .values({ id, user_id: null, purpose: 'signin', challenge, expires_at: issued.until })
    .onConflict((oc) => oc.column('id').doNothing())
    .returning('id')
    .executeTakeFirst();
  return Boolean(row);
}

/** What a passkey is called, from the browser that made it: "Chrome · macOS". Product names, never words. */
export function passkeyName(userAgent: string | null): string | null {
  if (!userAgent) return null;
  const os = /iPhone/.test(userAgent)
    ? 'iPhone'
    : /iPad/.test(userAgent)
      ? 'iPad'
      : /Android/.test(userAgent)
        ? 'Android'
        : /CrOS/.test(userAgent)
          ? 'ChromeOS'
          : /Macintosh|Mac OS X/.test(userAgent)
            ? 'macOS'
            : /Windows/.test(userAgent)
              ? 'Windows'
              : /Linux/.test(userAgent)
                ? 'Linux'
                : null;
  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /Firefox\/|FxiOS\//.test(userAgent)
      ? 'Firefox'
      : /Chrome\/|CriOS\//.test(userAgent)
        ? 'Chrome'
        : /Safari\//.test(userAgent)
          ? 'Safari'
          : null;
  const parts = [browser, os].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

export function passkeyView(row: {
  id: string;
  name: string | null;
  backed_up: boolean;
  created_at: Date;
  last_used_at: Date | null;
}): PasskeyView {
  return {
    id: row.id,
    name: row.name,
    synced: row.backed_up,
    createdAt: row.created_at.toISOString(),
    lastUsedAt: row.last_used_at?.toISOString() ?? null,
  };
}
