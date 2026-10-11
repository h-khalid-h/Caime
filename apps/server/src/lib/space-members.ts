/**
 * Who is in a space, and the spaces one sees (review 2026-10-09 M22): people added or taken
 * out, with what follows; the summaries the Spaces tab and an organization's page list.
 * Shared by the space routes and the organization's (a seat ending, a team joining).
 */
import type { OrgSpaceView, SpaceKind, SpaceSummaryView } from '@caime/core';
import { handsOverOnLeaving, nextSpaceOwner } from '@caime/core';
import { sql } from 'kysely';
import type { AppContext } from '../context';
import { ORG_COLUMNS } from '../db/schema';
import { tellSaved } from './automations';
import { orgRef } from './business';
import { sendSystem } from './conversation-views';
import { handOverGroups } from './conversations';
import { recordEvent } from './events';
import { leaveGroupCallsIn } from './group-calls';
import { participantsOf } from './messages';
import { activeMembers, tellSpace } from './space-conversations';
import { generalOf } from './spaces';
import { suggestFromPlace, withdrawPlaceOffers } from './suggest';

/** Newcomers to a space are offered who they may know in it (PRD §12), after the request. */
export const offerWhoTheyKnowIn = (ctx: AppContext, spaceId: string, newcomers: string[]) =>
  ctx.defer('suggest-space', async () => {
    const space = await ctx.db
      .selectFrom('spaces')
      .select(['name', 'kind'])
      .where('id', '=', spaceId)
      .executeTakeFirst();
    if (!space) return;
    const members = (await activeMembers(ctx, spaceId)).map((m) => m.user_id);
    await suggestFromPlace(
      ctx,
      { kind: 'space', id: spaceId, name: space.name, spaceKind: space.kind as SpaceKind },
      newcomers,
      members,
    );
  });

/** People into a space, in a role: in its General conversation too, caught up, and told. */
export async function addToSpace(
  ctx: AppContext,
  spaceId: string,
  adding: string[],
  addedBy: string,
  role: 'member' | 'admin' = 'member',
): Promise<void> {
  if (adding.length === 0) return;
  const general = await generalOf(ctx.db, spaceId);
  await ctx.db.transaction().execute(async (trx) => {
    for (const userId of adding) {
      await trx
        .insertInto('space_members')
        .values({ space_id: spaceId, user_id: userId, role, added_by: addedBy })
        .onConflict((oc) =>
          oc.columns(['space_id', 'user_id']).doUpdateSet({
            left_at: null,
            role,
            added_by: addedBy,
            joined_at: ctx.now(),
          }),
        )
        .execute();
      await trx
        .insertInto('participants')
        .values({
          conversation_id: general.id,
          user_id: userId,
          role: 'member',
          last_read_seq: general.last_seq,
        })
        .onConflict((oc) =>
          oc
            .columns(['conversation_id', 'user_id'])
            .doUpdateSet({ left_at: null, role: 'member', last_read_seq: general.last_seq }),
        )
        .execute();
    }
    await recordEvent(trx, 'space.member_added', addedBy, { spaceId, userIds: adding });
  });
  await sendSystem(ctx, general.id, addedBy, 'members_added', { userIds: adding });
  await ctx.bus.publish(adding, {
    type: 'conversation.created',
    data: { conversationId: general.id },
  });
  await tellSpace(ctx, spaceId);
  offerWhoTheyKnowIn(ctx, spaceId, adding);
}

/**
 * An organization's spaces as one of its people sees them (R43): those they're in, and for its
 * owner and admins the rest too, to join.
 */
export async function orgSpaceViews(
  ctx: AppContext,
  userId: string,
  orgId: string,
  all: boolean,
): Promise<OrgSpaceView[]> {
  const mine: OrgSpaceView[] = (await summaries(ctx, userId, undefined, orgId)).map((s) => ({
    ...s,
    joined: true,
  }));
  if (!all) return mine;
  const seen = new Set(mine.map((s) => s.id));
  const [org, rows] = await Promise.all([
    ctx.db
      .selectFrom('organizations')
      .select(ORG_COLUMNS)
      .where('id', '=', orgId)
      .executeTakeFirst(),
    ctx.db
      .selectFrom('spaces as s')
      .select([
        's.id',
        's.name',
        's.kind',
        's.purpose',
        's.created_at',
        sql<number>`(select count(*)::int from space_members x
          where x.space_id = s.id and x.left_at is null)`.as('member_count'),
        sql<Date | null>`(select max(c.last_message_at) from conversations c
          where c.space_id = s.id)`.as('last_activity'),
      ])
      .where('s.org_id', '=', orgId)
      .where('s.archived_at', 'is', null)
      .execute(),
  ]);
  const ref = org ? orgRef(org) : null;
  const others: OrgSpaceView[] = rows
    .filter((r) => !seen.has(r.id))
    .map((r) => ({
      id: r.id,
      name: r.name,
      kind: r.kind,
      purpose: r.purpose,
      memberCount: r.member_count,
      unreadCount: 0,
      lastActivityAt: (r.last_activity ?? r.created_at).toISOString(),
      myRole: null,
      joined: false,
      org: ref,
    }));
  return [...mine, ...others].sort(
    (a, b) => Date.parse(b.lastActivityAt) - Date.parse(a.lastActivityAt),
  );
}

/**
 * Someone out of a space (leaving, removed, or their seat on its organization's team ending):
 * its conversations they started pass on, the last one out closes it, and everyone sees who's
 * in it now.
 */
export async function removeFromSpace(
  ctx: AppContext,
  spaceId: string,
  userId: string,
  actorId: string,
): Promise<void> {
  const members = await activeMembers(ctx, spaceId);
  const target = members.find((m) => m.user_id === userId);
  if (!target) return;
  const leaving = userId === actorId;
  const heir = handsOverOnLeaving(target.role)
    ? nextSpaceOwner(
        members.map((m) => ({
          userId: m.user_id,
          role: m.role,
          joinedAt: m.joined_at.toISOString(),
        })),
        userId,
      )
    : null;
  const general = await generalOf(ctx.db, spaceId);
  // The line is written while they're still in General, so they see it too.
  await sendSystem(ctx, general.id, actorId, leaving ? 'member_left' : 'member_removed', {
    userId,
  });
  const { left, handed } = await ctx.db.transaction().execute(async (trx) => {
    await trx
      .updateTable('space_members')
      .set({ left_at: ctx.now(), role: 'member' })
      .where('space_id', '=', spaceId)
      .where('user_id', '=', userId)
      .execute();
    // The space's conversations they started pass on as they go, as a group's do (PRD §56).
    const handed = await handOverGroups(trx, userId, { spaceId }, ctx.now());
    const convos = await trx
      .updateTable('participants')
      .set({ left_at: ctx.now(), role: 'member' })
      .where('user_id', '=', userId)
      .where('left_at', 'is', null)
      .where(
        'conversation_id',
        'in',
        trx.selectFrom('conversations').select('id').where('space_id', '=', spaceId),
      )
      .returning('conversation_id')
      .execute();
    if (heir) {
      await trx
        .updateTable('space_members')
        .set({ role: 'owner' })
        .where('space_id', '=', spaceId)
        .where('user_id', '=', heir)
        .execute();
      await trx
        .updateTable('participants')
        .set({ role: 'owner' })
        .where('conversation_id', '=', general.id)
        .where('user_id', '=', heir)
        .execute();
    }
    // The last one out closes the space.
    if (members.length === 1)
      await trx
        .updateTable('spaces')
        .set({ archived_at: ctx.now() })
        .where('id', '=', spaceId)
        .execute();
    const left = convos.map((c) => c.conversation_id);
    // What Caime offered them about those conversations goes with them.
    if (left.length)
      await trx
        .updateTable('suggestions')
        .set({ status: 'expired', resolved_at: ctx.now() })
        .where('user_id', '=', userId)
        .where('conversation_id', 'in', left)
        .where('status', '=', 'pending')
        .execute();
    await recordEvent(trx, 'space.member_left', actorId, {
      spaceId,
      userId,
      removed: !leaving,
      newOwner: heir,
    });
    return { left, handed };
  });
  await ctx.bus.publish([userId], { type: 'space.removed', data: { spaceId } });
  // What they saved of its conversations is out of their Saved now, and what Caime offered
  // because they were both in it goes.
  if (left.length) await tellSaved(ctx, [userId]);
  await withdrawPlaceOffers(ctx, { kind: 'space', id: spaceId }, userId);
  await leaveGroupCallsIn(ctx, userId, left);
  for (const { conversationId, heir: owner } of handed)
    if (owner) await sendSystem(ctx, conversationId, actorId, 'owner_changed', { userId: owner });
  // Them, and whoever's still in each, see who's in it now.
  for (const conversationId of left)
    await ctx.bus.publish(
      [userId, ...(await participantsOf(ctx.db, conversationId)).map((p) => p.user_id)],
      { type: 'conversation.updated', data: { conversationId } },
    );
  await tellSpace(ctx, spaceId);
}

export async function summaries(
  ctx: AppContext,
  userId: string,
  only?: string,
  orgId?: string,
): Promise<SpaceSummaryView[]> {
  const rows = await ctx.db
    .selectFrom('space_members as m')
    .innerJoin('spaces as s', 's.id', 'm.space_id')
    .select([
      's.id',
      's.name',
      's.kind',
      's.purpose',
      's.created_at',
      's.org_id',
      'm.role',
      sql<number>`(select count(*)::int from space_members x
        where x.space_id = s.id and x.left_at is null)`.as('member_count'),
      sql<number>`(select count(*)::int from messages msg
        join participants p on p.conversation_id = msg.conversation_id
          and p.user_id = ${userId} and p.left_at is null
        join conversations c on c.id = msg.conversation_id
        where c.space_id = s.id and msg.seq > p.last_read_seq
          and msg.sender_id is distinct from ${userId}
          and msg.deleted_at is null and msg.kind <> 'system')`.as('unread'),
      sql<Date | null>`(select max(c.last_message_at) from conversations c
        where c.space_id = s.id)`.as('last_activity'),
    ])
    .where('m.user_id', '=', userId)
    .where('m.left_at', 'is', null)
    .where('s.archived_at', 'is', null)
    .$if(Boolean(only), (qb) => qb.where('s.id', '=', only!))
    .$if(Boolean(orgId), (qb) => qb.where('s.org_id', '=', orgId!))
    .execute();
  const orgIds = [...new Set(rows.map((r) => r.org_id).filter((x): x is string => Boolean(x)))];
  const orgs = new Map(
    orgIds.length
      ? (
          await ctx.db
            .selectFrom('organizations')
            .select(ORG_COLUMNS)
            .where('id', 'in', orgIds)
            .execute()
        ).map((o) => [o.id, orgRef(o)])
      : [],
  );
  return rows
    .map((r) => ({
      id: r.id,
      name: r.name,
      kind: r.kind,
      purpose: r.purpose,
      memberCount: r.member_count,
      unreadCount: r.unread,
      lastActivityAt: (r.last_activity ?? r.created_at).toISOString(),
      myRole: r.role,
      org: (r.org_id && orgs.get(r.org_id)) || null,
    }))
    .sort((a, b) => Date.parse(b.lastActivityAt) - Date.parse(a.lastActivityAt));
}
