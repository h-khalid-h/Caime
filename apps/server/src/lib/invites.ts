/**
 * Invite links (R1): "Noor invited you · Work · DATA C". One is a standing offer to connect from
 * its maker to whoever opens it; opening it signed in (or signing up through it) forms the
 * connection at once, with the inviter's own label applied on their side and the context they
 * chose to show offered to the other, and lands them in the conversation. The token is the only
 * way to one; a link lasts thirty days unless taken back, and counts each person it brought.
 */
import { randomBytes } from 'node:crypto';
import type { InviteAcceptView, InviteOpenView, InviteView, RelationshipInputT } from '@caime/core';
import { canSee, relationshipLabel, SPHERE_DEFS, type Sphere, tr, uuidv7 } from '@caime/core';
import type { Selectable } from 'kysely';
import type { AppContext } from '../context';
import type { InvitesTable, User } from '../db/schema';
import { acceptRequest } from '../modules/connections';
import { badRequest, forbidden, notFound } from './errors';
import { recordEvent } from './events';
import { notify } from './notify';
import { NOBODY } from './public-pages';
import { activeConnectionId, between, pairKey, shareAConnection } from './relations';
import { avatarUrl, minorOf, privacyOf } from './users';

export const INVITE_DAYS = 30;
/** How long after signing up a person is still counted as brought by whoever they connect with first. */
const NEW_ACCOUNT_MS = 24 * 3_600_000;

type Invite = Selectable<InvitesTable>;

const contextOf = (i: Pick<Invite, 'context_sphere' | 'context_org_name'>) =>
  i.context_sphere
    ? {
        sphere: i.context_sphere as Sphere,
        label: SPHERE_DEFS[i.context_sphere as Sphere]?.label ?? i.context_sphere,
        orgName: i.context_org_name,
      }
    : null;

const inviteUrl = (ctx: AppContext, token: string) =>
  `${ctx.config.PUBLIC_URL.replace(/\/+$/, '')}/i/${token}`;

/** A URL-safe token nobody guesses: 128 bits. */
export const newInviteToken = () => randomBytes(16).toString('base64url');

export async function makeInvite(
  ctx: AppContext,
  userId: string,
  body: { relationship?: RelationshipInputT; showContext?: boolean; note?: string | null },
): Promise<InviteView> {
  const id = uuidv7();
  const now = ctx.now();
  const rel = body.relationship ?? null;
  const show = Boolean(rel && body.showContext !== false);
  const row = await ctx.db
    .insertInto('invites')
    .values({
      id,
      user_id: userId,
      token: newInviteToken(),
      relationship: rel ? JSON.stringify(rel) : null,
      context_sphere: show && rel ? rel.sphere : null,
      context_org_name: show && rel ? (rel.orgName ?? null) : null,
      note: body.note?.trim() || null,
      expires_at: new Date(now.getTime() + INVITE_DAYS * 86_400_000),
      created_at: now,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  await recordEvent(ctx.db, 'invite.made', userId, { inviteId: id });
  return inviteView(ctx, row);
}

function inviteView(ctx: AppContext, i: Invite): InviteView {
  const rel = i.relationship as RelationshipInputT | null;
  return {
    id: i.id,
    token: i.token,
    url: inviteUrl(ctx, i.token),
    relationship: rel
      ? {
          id: i.id,
          sphere: rel.sphere,
          role: rel.role ?? null,
          roleLabel: rel.roleLabel ?? null,
          orgName: rel.orgName ?? null,
          contextNote: rel.contextNote ?? null,
          label: relationshipLabel(rel),
          status: 'active',
          isPrimary: true,
          shared: Boolean(rel.shared),
          source: 'invite',
          startedAt: i.created_at.toISOString(),
          endedAt: null,
        }
      : null,
    context: contextOf(i),
    note: i.note,
    uses: i.uses,
    expiresAt: i.expires_at.toISOString(),
    createdAt: i.created_at.toISOString(),
  };
}

/** The person's live invites, newest first. */
export async function inviteViews(ctx: AppContext, userId: string): Promise<InviteView[]> {
  const rows = await ctx.db
    .selectFrom('invites')
    .selectAll()
    .where('user_id', '=', userId)
    .where('revoked_at', 'is', null)
    .where('expires_at', '>', ctx.now())
    .orderBy('created_at', 'desc')
    .limit(50)
    .execute();
  return rows.map((r) => inviteView(ctx, r));
}

/** Taken back: the link opens nothing from now on. False when it wasn't theirs or live. */
export async function revokeInvite(ctx: AppContext, userId: string, id: string): Promise<boolean> {
  const r = await ctx.db
    .updateTable('invites')
    .set({ revoked_at: ctx.now() })
    .where('id', '=', id)
    .where('user_id', '=', userId)
    .where('revoked_at', 'is', null)
    .executeTakeFirst();
  return Number(r.numUpdatedRows) > 0;
}

/** A live invite by token, with its maker, who must still be here. Null answers as not found. */
export async function liveInvite(
  ctx: AppContext,
  token: string,
): Promise<{ invite: Invite; inviter: User } | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const invite = await ctx.db
    .selectFrom('invites')
    .selectAll()
    .where('token', '=', token)
    .where('revoked_at', 'is', null)
    .where('expires_at', '>', ctx.now())
    .executeTakeFirst();
  if (!invite) return null;
  const inviter = await ctx.db
    .selectFrom('users')
    .selectAll()
    .where('id', '=', invite.user_id)
    .where('deleted_at', 'is', null)
    .where('suspended_at', 'is', null)
    .where('kind', '=', 'human')
    .executeTakeFirst();
  return inviter ? { invite, inviter } : null;
}

/** The invite as whoever opens it sees it (the inviter's face only if everyone may see it). */
export async function openInvite(
  ctx: AppContext,
  token: string,
  viewerId: string | null,
): Promise<InviteOpenView> {
  const found = await liveInvite(ctx, token);
  if (!found) throw notFound('That invite');
  const { invite, inviter } = found;
  const now = ctx.now();
  const see = canSee(privacyOf(inviter, now), 'profilePhoto', NOBODY);
  let conversationId: string | null = null;
  if (
    viewerId &&
    viewerId !== inviter.id &&
    (await activeConnectionId(ctx.db, viewerId, inviter.id))
  )
    conversationId = await directConversationId(ctx, viewerId, inviter.id);
  return {
    inviter: {
      id: inviter.id,
      handle: inviter.handle,
      displayName: inviter.display_name,
      avatarUrl: see ? avatarUrl(inviter) : null,
    },
    context: contextOf(invite),
    note: invite.note,
    mine: viewerId === inviter.id,
    conversationId,
  };
}

/**
 * Opened by someone signed in: connected now, as if the inviter had asked and they'd accepted,
 * the inviter's label applied, the context offered, and both told as a connection is. Someone
 * new (a day old at most) counts as brought by the inviter. Already connected: nothing changes.
 */
export async function acceptInvite(
  ctx: AppContext,
  token: string,
  userId: string,
): Promise<InviteAcceptView> {
  const found = await liveInvite(ctx, token);
  if (!found) throw notFound('That invite');
  const { invite, inviter } = found;
  if (inviter.id === userId) throw badRequest('That’s your own invite.');
  const b = await between(ctx.db, userId, inviter.id);
  if (b.blockedMe || b.blockedByMe) throw forbidden('You can’t connect with this person.');
  if (b.connected && b.connectionId) {
    const conversationId = await directConversationId(ctx, userId, inviter.id);
    if (conversationId)
      return { status: 'connected', connectionId: b.connectionId, conversationId, already: true };
  }
  // Under 18 (R29): an adult the inviter doesn't already know through someone is not connected
  // by a link they may have got anywhere. The link stands as that adult's request instead, which
  // the inviter decides on, as `POST /connections/requests` would have asked them to.
  const now = ctx.now();
  if (minorOf(inviter, now) && !b.incomingRequestId) {
    const me = await ctx.db
      .selectFrom('users')
      .selectAll()
      .where('id', '=', userId)
      .executeTakeFirstOrThrow();
    if (!minorOf(me, now) && !(await shareAConnection(ctx.db, userId, inviter.id))) {
      if (b.outgoingRequestId) return { status: 'requested', requestId: b.outgoingRequestId };
      const requestId = uuidv7();
      await ctx.db.transaction().execute(async (trx) => {
        await trx
          .insertInto('connection_requests')
          .values({
            id: requestId,
            from_user: userId,
            to_user: inviter.id,
            note: null,
            context_sphere: null,
            context_org_name: null,
            from_identity_id: null,
            pending_relationship: null,
            created_at: now,
          })
          .execute();
        await recordEvent(trx, 'connection.requested', userId, {
          requestId,
          to: inviter.id,
          viaInvite: invite.id,
        });
      });
      await notify(ctx, {
        userId: inviter.id,
        kind: 'connection_request',
        level: 'attention',
        title: () => tr('{name} opened your invite link', { name: me.display_name }),
        body: () => tr('You decide who connects with you: accept to connect.'),
        data: { requestId, userId },
      });
      await ctx.bus.publish([inviter.id, userId], {
        type: 'connection.request',
        data: { requestId, from: userId, to: inviter.id },
      });
      return { status: 'requested', requestId };
    }
  }
  // Their request to me, if one waits, is what this answers; else the invite is the inviter's.
  const requestId = b.incomingRequestId ?? (await standingRequest(ctx, invite, inviter.id, userId));
  const result = await acceptRequest(ctx, userId, requestId, undefined, { viaInvite: true });
  await ctx.db
    .updateTable('invites')
    .set((eb) => ({ uses: eb('uses', '+', 1) }))
    .where('id', '=', invite.id)
    .execute();
  await ctx.db
    .updateTable('users')
    .set({ invited_by: inviter.id })
    .where('id', '=', userId)
    .where('invited_by', 'is', null)
    .where('invited_by_org', 'is', null)
    .where('created_at', '>', new Date(ctx.now().getTime() - NEW_ACCOUNT_MS))
    .execute();
  await recordEvent(ctx.db, 'invite.joined', userId, { inviteId: invite.id, by: inviter.id });
  return {
    status: 'connected',
    connectionId: result.connectionId,
    conversationId: result.conversationId,
    already: false,
  };
}

/** The one-to-one between two people, if there is one. */
async function directConversationId(ctx: AppContext, a: string, b: string): Promise<string | null> {
  const c = await ctx.db
    .selectFrom('conversations')
    .select('id')
    .where('direct_key', '=', pairKey(a, b).key)
    .where('is_general', '=', true)
    .executeTakeFirst();
  return c?.id ?? null;
}

/** The inviter's offer as a request to me, pending, so accepting it is the one path to connect. */
async function standingRequest(
  ctx: AppContext,
  invite: Invite,
  inviterId: string,
  userId: string,
): Promise<string> {
  const outgoing = await ctx.db
    .selectFrom('connection_requests')
    .select('id')
    .where('from_user', '=', inviterId)
    .where('to_user', '=', userId)
    .where('status', '=', 'pending')
    .executeTakeFirst();
  if (outgoing) return outgoing.id;
  const id = uuidv7();
  await ctx.db
    .insertInto('connection_requests')
    .values({
      id,
      from_user: inviterId,
      to_user: userId,
      note: invite.note,
      context_sphere: invite.context_sphere,
      context_org_name: invite.context_org_name,
      from_identity_id: null,
      pending_relationship: invite.relationship ? JSON.stringify(invite.relationship) : null,
      created_at: ctx.now(),
    })
    .execute();
  return id;
}
