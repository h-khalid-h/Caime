/**
 * Acting as a person (PRD §73–74): their own access tokens now, third-party apps they let in
 * later. Either reaches only the routes below, each behind a permission they chose, and never
 * their account itself (password, sessions, privacy, tokens, export, deletion). What it sends
 * says what sent it.
 */
import { randomBytes } from 'node:crypto';
import { PERSONAL_TOKEN_PREFIX, type PersonalScope, type PersonalTokenView } from '@caishy/core';
import type { Selectable } from 'kysely';
import type { AppContext } from '../context';
import type { PersonalTokensTable } from '../db/schema';
import { hashToken } from './crypto';

export function newPersonalToken(): { token: string; prefix: string; hash: Buffer } {
  const token = `${PERSONAL_TOKEN_PREFIX}${randomBytes(24).toString('base64url')}`;
  return { token, prefix: token.slice(0, 10), hash: hashToken(token) };
}

/** Everything a token acting as a person can call, and the permission each needs. */
export const PERSON_ROUTES: Readonly<Record<string, PersonalScope>> = {
  'GET /v1/me': 'profile:read',
  'GET /v1/inbox': 'messages:read',
  'GET /v1/conversations/:id': 'messages:read',
  'GET /v1/conversations/:id/messages': 'messages:read',
  'GET /v1/search': 'messages:read',
  'POST /v1/conversations/:id/messages': 'messages:write',
  'GET /v1/tasks': 'actions:read',
  'POST /v1/tasks': 'actions:write',
  'PATCH /v1/tasks/:id': 'actions:write',
};

export interface PersonGrant {
  kind: 'personal' | 'oauth';
  id: string;
  /** What its messages say sent them: the token's name, or the app's. */
  name: string;
  scopes: string[];
}

const TOUCH_EVERY_MS = 5 * 60_000;

/** Whose token this is and what it may do, if it's live and its person still has an account. */
export async function resolvePersonalToken(
  ctx: AppContext,
  token: string,
): Promise<{ userId: string; grant: PersonGrant } | null> {
  const row = await ctx.db
    .selectFrom('personal_tokens as k')
    .innerJoin('users as u', 'u.id', 'k.user_id')
    .select(['k.id', 'k.user_id', 'k.name', 'k.scopes', 'k.last_used_at', 'k.expires_at'])
    .where('k.token_hash', '=', hashToken(token))
    .where('k.revoked_at', 'is', null)
    .where('u.deleted_at', 'is', null)
    .executeTakeFirst();
  const now = ctx.now();
  if (!row || (row.expires_at && row.expires_at <= now)) return null;
  if (!row.last_used_at || now.getTime() - row.last_used_at.getTime() > TOUCH_EVERY_MS)
    await ctx.db
      .updateTable('personal_tokens')
      .set({ last_used_at: now })
      .where('id', '=', row.id)
      .execute();
  return {
    userId: row.user_id,
    grant: { kind: 'personal', id: row.id, name: row.name, scopes: row.scopes },
  };
}

export function personalTokenView(t: Selectable<PersonalTokensTable>): PersonalTokenView {
  return {
    id: t.id,
    name: t.name,
    scopes: t.scopes,
    prefix: t.prefix,
    createdAt: t.created_at.toISOString(),
    lastUsedAt: t.last_used_at?.toISOString() ?? null,
    expiresAt: t.expires_at?.toISOString() ?? null,
  };
}
