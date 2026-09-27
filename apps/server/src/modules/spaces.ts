/**
 * Spaces (PRD §40, R32): a family, a team, a project or a community, with its people and its
 * conversations. Everyone in a space is in its General conversation; its other conversations are
 * open for them to join. People come in only through someone inside who is connected with them,
 * as with groups (PRD §55): nobody is pulled into a space by a stranger.
 */

import type {
  ConversationView,
  SpaceConversationView,
  SpaceKind,
  SpaceMemberView,
  SpaceSummaryView,
  SpaceView,
  Sphere,
} from '@caishy/core';
import {
  CreateSpaceBody,
  CreateSpaceConversationBody,
  canChangeSpaceRole,
  canManageSpace,
  canRemoveFromSpace,
  MembersBody,
  messagePreview,
  nextSpaceOwner,
  type SpaceRole,
  SpaceRoleBody,
  systemText,
  UpdateSpaceBody,
  uuidv7,
} from '@caishy/core';
import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { z } from 'zod';
import type { AppContext } from '../context';
import { handOverGroups } from '../lib/conversations';
import { badRequest, forbidden, notFound } from '../lib/errors';
import { recordEvent } from '../lib/events';
import { leaveGroupCallsIn } from '../lib/group-calls';
import { participantsOf } from '../lib/messages';
import { personViewsFor } from '../lib/people-batch';
import { activeRelationships, relationshipView } from '../lib/relations';
import { generalOf, spaceSeat } from '../lib/spaces';
import { suggestFromPlace } from '../lib/suggest';
import { personView } from '../lib/users';
import { parse } from '../lib/validate';
import { requireAuth } from '../plugins/auth';
import { conversationView, membership, sendSystem } from './conversations';

const ROLE_ORDER: Record<SpaceRole, number> = { owner: 0, admin: 1, member: 2 };

async function activeMembers(ctx: AppContext, spaceId: string) {
  return ctx.db
    .selectFrom('space_members')
    .select(['user_id', 'role', 'joined_at'])
    .where('space_id', '=', spaceId)
    .where('left_at', 'is', null)
    .orderBy('joined_at')
    .execute();
}

/** Only people you're connected with (the same rule as groups). */
async function assertConnected(ctx: AppContext, userId: string, ids: string[]) {
  if (ids.length === 0) return;
  const rows = await ctx.db
    .selectFrom('connection_sides as s')
    .innerJoin('connections as c', 'c.id', 's.connection_id')
    .select('s.other_id')
    .where('s.owner_id', '=', userId)
    .where('s.other_id', 'in', ids)
    .where('c.status', '=', 'active')
    .execute();
  if (new Set(rows.map((r) => r.other_id)).size !== ids.length)
    throw badRequest('You can add people you’re connected with.');
}

/** A conversation in the space: everyone in it, or just its starter until others join. */
export async function createSpaceConversation(
  ctx: AppContext,
  userId: string,
  spaceId: string,
  input: { title: string; purpose?: string | null; everyone: boolean },
): Promise<string> {
  const members = input.everyone
    ? (await activeMembers(ctx, spaceId)).map((m) => m.user_id).filter((u) => u !== userId)
    : [];
  const id = uuidv7();
  await ctx.db.transaction().execute(async (trx) => {
    await trx
      .insertInto('conversations')
      .values({
        id,
        kind: 'group',
        title: input.title,
        purpose: input.purpose ?? null,
        space_id: spaceId,
        created_by: userId,
      })
      .execute();
    await trx
      .insertInto('participants')
      .values([
        { conversation_id: id, user_id: userId, role: 'owner' },
        ...members.map((u) => ({ conversation_id: id, user_id: u, role: 'member' as const })),
      ])
      .execute();
    await recordEvent(trx, 'conversation.created', userId, {
      conversationId: id,
      kind: 'space',
      spaceId,
    });
  });
  await sendSystem(ctx, id, userId, 'group_created', { title: input.title });
  await ctx.bus.publish([userId, ...members], {
    type: 'conversation.created',
    data: { conversationId: id },
  });
  await tellSpace(ctx, spaceId);
  return id;
}

/** Everyone in the space refreshes it (and whoever else is named, such as someone who left). */
async function tellSpace(ctx: AppContext, spaceId: string, also: string[] = []) {
  const members = (await activeMembers(ctx, spaceId)).map((m) => m.user_id);
  await ctx.bus.publish([...new Set([...members, ...also])], {
    type: 'space.updated',
    data: { spaceId },
  });
}

async function summaries(
  ctx: AppContext,
  userId: string,
  only?: string,
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
    .execute();
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
    }))
    .sort((a, b) => Date.parse(b.lastActivityAt) - Date.parse(a.lastActivityAt));
}

async function spaceView(ctx: AppContext, userId: string, spaceId: string): Promise<SpaceView> {
  const [summary] = await summaries(ctx, userId, spaceId);
  if (!summary) throw notFound('That space');
  const members = await activeMembers(ctx, spaceId);
  const ids = members.map((m) => m.user_id);
  const others = ids.filter((id) => id !== userId);
  const [people, rels, me, created] = await Promise.all([
    personViewsFor(ctx, userId, others),
    activeRelationships(ctx.db, userId, others),
    ctx.db.selectFrom('users').selectAll().where('id', '=', userId).executeTakeFirstOrThrow(),
    ctx.db
      .selectFrom('spaces')
      .select('created_at')
      .where('id', '=', spaceId)
      .executeTakeFirstOrThrow(),
  ]);
  const self = personView(
    me,
    { isSelf: true, isConnected: true, blocked: false, ownerSpheresForViewer: [] },
    ctx.now(),
  );
  const memberViews: SpaceMemberView[] = members.flatMap((m) => {
    const person = m.user_id === userId ? self : people.get(m.user_id);
    if (!person) return [];
    const rel = rels.find((r) => r.subject_id === m.user_id);
    return [
      {
        userId: m.user_id,
        role: m.role,
        person,
        relationship: rel
          ? { label: relationshipView(rel).label, sphere: rel.sphere as Sphere }
          : null,
        joinedAt: m.joined_at.toISOString(),
      },
    ];
  });
  memberViews.sort(
    (a, b) =>
      ROLE_ORDER[a.role] - ROLE_ORDER[b.role] ||
      a.person.displayName.localeCompare(b.person.displayName),
  );

  const conversations = await ctx.db
    .selectFrom('conversations as c')
    .leftJoin('participants as p', (j) =>
      j
        .onRef('p.conversation_id', '=', 'c.id')
        .on('p.user_id', '=', userId)
        .on('p.left_at', 'is', null),
    )
    .select([
      'c.id',
      'c.title',
      'c.purpose',
      'c.is_general',
      'c.last_message_at',
      'c.created_at',
      'p.user_id as joined',
      sql<number>`(select count(*)::int from participants x
        where x.conversation_id = c.id and x.left_at is null)`.as('member_count'),
      sql<number>`case when p.user_id is null then 0 else (select count(*)::int from messages msg
        where msg.conversation_id = c.id and msg.seq > p.last_read_seq
          and msg.sender_id is distinct from ${userId}
          and msg.deleted_at is null and msg.kind <> 'system') end`.as('unread'),
    ])
    .where('c.space_id', '=', spaceId)
    .execute();
  const joinedIds = conversations.filter((c) => c.joined).map((c) => c.id);
  const lasts = joinedIds.length
    ? await ctx.db
        .selectFrom('messages as m')
        .leftJoin('users as u', 'u.id', 'm.sender_id')
        .select([
          'm.conversation_id',
          'm.kind',
          'm.body',
          'm.payload',
          'm.sender_id',
          'u.display_name as sender_name',
        ])
        .where(
          sql<boolean>`(m.conversation_id, m.seq) in (select conversation_id, max(seq)
            from messages where conversation_id in (${sql.join(joinedIds)})
            and deleted_at is null group by conversation_id)`,
        )
        .execute()
    : [];
  const views: SpaceConversationView[] = conversations
    .map((c) => {
      const last = lasts.find((m) => m.conversation_id === c.id);
      // A system line has no speaker, and says "You" to the person reading.
      const system = last?.kind === 'system';
      return {
        id: c.id,
        title: c.is_general ? 'General' : (c.title ?? 'Topic'),
        purpose: c.purpose,
        isGeneral: c.is_general,
        joined: Boolean(c.joined),
        memberCount: c.member_count,
        unreadCount: c.unread,
        lastMessageAt: c.last_message_at?.toISOString() ?? null,
        lastMessage: last
          ? {
              preview: system
                ? systemText(last.payload, userId)
                : messagePreview({
                    kind: last.kind,
                    body: last.body,
                    payload: last.payload,
                    deleted: false,
                  }),
              senderName: system ? null : last.sender_name,
              mine: !system && last.sender_id === userId,
            }
          : null,
      };
    })
    .sort(
      (a, b) =>
        Number(b.isGeneral) - Number(a.isGeneral) ||
        Date.parse(b.lastMessageAt ?? '1970-01-01') - Date.parse(a.lastMessageAt ?? '1970-01-01'),
    );
  const general = conversations.find((c) => c.is_general);
  if (!general) throw notFound('That space');
  return {
    ...summary,
    createdAt: created.created_at.toISOString(),
    generalId: general.id,
    members: memberViews,
    conversations: views,
  };
}

/** A space conversation's role mirrors the space's in General (its owner and admins run it). */
async function mirrorRole(ctx: AppContext, spaceId: string, userId: string, role: SpaceRole) {
  const general = await generalOf(ctx.db, spaceId);
  await ctx.db
    .updateTable('participants')
    .set({ role })
    .where('conversation_id', '=', general.id)
    .where('user_id', '=', userId)
    .execute();
}

export async function spaceRoutes(app: FastifyInstance, ctx: AppContext) {
  const idParam = z.object({ id: z.string().uuid() });
  /** People in a space who know each other may know each other its way (PRD §12): offered. */
  const offerWhoTheyKnow = (spaceId: string, newcomers: string[]) =>
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
        { kind: 'space', name: space.name, spaceKind: space.kind as SpaceKind },
        newcomers,
        members,
      );
    });
  const memberParam = z.object({ id: z.string().uuid(), userId: z.string().uuid() });

  app.get('/spaces', async (req): Promise<{ spaces: SpaceSummaryView[] }> => {
    const auth = requireAuth(req);
    return { spaces: await summaries(ctx, auth.userId) };
  });

  app.post('/spaces', async (req, reply): Promise<{ space: SpaceView }> => {
    const auth = requireAuth(req);
    const body = parse(CreateSpaceBody, req.body);
    ctx.limiter.hit(`space:${auth.userId}`, ctx.config.isTest ? 1000 : 20, 3_600_000);
    const memberIds = [...new Set(body.memberIds.filter((id) => id !== auth.userId))];
    await assertConnected(ctx, auth.userId, memberIds);
    const spaceId = uuidv7();
    const generalId = uuidv7();
    await ctx.db.transaction().execute(async (trx) => {
      await trx
        .insertInto('spaces')
        .values({
          id: spaceId,
          name: body.name,
          kind: body.kind,
          purpose: body.purpose ?? null,
          created_by: auth.userId,
        })
        .execute();
      await trx
        .insertInto('space_members')
        .values([
          { space_id: spaceId, user_id: auth.userId, role: 'owner', added_by: auth.userId },
          ...memberIds.map((u) => ({
            space_id: spaceId,
            user_id: u,
            role: 'member' as const,
            added_by: auth.userId,
          })),
        ])
        .execute();
      await trx
        .insertInto('conversations')
        .values({
          id: generalId,
          kind: 'group',
          title: 'General',
          is_general: true,
          space_id: spaceId,
          created_by: auth.userId,
        })
        .execute();
      await trx
        .insertInto('participants')
        .values([
          { conversation_id: generalId, user_id: auth.userId, role: 'owner' },
          ...memberIds.map((u) => ({
            conversation_id: generalId,
            user_id: u,
            role: 'member' as const,
          })),
        ])
        .execute();
      await recordEvent(trx, 'space.created', auth.userId, { spaceId, kind: body.kind });
    });
    await sendSystem(ctx, generalId, auth.userId, 'space_created', { title: body.name });
    await ctx.bus.publish([auth.userId, ...memberIds], {
      type: 'conversation.created',
      data: { conversationId: generalId },
    });
    await tellSpace(ctx, spaceId);
    offerWhoTheyKnow(spaceId, [auth.userId, ...memberIds]);
    reply.status(201);
    return { space: await spaceView(ctx, auth.userId, spaceId) };
  });

  app.get('/spaces/:id', async (req): Promise<{ space: SpaceView }> => {
    const auth = requireAuth(req);
    const { id } = parse(idParam, req.params);
    await spaceSeat(ctx.db, auth.userId, id);
    return { space: await spaceView(ctx, auth.userId, id) };
  });

  app.patch('/spaces/:id', async (req): Promise<{ space: SpaceView }> => {
    const auth = requireAuth(req);
    const { id } = parse(idParam, req.params);
    const body = parse(UpdateSpaceBody, req.body);
    const { space, seat } = await spaceSeat(ctx.db, auth.userId, id);
    if (!canManageSpace(seat.role)) throw forbidden('Only the space’s owner and admins can.');
    await ctx.db
      .updateTable('spaces')
      .set({
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.kind !== undefined ? { kind: body.kind } : {}),
        ...(body.purpose !== undefined ? { purpose: body.purpose } : {}),
        updated_at: ctx.now(),
      })
      .where('id', '=', id)
      .execute();
    await recordEvent(ctx.db, 'space.updated', auth.userId, { spaceId: id });
    if (body.name !== undefined && body.name !== space.name) {
      const general = await generalOf(ctx.db, id);
      await sendSystem(ctx, general.id, auth.userId, 'space_renamed', { title: body.name });
    }
    // Its conversations go by its name elsewhere, so they change too.
    const convos = await ctx.db
      .selectFrom('conversations')
      .select('id')
      .where('space_id', '=', id)
      .execute();
    const members = (await activeMembers(ctx, id)).map((m) => m.user_id);
    for (const c of convos)
      await ctx.bus.publish(members, {
        type: 'conversation.updated',
        data: { conversationId: c.id },
      });
    await tellSpace(ctx, id);
    return { space: await spaceView(ctx, auth.userId, id) };
  });

  app.post('/spaces/:id/members', async (req) => {
    const auth = requireAuth(req);
    const { id } = parse(idParam, req.params);
    const body = parse(MembersBody, req.body);
    const { seat } = await spaceSeat(ctx.db, auth.userId, id);
    if (!canManageSpace(seat.role))
      throw forbidden('Only the space’s owner and admins add people.');
    ctx.limiter.hit(`space-add:${auth.userId}`, ctx.config.isTest ? 1000 : 60, 3_600_000);
    const current = new Set((await activeMembers(ctx, id)).map((m) => m.user_id));
    const adding = [...new Set(body.userIds)].filter((u) => !current.has(u));
    if (adding.length === 0) return { ok: true };
    await assertConnected(ctx, auth.userId, adding);
    const general = await generalOf(ctx.db, id);
    await ctx.db.transaction().execute(async (trx) => {
      for (const userId of adding) {
        await trx
          .insertInto('space_members')
          .values({ space_id: id, user_id: userId, role: 'member', added_by: auth.userId })
          .onConflict((oc) =>
            oc.columns(['space_id', 'user_id']).doUpdateSet({
              left_at: null,
              role: 'member',
              added_by: auth.userId,
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
      await recordEvent(trx, 'space.member_added', auth.userId, { spaceId: id, userIds: adding });
    });
    await sendSystem(ctx, general.id, auth.userId, 'members_added', { userIds: adding });
    await ctx.bus.publish(adding, {
      type: 'conversation.created',
      data: { conversationId: general.id },
    });
    await tellSpace(ctx, id);
    offerWhoTheyKnow(id, adding);
    return { ok: true };
  });

  app.delete('/spaces/:id/members/:userId', async (req) => {
    const auth = requireAuth(req);
    const { id, userId } = parse(memberParam, req.params);
    const { seat } = await spaceSeat(ctx.db, auth.userId, id);
    const leaving = userId === auth.userId;
    const members = await activeMembers(ctx, id);
    const target = members.find((m) => m.user_id === userId);
    if (!target) throw notFound('That person in this space');
    if (!leaving && !canRemoveFromSpace(seat.role, target.role))
      throw forbidden(
        seat.role === 'admin'
          ? 'Admins can remove members; the owner removes admins.'
          : 'Only the space’s owner and admins remove people.',
      );
    const heir =
      target.role === 'owner'
        ? nextSpaceOwner(
            members.map((m) => ({
              userId: m.user_id,
              role: m.role,
              joinedAt: m.joined_at.toISOString(),
            })),
            userId,
          )
        : null;
    const general = await generalOf(ctx.db, id);
    // The line is written while they're still in General, so they see it too.
    await sendSystem(ctx, general.id, auth.userId, leaving ? 'member_left' : 'member_removed', {
      userId,
    });
    const { left, handed } = await ctx.db.transaction().execute(async (trx) => {
      await trx
        .updateTable('space_members')
        .set({ left_at: ctx.now(), role: 'member' })
        .where('space_id', '=', id)
        .where('user_id', '=', userId)
        .execute();
      // The space's conversations they started pass on as they go, as a group's do (PRD §56).
      const handed = await handOverGroups(trx, userId, { spaceId: id }, ctx.now());
      const convos = await trx
        .updateTable('participants')
        .set({ left_at: ctx.now(), role: 'member' })
        .where('user_id', '=', userId)
        .where('left_at', 'is', null)
        .where(
          'conversation_id',
          'in',
          trx.selectFrom('conversations').select('id').where('space_id', '=', id),
        )
        .returning('conversation_id')
        .execute();
      if (heir) {
        await trx
          .updateTable('space_members')
          .set({ role: 'owner' })
          .where('space_id', '=', id)
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
          .where('id', '=', id)
          .execute();
      const left = convos.map((c) => c.conversation_id);
      // What Caishy offered them about those conversations goes with them.
      if (left.length)
        await trx
          .updateTable('suggestions')
          .set({ status: 'expired', resolved_at: ctx.now() })
          .where('user_id', '=', userId)
          .where('conversation_id', 'in', left)
          .where('status', '=', 'pending')
          .execute();
      await recordEvent(trx, 'space.member_left', auth.userId, {
        spaceId: id,
        userId,
        removed: !leaving,
        newOwner: heir,
      });
      return { left, handed };
    });
    await ctx.bus.publish([userId], { type: 'space.removed', data: { spaceId: id } });
    await leaveGroupCallsIn(ctx, userId, left);
    for (const { conversationId, heir: owner } of handed)
      if (owner)
        await sendSystem(ctx, conversationId, auth.userId, 'owner_changed', { userId: owner });
    // Them, and whoever's still in each, see who's in it now.
    for (const conversationId of left)
      await ctx.bus.publish(
        [userId, ...(await participantsOf(ctx.db, conversationId)).map((p) => p.user_id)],
        { type: 'conversation.updated', data: { conversationId } },
      );
    await tellSpace(ctx, id);
    return { ok: true };
  });

  app.patch('/spaces/:id/members/:userId', async (req) => {
    const auth = requireAuth(req);
    const { id, userId } = parse(memberParam, req.params);
    const { role } = parse(SpaceRoleBody, req.body);
    const { seat } = await spaceSeat(ctx.db, auth.userId, id);
    const target = (await activeMembers(ctx, id)).find((m) => m.user_id === userId);
    if (!target) throw notFound('That person in this space');
    if (!canChangeSpaceRole(seat.role, target.role))
      throw forbidden('Only the space’s owner makes people admins.');
    await ctx.db
      .updateTable('space_members')
      .set({ role })
      .where('space_id', '=', id)
      .where('user_id', '=', userId)
      .execute();
    await mirrorRole(ctx, id, userId, role);
    await recordEvent(ctx.db, 'space.updated', auth.userId, { spaceId: id, userId, role });
    await tellSpace(ctx, id);
    return { ok: true };
  });

  app.post(
    '/spaces/:id/conversations',
    async (req, reply): Promise<{ conversation: ConversationView }> => {
      const auth = requireAuth(req);
      const { id } = parse(idParam, req.params);
      const body = parse(CreateSpaceConversationBody, req.body);
      await spaceSeat(ctx.db, auth.userId, id);
      ctx.limiter.hit(`space-convo:${auth.userId}`, ctx.config.isTest ? 1000 : 30, 3_600_000);
      const conversationId = await createSpaceConversation(ctx, auth.userId, id, body);
      reply.status(201);
      const m = await membership(ctx, auth.userId, conversationId);
      return { conversation: await conversationView(ctx, auth.userId, m.conversation, m.me) };
    },
  );

  app.post(
    '/spaces/:id/conversations/:conversationId/join',
    async (req): Promise<{ conversation: ConversationView }> => {
      const auth = requireAuth(req);
      const { id, conversationId } = parse(
        z.object({ id: z.string().uuid(), conversationId: z.string().uuid() }),
        req.params,
      );
      await spaceSeat(ctx.db, auth.userId, id);
      const convo = await ctx.db
        .selectFrom('conversations')
        .select(['id', 'last_seq'])
        .where('id', '=', conversationId)
        .where('space_id', '=', id)
        .executeTakeFirst();
      if (!convo) throw notFound('That conversation');
      const already = await ctx.db
        .selectFrom('participants')
        .select('user_id')
        .where('conversation_id', '=', conversationId)
        .where('user_id', '=', auth.userId)
        .where('left_at', 'is', null)
        .executeTakeFirst();
      if (!already) {
        await ctx.db
          .insertInto('participants')
          .values({
            conversation_id: conversationId,
            user_id: auth.userId,
            role: 'member',
            last_read_seq: convo.last_seq,
          })
          .onConflict((oc) =>
            oc
              .columns(['conversation_id', 'user_id'])
              .doUpdateSet({ left_at: null, role: 'member', last_read_seq: convo.last_seq }),
          )
          .execute();
        await sendSystem(ctx, conversationId, auth.userId, 'member_joined', {
          userId: auth.userId,
        });
        await tellSpace(ctx, id);
      }
      const m = await membership(ctx, auth.userId, conversationId);
      return { conversation: await conversationView(ctx, auth.userId, m.conversation, m.me) };
    },
  );
}
