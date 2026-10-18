/**
 * Team invites (M16 C3a, review 2026-10-17 §1 H3): an organization's owner or admins hand out a
 * link, or send one to an address, and whoever accepts it is on the team, with the role it
 * gives. Before this, a team member had to have an account already and a connection with
 * whoever added them. The token is shown once, when it's made, and kept only as its hash
 * (`/t/<token>`); a link to share is open to anyone it reaches until it runs out or is taken
 * back; one sent to an address is for whoever proves that address (their sign-in, or an address
 * they proved theirs), and is spent once.
 */
import type { TeamInviteOpenView, TeamInviteView } from '@caime/core';
import { TEAM_INVITE_DAYS, uuidv7 } from '@caime/core';
import { type Selectable, sql } from 'kysely';
import type { AppContext } from '../context';
import type { OrgInvitesTable } from '../db/schema';
import { personByAddress } from './addresses';
import { hashToken, newToken } from './crypto';
import type { Mail } from './email';

/** Invites an organization may have open at once: enough for a clinic's whole staff. */
export const TEAM_INVITES_OPEN = 50;
/** A token as the link carries it (`t_` and 43 characters), and nothing else. */
export const TEAM_TOKEN = /^t_[A-Za-z0-9_-]{43}$/;

type Invite = Selectable<OrgInvitesTable>;

export const teamInviteUrl = (ctx: AppContext, token: string) =>
  `${ctx.config.PUBLIC_URL}/t/${token}`;

export function teamInviteView(i: Invite): TeamInviteView {
  return {
    id: i.id,
    role: i.role,
    email: i.email,
    uses: i.uses,
    expiresAt: i.expires_at.toISOString(),
    createdAt: i.created_at.toISOString(),
  };
}

/** A new invite; the token comes back this once. */
export async function makeTeamInvite(
  ctx: AppContext,
  orgId: string,
  byUserId: string,
  role: 'agent' | 'admin',
  email: string | null,
): Promise<{ invite: Invite; token: string }> {
  const token = newToken('t');
  const invite = await ctx.db
    .insertInto('org_invites')
    .values({
      id: uuidv7(),
      org_id: orgId,
      token_hash: hashToken(token),
      role,
      email: email?.toLowerCase() ?? null,
      created_by: byUserId,
      expires_at: new Date(ctx.now().getTime() + TEAM_INVITE_DAYS * 86_400_000),
      created_at: ctx.now(),
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  return { invite, token };
}

/** The organization's invites still open: not taken back, not run out, not spent. */
export async function openTeamInvites(ctx: AppContext, orgId: string): Promise<Invite[]> {
  return ctx.db
    .selectFrom('org_invites')
    .selectAll()
    .where('org_id', '=', orgId)
    .where('revoked_at', 'is', null)
    .where('expires_at', '>', ctx.now())
    .orderBy('created_at', 'desc')
    .limit(100)
    .execute();
}

/** Taken back: its link opens nothing from now on. */
export async function revokeTeamInvite(
  ctx: AppContext,
  orgId: string,
  id: string,
): Promise<boolean> {
  const done = await ctx.db
    .updateTable('org_invites')
    .set({ revoked_at: ctx.now() })
    .where('id', '=', id)
    .where('org_id', '=', orgId)
    .where('revoked_at', 'is', null)
    .executeTakeFirst();
  return Number(done.numUpdatedRows) > 0;
}

/** The invite a link stands for while it's open, or null for anything else. */
export async function liveTeamInvite(ctx: AppContext, token: string): Promise<Invite | null> {
  if (!TEAM_TOKEN.test(token)) return null;
  const i = await ctx.db
    .selectFrom('org_invites')
    .selectAll()
    .where('token_hash', '=', hashToken(token))
    .where('revoked_at', 'is', null)
    .where('expires_at', '>', ctx.now())
    .executeTakeFirst();
  return i ?? null;
}

/** How many invites the organization has open now. */
export async function openTeamInviteCount(ctx: AppContext, orgId: string): Promise<number> {
  const { n } = await ctx.db
    .selectFrom('org_invites')
    .select(sql<number>`count(*)::int`.as('n'))
    .where('org_id', '=', orgId)
    .where('revoked_at', 'is', null)
    .where('expires_at', '>', ctx.now())
    .executeTakeFirstOrThrow();
  return n;
}

/**
 * Whom an invite is for, as this account reads it: anyone with the link, or an address that is
 * theirs and proven (R91: their sign-in address once confirmed, or one they added and
 * confirmed), theirs and not yet confirmed (one can sign up with any address before its code
 * comes back), or someone else's. Who the address is goes through `personByAddress`.
 */
export async function addressedTo(
  ctx: AppContext,
  invite: Invite,
  userId: string,
): Promise<TeamInviteOpenView['addressed']> {
  if (!invite.email) return 'anyone';
  if ((await personByAddress(ctx.db, invite.email)) !== userId) return 'elsewhere';
  const me = await ctx.db
    .selectFrom('users')
    .select(['email', 'email_verified_at'])
    .where('id', '=', userId)
    .executeTakeFirst();
  // Found by an address they added: that one counts only once proven.
  if (me?.email.toLowerCase() !== invite.email) return 'you';
  return me.email_verified_at ? 'you' : 'unconfirmed';
}

/**
 * Counts an acceptance: a link's goes on counting while it's open; one sent to an address is
 * spent by it, so its link opens nothing after.
 */
export async function spendTeamInvite(ctx: AppContext, invite: Invite): Promise<void> {
  await ctx.db
    .updateTable('org_invites')
    .set((eb) => ({
      uses: eb('uses', '+', 1),
      ...(invite.email ? { revoked_at: ctx.now() } : {}),
    }))
    .where('id', '=', invite.id)
    .where('revoked_at', 'is', null)
    .execute();
}

/** The mail an invite sent to an address carries: plain English, 7-bit, the link once (R48). */
export function teamInviteMail(
  to: string,
  inviter: string,
  org: string,
  role: 'agent' | 'admin',
  url: string,
  until: Date,
): Mail {
  const day = until.toISOString().slice(0, 10);
  return {
    to,
    kind: 'invitation',
    subject: `Join ${org}'s team on Caime`,
    text: [
      'Hello,',
      '',
      `${inviter} invited you to answer for ${org} on Caime${role === 'admin' ? ', as an admin' : ''}.`,
      '',
      `To join, open this link and sign in or sign up with this address: ${url}`,
      '',
      `It works for this address alone, until ${day}. If you weren't expecting it, you can let it be.`,
      '',
      'Caime',
    ].join('\n'),
  };
}
