/**
 * OAuth for third-party apps (PRD §74): the authorization code flow with PKCE (S256 only), so
 * an app on a phone or in a browser can be let in without a secret. Codes last ten minutes and
 * are used once; access tokens last an hour; refresh tokens a month, each used once, and using
 * one again ends the grant, since only a leaked copy would be used twice. Only hashes are kept.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  OAUTH_ACCESS_PREFIX,
  OAUTH_ACCESS_SECONDS,
  OAUTH_REFRESH_DAYS,
  OAUTH_REFRESH_PREFIX,
  OAUTH_SECRET_PREFIX,
  uuidv7,
} from '@caishy/core';
import type { AppContext } from '../context';
import type { PersonGrant } from './access';
import { hashToken } from './crypto';

export const CODE_TTL_MS = 10 * 60_000;

export const newClientId = () => `app_${randomBytes(12).toString('base64url')}`;
export const newClientSecret = () =>
  `${OAUTH_SECRET_PREFIX}${randomBytes(32).toString('base64url')}`;
export const newCode = () => randomBytes(32).toString('base64url');

/** PKCE S256: the challenge is the base64url SHA-256 of the verifier the app kept. */
export function pkceMatches(verifier: string, challenge: string): boolean {
  if (!/^[\w.~-]{43,128}$/.test(verifier)) return false;
  const expected = Buffer.from(createHash('sha256').update(verifier).digest('base64url'));
  const given = Buffer.from(challenge);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Does this secret belong to the client? Compared as hashes, in constant time. */
export function secretMatches(secret: string | undefined, hash: Buffer | null): boolean {
  if (!hash || !secret) return false;
  const given = hashToken(secret);
  return given.length === hash.length && timingSafeEqual(given, hash);
}

/** A fresh pair for a grant: an access token for an hour, a refresh token for a month. */
export async function issueTokens(ctx: AppContext, grantId: string, scopes: string[]) {
  const access = `${OAUTH_ACCESS_PREFIX}${randomBytes(24).toString('base64url')}`;
  const refresh = `${OAUTH_REFRESH_PREFIX}${randomBytes(32).toString('base64url')}`;
  const now = ctx.now().getTime();
  await ctx.db
    .insertInto('oauth_tokens')
    .values([
      {
        id: uuidv7(),
        grant_id: grantId,
        kind: 'access',
        token_hash: hashToken(access),
        scopes,
        expires_at: new Date(now + OAUTH_ACCESS_SECONDS * 1000),
        created_at: ctx.now(),
      },
      {
        id: uuidv7(),
        grant_id: grantId,
        kind: 'refresh',
        token_hash: hashToken(refresh),
        scopes,
        expires_at: new Date(now + OAUTH_REFRESH_DAYS * 86_400_000),
        created_at: ctx.now(),
      },
    ])
    .execute();
  return {
    access_token: access,
    token_type: 'Bearer' as const,
    expires_in: OAUTH_ACCESS_SECONDS,
    refresh_token: refresh,
    scope: scopes.join(' '),
  };
}

/** End what a person let an app do, and every token it holds. */
export async function revokeGrant(ctx: AppContext, grantId: string): Promise<void> {
  await ctx.db
    .updateTable('oauth_grants')
    .set({ revoked_at: ctx.now() })
    .where('id', '=', grantId)
    .where('revoked_at', 'is', null)
    .execute();
  await ctx.db
    .updateTable('oauth_tokens')
    .set({ revoked_at: ctx.now() })
    .where('grant_id', '=', grantId)
    .where('revoked_at', 'is', null)
    .execute();
}

const TOUCH_EVERY_MS = 5 * 60_000;

/** Whom an app's access token acts for, and what it may do, if all of it is still live. */
export async function resolveOAuthAccess(
  ctx: AppContext,
  token: string,
): Promise<{ userId: string; grant: PersonGrant } | null> {
  const now = ctx.now();
  const row = await ctx.db
    .selectFrom('oauth_tokens as k')
    .innerJoin('oauth_grants as g', 'g.id', 'k.grant_id')
    .innerJoin('oauth_clients as c', 'c.id', 'g.client_id')
    .innerJoin('users as u', 'u.id', 'g.user_id')
    .select(['g.id as grant_id', 'g.user_id', 'g.last_used_at', 'c.name', 'k.scopes'])
    .where('k.token_hash', '=', hashToken(token))
    .where('k.kind', '=', 'access')
    .where('k.revoked_at', 'is', null)
    .where('k.expires_at', '>', now)
    .where('g.revoked_at', 'is', null)
    .where('c.revoked_at', 'is', null)
    .where('u.deleted_at', 'is', null)
    .executeTakeFirst();
  if (!row) return null;
  if (!row.last_used_at || now.getTime() - row.last_used_at.getTime() > TOUCH_EVERY_MS)
    await ctx.db
      .updateTable('oauth_grants')
      .set({ last_used_at: now })
      .where('id', '=', row.grant_id)
      .execute();
  return {
    userId: row.user_id,
    grant: { kind: 'oauth', id: row.grant_id, name: row.name, scopes: row.scopes },
  };
}
