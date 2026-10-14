/**
 * Passkeys (R36): WebAuthn credentials a person signs in with, bound to Caime's domain (the
 * relying party is `PUBLIC_URL`'s name, so a passkey made on `cai.me` works on `cai.me` alone).
 * Caime keeps each one's public key and what its authenticator says of itself, never a secret or
 * a biometric. A ceremony's challenge is kept for one use within a few minutes, in the database,
 * so any instance can finish what another began; the daily records sweep takes the stale ones.
 * Verification is `@simplewebauthn/server`'s (pinned), never by hand.
 */
import { uuidv7 } from '@caime/core';
import type { PasskeyView } from '@caime/core/api';
import type { Config } from '../config';
import type { AppContext } from '../context';

/** How many passkeys one account keeps: a phone, a laptop, a key or two, with room to spare. */
export const PASSKEYS_MAX = 20;
/** A ceremony's window: long enough to find the key, short enough that a stale one is no use. */
const CHALLENGE_MS = 5 * 60_000;

/** Who the passkeys are for: Caime, at `PUBLIC_URL`'s name and origin. */
export function relyingParty(config: Pick<Config, 'PUBLIC_URL'>) {
  const url = new URL(config.PUBLIC_URL);
  return { id: url.hostname, origin: url.origin, name: 'Caime' };
}

/** A ceremony's challenge, kept for one use; its id is what the browser's answer comes back with. */
export async function keepChallenge(
  ctx: AppContext,
  purpose: 'register' | 'signin',
  userId: string | null,
  challenge: string,
): Promise<string> {
  const id = uuidv7();
  await ctx.db
    .insertInto('passkey_challenges')
    .values({
      id,
      user_id: userId,
      purpose,
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
  purpose: 'register' | 'signin',
  userId: string | null,
): Promise<string | null> {
  const row = await ctx.db
    .deleteFrom('passkey_challenges')
    .where('id', '=', id)
    .where('purpose', '=', purpose)
    .where((eb) => (userId ? eb('user_id', '=', userId) : eb('user_id', 'is', null)))
    .returning(['challenge', 'expires_at'])
    .executeTakeFirst();
  return row && row.expires_at > ctx.now() ? row.challenge : null;
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
