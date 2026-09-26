/**
 * Conversations and messages (PRD §15–§22, §26, §56; R14).
 */

import type {
  AlbumPhotoView,
  ConversationBusinessView,
  ConversationView,
  MessagesPage,
} from '@caishy/core';
import {
  applyChecklistOp,
  ChecklistOpBody,
  CreateConversationBody,
  checklistItems,
  checklistState,
  EditMessageBody,
  ForwardBody,
  isCardKit,
  isMinor,
  KITS,
  kitMoves,
  kitStateLabel,
  type LiveLocation,
  LiveLocationUpdate,
  type LocationPayloadT,
  liveNow,
  MembersBody,
  PollPayload,
  ReactionBody,
  ReceiptsBody,
  SendMessageBody,
  UpdateConversationBody,
  uuidv7,
  VoteBody,
} from '@caishy/core';
import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { z } from 'zod';
import type { AppContext } from '../context';
import type { Conversation, Participant } from '../db/schema';
import { assertCanWrite, businessClosed } from '../lib/blocks';
import { customerMask, maskFor, maskId, orgRef, threadViews } from '../lib/business';
import { ensureDirectConversation } from '../lib/conversations';
import { AppError, badRequest, forbidden, notFound } from '../lib/errors';
import { recordEvent } from '../lib/events';
import { afterMessage } from '../lib/message-effects';
import {
  assertCanMessage,
  fileView,
  insertSystemMessage,
  messageViews,
  participantsOf,
  sendMessage,
} from '../lib/messages';
import { notify } from '../lib/notify';
import {
  activeRelationships,
  between,
  pairKey,
  readReceiptVisibleTo,
  relationshipView,
  viewerRelation,
} from '../lib/relations';
import { spaceConversationTitle, spaceRefs } from '../lib/spaces';
import { personView } from '../lib/users';
import { parse } from '../lib/validate';
import { requireAuth } from '../plugins/auth';
import { identityShownTo } from './people';
import { createSpaceConversation } from './spaces';

export async function membership(
  ctx: AppContext,
  userId: string,
  conversationId: string,
): Promise<{ conversation: Conversation; me: Participant }> {
  const row = await ctx.db
    .selectFrom('participants')
    .innerJoin('conversations', 'conversations.id', 'participants.conversation_id')
    .selectAll('participants')
    .select([
      'conversations.kind',
      'conversations.title',
      'conversations.purpose',
      'conversations.avatar_file_id',
      'conversations.direct_key',
      'conversations.connection_id',
      'conversations.is_general',
      'conversations.parent_id',
      'conversations.context_id',
      'conversations.space_id',
      'conversations.org_id',
      'conversations.privacy_class',
      'conversations.temporary_until',
      'conversations.retention_days',
      'conversations.created_by',
      'conversations.last_seq',
      'conversations.last_message_at',
      'conversations.created_at',
      'conversations.updated_at',
    ])
    .where('participants.conversation_id', '=', conversationId)
    .where('participants.user_id', '=', userId)
    .where('participants.left_at', 'is', null)
    .executeTakeFirst();
  if (!row) throw notFound('That conversation');
  const conversation: Conversation = {
    id: conversationId,
    kind: row.kind,
    title: row.title,
    purpose: row.purpose,
    avatar_file_id: row.avatar_file_id,
    direct_key: row.direct_key,
    connection_id: row.connection_id,
    is_general: row.is_general,
    parent_id: row.parent_id,
    context_id: row.context_id,
    space_id: row.space_id,
    org_id: row.org_id,
    privacy_class: row.privacy_class,
    temporary_until: row.temporary_until,
    retention_days: row.retention_days,
    created_by: row.created_by,
    last_seq: row.last_seq,
    last_message_at: row.last_message_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
  const me: Participant = {
    conversation_id: row.conversation_id,
    user_id: row.user_id,
    role: row.role,
    identity_id: row.identity_id,
    joined_at: row.joined_at,
    left_at: row.left_at,
    last_read_seq: row.last_read_seq,
    last_delivered_seq: row.last_delivered_seq,
    attention: row.attention,
    muted_until: row.muted_until,
    archived_at: row.archived_at,
    pinned_at: row.pinned_at,
    request_state: row.request_state,
    dismissed_seq: row.dismissed_seq,
    draft: row.draft,
    draft_updated_at: row.draft_updated_at,
  };
  return { conversation, me };
}

export async function conversationView(
  ctx: AppContext,
  userId: string,
  conversation: Conversation,
  me: Participant,
): Promise<ConversationView> {
  const now = ctx.now();
  const members = await ctx.db
    .selectFrom('participants as p')
    .innerJoin('users as u', 'u.id', 'p.user_id')
    .selectAll('u')
    .select([
      'p.role as member_role',
      'p.last_read_seq',
      'p.last_delivered_seq',
      'p.request_state as member_request_state',
    ])
    .where('p.conversation_id', '=', conversation.id)
    .where('p.left_at', 'is', null)
    .execute();
  const others = members.filter((m) => m.id !== userId);
  const rels = await activeRelationships(
    ctx.db,
    userId,
    others.map((o) => o.id),
  );
  const meUser = members.find((m) => m.id === userId);
  const participants = await Promise.all(
    members.map(async (m) => {
      const relation = await viewerRelation(ctx.db, m.id, userId);
      const identity = m.id === userId ? null : await identityShownTo(ctx, m.id, userId);
      const rel = rels.find((r) => r.subject_id === m.id);
      let readSeq: number | null = null;
      if (m.id !== userId && meUser) {
        const visible = await readReceiptVisibleTo(ctx.db, now, m, meUser);
        readSeq = visible ? Number(m.last_read_seq) : null;
      }
      return {
        userId: m.id,
        role: m.member_role,
        person: personView(m, relation, now, identity),
        relationship: rel ? relationshipView(rel) : null,
        readSeq,
        deliveredSeq: Number(m.last_delivered_seq),
      };
    }),
  );
  const other =
    conversation.kind === 'direct' ? participants.find((p) => p.userId !== userId) : undefined;
  const context = conversation.context_id
    ? await ctx.db
        .selectFrom('contexts')
        .selectAll()
        .where('id', '=', conversation.context_id)
        .executeTakeFirst()
    : undefined;
  // Who the viewer is waiting on: the other person, or for a team the customer it wrote to first.
  const otherRequest =
    conversation.kind === 'direct'
      ? others[0]?.member_request_state
      : conversation.kind === 'business' && me.role === 'agent'
        ? others.find((o) => o.member_role === 'member')?.member_request_state
        : null;
  const space = conversation.space_id
    ? ((await spaceRefs(ctx.db, [conversation.space_id])).get(conversation.space_id) ?? null)
    : null;
  let title = space
    ? spaceConversationTitle(space, conversation)
    : conversation.kind === 'direct'
      ? conversation.is_general
        ? (other?.person.displayName ?? 'Deleted account')
        : (conversation.title ?? 'Topic')
      : (conversation.title ?? 'Group');
  let shown = participants;
  let business: ConversationBusinessView | null = null;
  if (conversation.kind === 'business') {
    const thread = await ctx.db
      .selectFrom('business_threads')
      .selectAll()
      .where('conversation_id', '=', conversation.id)
      .executeTakeFirst();
    const org = thread
      ? await ctx.db
          .selectFrom('organizations')
          .selectAll()
          .where('id', '=', thread.org_id)
          .executeTakeFirst()
      : undefined;
    if (thread && org) {
      const closed = Boolean(await businessClosed(ctx.db, conversation.id));
      if (thread.customer_id === userId) {
        // The customer talks to the organization: nobody on its team is named (R15).
        shown = participants.filter((p) => p.userId === userId);
        title = org.name;
        business = {
          org: orgRef(org),
          readSeq: Number(thread.team_read_seq) || null,
          deliveredSeq: Number(conversation.last_seq),
          thread: null,
          closed,
        };
      } else {
        const [view] = await threadViews(ctx, userId, [thread]);
        title = view?.customer?.displayName ?? 'Deleted account';
        business = {
          org: orgRef(org),
          readSeq: null,
          deliveredSeq: 0,
          thread: view ?? null,
          closed,
        };
      }
    }
  }
  return {
    id: conversation.id,
    kind: conversation.kind,
    title,
    space,
    topic: conversation.kind === 'direct' && !conversation.is_general ? conversation.title : null,
    purpose: conversation.purpose,
    isGeneral: conversation.is_general,
    parentId: conversation.parent_id,
    privacyClass: conversation.privacy_class,
    retentionDays: conversation.retention_days,
    context: context
      ? {
          id: context.id,
          kind: context.kind,
          title: context.title,
          purpose: context.purpose,
          status: context.status,
          deadlineAt: context.deadline_at?.toISOString() ?? null,
        }
      : null,
    participants: shown,
    other: other ?? null,
    business,
    me: {
      role: me.role,
      lastReadSeq: Number(me.last_read_seq),
      attention: me.attention,
      mutedUntil: me.muted_until?.toISOString() ?? null,
      archived: me.archived_at !== null,
      pinned: me.pinned_at !== null,
      draft: me.draft,
      requestState: me.request_state,
    },
    /**
     * "incoming": someone you're not connected with wrote to you. "outgoing": you wrote first,
     * and it's still unanswered to you even once they've declined it.
     */
    request:
      me.request_state === 'pending'
        ? 'incoming'
        : otherRequest === 'pending' || otherRequest === 'declined'
          ? 'outgoing'
          : null,
    hasMinor: members.some((m) => isMinor(m.birth_year, now)),
    lastSeq: Number(conversation.last_seq),
    lastMessageAt: conversation.last_message_at?.toISOString() ?? null,
    createdAt: conversation.created_at.toISOString(),
  };
}

export async function createTopicConversation(
  ctx: AppContext,
  userId: string,
  parentId: string,
  title: string,
) {
  const { conversation } = await membership(ctx, userId, parentId);
  // In a space, a topic that keeps coming up in General becomes a conversation for everyone.
  if (conversation.space_id && conversation.is_general)
    return createSpaceConversation(ctx, userId, conversation.space_id, { title, everyone: true });
  if (conversation.kind !== 'direct' || !conversation.direct_key)
    throw badRequest('Topics branch off a direct conversation.');
  const members = await participantsOf(ctx.db, parentId);
  const id = uuidv7();
  await ctx.db.transaction().execute(async (trx) => {
    await trx
      .insertInto('conversations')
      .values({
        id,
        kind: 'direct',
        title,
        direct_key: conversation.direct_key,
        connection_id: conversation.connection_id,
        is_general: false,
        parent_id: conversation.is_general ? parentId : (conversation.parent_id ?? parentId),
        created_by: userId,
      })
      .execute();
    await trx
      .insertInto('participants')
      .values(members.map((m) => ({ conversation_id: id, user_id: m.user_id })))
      .execute();
    await recordEvent(trx, 'conversation.created', userId, { conversationId: id, kind: 'topic' });
  });
  await ctx.bus.publish(
    members.map((m) => m.user_id),
    { type: 'conversation.created', data: { conversationId: id } },
  );
  return id;
}

export async function conversationRoutes(app: FastifyInstance, ctx: AppContext) {
  app.post('/conversations', async (req, reply) => {
    const auth = requireAuth(req);
    const body = parse(CreateConversationBody, req.body);
    if (body.kind === 'direct') {
      if (body.userId === auth.userId) throw badRequest('That’s you.');
      const b = await between(ctx.db, auth.userId, body.userId);
      if (b.blockedByMe || b.blockedMe) throw forbidden('You can’t message this person.');
      if (body.title) {
        if (!b.connected) throw forbidden('Connect first to start topics.');
        const general = await ensureDirectConversation(ctx.db, auth.userId, body.userId, {
          connectionId: b.connectionId,
          createdBy: auth.userId,
        });
        const id = await createTopicConversation(ctx, auth.userId, general.id, body.title);
        if (body.contextId)
          await ctx.db
            .updateTable('conversations')
            .set({ context_id: body.contextId })
            .where('id', '=', id)
            .execute();
        reply.status(201);
        const m = await membership(ctx, auth.userId, id);
        return { conversation: await conversationView(ctx, auth.userId, m.conversation, m.me) };
      }
      if (!b.connected) await assertCanMessage(ctx, auth.userId, body.userId);
      const result = await ensureDirectConversation(ctx.db, auth.userId, body.userId, {
        connectionId: b.connectionId,
        createdBy: auth.userId,
        requestFrom: b.connected ? null : auth.userId,
      });
      if (result.created) reply.status(201);
      const m = await membership(ctx, auth.userId, result.id);
      return { conversation: await conversationView(ctx, auth.userId, m.conversation, m.me) };
    }
    // Groups are made of people you're connected with (anti-abuse, PRD §55).
    const memberIds = [...new Set(body.memberIds.filter((id) => id !== auth.userId))];
    const connected = await ctx.db
      .selectFrom('connection_sides as s')
      .innerJoin('connections as c', 'c.id', 's.connection_id')
      .select('s.other_id')
      .where('s.owner_id', '=', auth.userId)
      .where('s.other_id', 'in', memberIds)
      .where('c.status', '=', 'active')
      .execute();
    if (connected.length !== memberIds.length)
      throw badRequest('You can add people you’re connected with.');
    const id = uuidv7();
    await ctx.db.transaction().execute(async (trx) => {
      await trx
        .insertInto('conversations')
        .values({
          id,
          kind: 'group',
          title: body.title,
          purpose: body.purpose ?? null,
          created_by: auth.userId,
        })
        .execute();
      await trx
        .insertInto('participants')
        .values([
          { conversation_id: id, user_id: auth.userId, role: 'owner' },
          ...memberIds.map((u) => ({ conversation_id: id, user_id: u, role: 'member' as const })),
        ])
        .execute();
      await recordEvent(trx, 'conversation.created', auth.userId, {
        conversationId: id,
        kind: 'group',
      });
    });
    const creator = await ctx.db
      .selectFrom('users')
      .select(['display_name'])
      .where('id', '=', auth.userId)
      .executeTakeFirstOrThrow();
    await sendSystem(ctx, id, auth.userId, 'group_created', {
      title: body.title,
      by: creator.display_name,
    });
    await ctx.bus.publish([auth.userId, ...memberIds], {
      type: 'conversation.created',
      data: { conversationId: id },
    });
    reply.status(201);
    const m = await membership(ctx, auth.userId, id);
    return { conversation: await conversationView(ctx, auth.userId, m.conversation, m.me) };
  });

  app.get('/conversations/:id', async (req): Promise<{ conversation: ConversationView }> => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const { conversation, me } = await membership(ctx, auth.userId, id);
    return { conversation: await conversationView(ctx, auth.userId, conversation, me) };
  });

  app.patch('/conversations/:id', async (req) => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const body = parse(UpdateConversationBody, req.body);
    const { conversation, me } = await membership(ctx, auth.userId, id);
    const shared: Record<string, unknown> = {};
    if (
      body.title !== undefined ||
      body.purpose !== undefined ||
      body.contextId !== undefined ||
      body.retentionDays !== undefined
    ) {
      const canEdit = conversation.kind === 'direct' || ['owner', 'admin'].includes(me.role);
      if (!canEdit) throw forbidden('Only admins can change this.');
      if (body.title !== undefined) {
        if (conversation.kind === 'direct' && conversation.is_general)
          throw badRequest('The general conversation takes the person’s name.');
        if (conversation.space_id && conversation.is_general)
          throw badRequest('General takes the space’s name. Rename the space instead.');
        shared.title = body.title;
      }
      if (body.purpose !== undefined) shared.purpose = body.purpose;
      if (body.contextId !== undefined) shared.context_id = body.contextId;
      if (body.retentionDays !== undefined) shared.retention_days = body.retentionDays;
      await ctx.db
        .updateTable('conversations')
        .set({ ...shared, updated_at: ctx.now() })
        .where('id', '=', id)
        .execute();
      // Everyone sees when messages start or stop disappearing.
      if (body.retentionDays !== undefined && body.retentionDays !== conversation.retention_days)
        await sendSystem(ctx, id, auth.userId, 'retention_changed', { days: body.retentionDays });
    }
    const mine = {
      ...(body.attention !== undefined ? { attention: body.attention } : {}),
      ...(body.mutedUntil !== undefined ? { muted_until: body.mutedUntil } : {}),
      ...(body.archived !== undefined ? { archived_at: body.archived ? ctx.now() : null } : {}),
      ...(body.pinned !== undefined ? { pinned_at: body.pinned ? ctx.now() : null } : {}),
      ...(body.draft !== undefined ? { draft: body.draft, draft_updated_at: ctx.now() } : {}),
    };
    // Only what was sent: an empty SET is invalid SQL (renaming a group used to fail here).
    if (Object.keys(mine).length)
      await ctx.db
        .updateTable('participants')
        .set(mine)
        .where('conversation_id', '=', id)
        .where('user_id', '=', auth.userId)
        .execute();
    const everyone = Object.keys(shared).length > 0;
    const recipients = everyone
      ? (await participantsOf(ctx.db, id)).map((p) => p.user_id)
      : [auth.userId];
    await ctx.bus.publish(recipients, {
      type: 'conversation.updated',
      data: { conversationId: id },
    });
    const m = await membership(ctx, auth.userId, id);
    return { conversation: await conversationView(ctx, auth.userId, m.conversation, m.me) };
  });

  app.post('/conversations/:id/request', async (req) => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const { decision } = parse(z.object({ decision: z.enum(['accept', 'decline']) }), req.body);
    const { me } = await membership(ctx, auth.userId, id);
    if (me.request_state !== 'pending') throw badRequest('There’s no request to answer here.');
    await ctx.db
      .updateTable('participants')
      .set({
        request_state: decision === 'accept' ? 'accepted' : 'declined',
        archived_at: decision === 'decline' ? ctx.now() : null,
      })
      .where('conversation_id', '=', id)
      .where('user_id', '=', auth.userId)
      .execute();
    await ctx.bus.publish(
      (await participantsOf(ctx.db, id)).map((p) => p.user_id),
      { type: 'conversation.updated', data: { conversationId: id } },
    );
    return { ok: true };
  });

  app.post('/conversations/:id/members', async (req) => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const body = parse(MembersBody, req.body);
    const { conversation, me } = await membership(ctx, auth.userId, id);
    if (conversation.kind === 'direct') throw badRequest('Start a group to add people.');
    if (conversation.kind === 'business')
      throw badRequest('Its team is the organization’s: add people to the team instead.');
    if (!['owner', 'admin'].includes(me.role)) throw forbidden('Only admins can add people.');
    if (conversation.space_id) {
      // A space's conversations hold its people: General all of them, the others who join.
      if (conversation.is_general) throw badRequest('Add people to the space instead.');
      const inSpace = await ctx.db
        .selectFrom('space_members')
        .select('user_id')
        .where('space_id', '=', conversation.space_id)
        .where('user_id', 'in', body.userIds)
        .where('left_at', 'is', null)
        .execute();
      if (inSpace.length !== new Set(body.userIds).size)
        throw badRequest('Add them to the space first.');
    } else {
      const connected = await ctx.db
        .selectFrom('connection_sides as s')
        .innerJoin('connections as c', 'c.id', 's.connection_id')
        .select('s.other_id')
        .where('s.owner_id', '=', auth.userId)
        .where('s.other_id', 'in', body.userIds)
        .where('c.status', '=', 'active')
        .execute();
      if (connected.length !== new Set(body.userIds).size)
        throw badRequest('You can add people you’re connected with.');
    }
    for (const userId of body.userIds) {
      await ctx.db
        .insertInto('participants')
        .values({
          conversation_id: id,
          user_id: userId,
          role: 'member',
          last_read_seq: conversation.last_seq,
        })
        .onConflict((oc) =>
          oc.columns(['conversation_id', 'user_id']).doUpdateSet({ left_at: null }),
        )
        .execute();
    }
    await sendSystem(ctx, id, auth.userId, 'members_added', { userIds: body.userIds });
    await ctx.bus.publish([...(await participantsOf(ctx.db, id)).map((p) => p.user_id)], {
      type: 'conversation.updated',
      data: { conversationId: id },
    });
    return { ok: true };
  });

  app.delete('/conversations/:id/members/:userId', async (req) => {
    const auth = requireAuth(req);
    const { id, userId } = parse(
      z.object({ id: z.string().uuid(), userId: z.string().uuid() }),
      req.params,
    );
    const { conversation, me } = await membership(ctx, auth.userId, id);
    if (conversation.kind === 'direct' || conversation.kind === 'business')
      throw badRequest('You can archive this conversation instead.');
    if (conversation.space_id && conversation.is_general)
      throw badRequest(
        userId === auth.userId
          ? 'Leave the space to leave its General conversation.'
          : 'Remove them from the space instead.',
      );
    if (userId !== auth.userId && !['owner', 'admin'].includes(me.role))
      throw forbidden('Only admins can remove people.');
    await ctx.db
      .updateTable('participants')
      .set({ left_at: ctx.now() })
      .where('conversation_id', '=', id)
      .where('user_id', '=', userId)
      .execute();
    await sendSystem(
      ctx,
      id,
      auth.userId,
      userId === auth.userId ? 'member_left' : 'member_removed',
      { userId },
    );
    await ctx.bus.publish([userId, ...(await participantsOf(ctx.db, id)).map((p) => p.user_id)], {
      type: 'conversation.updated',
      data: { conversationId: id },
    });
    return { ok: true };
  });

  app.post('/conversations/:id/receipts', async (req) => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const body = parse(ReceiptsBody, req.body);
    const { conversation, me } = await membership(ctx, auth.userId, id);
    const last = Number(conversation.last_seq);
    const read = body.read !== undefined ? Math.min(body.read, last) : undefined;
    const delivered = Math.max(body.delivered ?? 0, read ?? 0);
    const patch: Record<string, number> = {};
    if (read !== undefined && read > Number(me.last_read_seq)) patch.last_read_seq = read;
    if (delivered > Number(me.last_delivered_seq))
      patch.last_delivered_seq = Math.min(delivered, last);
    if (Object.keys(patch).length === 0) return { ok: true };
    await ctx.db
      .updateTable('participants')
      .set(patch)
      .where('conversation_id', '=', id)
      .where('user_id', '=', auth.userId)
      .execute();
    // The organization has read it when someone on its team has (R15): the customer's "read".
    if (conversation.kind === 'business' && me.role === 'agent' && patch.last_read_seq)
      await ctx.db
        .updateTable('business_threads')
        .set({ team_read_seq: sql`greatest(team_read_seq, ${patch.last_read_seq})` })
        .where('conversation_id', '=', id)
        .execute();
    if (patch.last_read_seq !== undefined) {
      // Reading a conversation clears its notification.
      await ctx.db
        .updateTable('notifications')
        .set({ read_at: ctx.now() })
        .where('user_id', '=', auth.userId)
        .where('group_key', '=', `conv:${id}`)
        .where('read_at', 'is', null)
        .execute();
      await recordEvent(ctx.db, 'message.read', auth.userId, {
        conversationId: id,
        seq: String(patch.last_read_seq),
      });
    }
    const members = await participantsOf(ctx.db, id);
    const event = (readSeq: number | null) => ({
      type: 'receipts',
      data: {
        conversationId: id,
        userId: auth.userId,
        readSeq,
        deliveredSeq: patch.last_delivered_seq ?? null,
      },
    });
    const others = members.map((m) => m.user_id).filter((u) => u !== auth.userId);
    if (patch.last_read_seq === undefined || others.length === 0) {
      await ctx.bus.publish(
        members.map((m) => m.user_id),
        event(null),
      );
      return { ok: true };
    }
    // Read positions are private unless both sides share them (R25): check each recipient.
    const users = await ctx.db
      .selectFrom('users')
      .selectAll()
      .where('id', 'in', [auth.userId, ...others])
      .execute();
    const reader = users.find((u) => u.id === auth.userId);
    const now = ctx.now();
    const allowed: string[] = [auth.userId];
    const withheld: string[] = [];
    const teamReadsForCustomer = conversation.kind === 'business' && me.role === 'agent';
    for (const viewer of users) {
      if (viewer.id === auth.userId) continue;
      const customer = members.find((m) => m.user_id === viewer.id)?.role === 'member';
      const visible =
        (teamReadsForCustomer && customer) ||
        (reader ? await readReceiptVisibleTo(ctx.db, now, reader, viewer) : false);
      (visible ? allowed : withheld).push(viewer.id);
    }
    await ctx.bus.publish(allowed, event(patch.last_read_seq));
    if (withheld.length) await ctx.bus.publish(withheld, event(null));
    return { ok: true };
  });

  app.post('/conversations/:id/typing', async (req) => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    await membership(ctx, auth.userId, id);
    await assertCanWrite(ctx, id, auth.userId);
    ctx.limiter.hit(`typing:${auth.userId}:${id}`, 30, 60_000);
    const members = await participantsOf(ctx.db, id);
    await ctx.bus.publish(
      members.filter((m) => m.user_id !== auth.userId).map((m) => m.user_id),
      { type: 'typing', data: { conversationId: id, userId: auth.userId } },
    );
    return { ok: true };
  });

  /** "Doesn't need me" (R8): questions up to now stop counting toward Needs you. */
  app.post('/conversations/:id/dismiss', async (req) => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const { conversation } = await membership(ctx, auth.userId, id);
    await ctx.db
      .updateTable('participants')
      .set({ dismissed_seq: conversation.last_seq })
      .where('conversation_id', '=', id)
      .where('user_id', '=', auth.userId)
      .execute();
    await ctx.bus.publish([auth.userId], {
      type: 'conversation.updated',
      data: { conversationId: id },
    });
    return { ok: true };
  });

  app.get('/conversations/:id/messages', async (req): Promise<MessagesPage> => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const q = parse(
      z.object({
        before: z.coerce.number().int().optional(),
        after: z.coerce.number().int().optional(),
        around: z.coerce.number().int().optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50),
      }),
      req.query,
    );
    const { conversation, me } = await membership(ctx, auth.userId, id);
    let query = ctx.db
      .selectFrom('messages')
      .selectAll()
      .where('conversation_id', '=', id)
      .where((eb) =>
        eb.not(
          eb.exists(
            eb
              .selectFrom('hidden_messages')
              .select('message_id')
              .whereRef('hidden_messages.message_id', '=', 'messages.id')
              .where('hidden_messages.user_id', '=', auth.userId),
          ),
        ),
      );
    if (q.after !== undefined)
      query = query.where('seq', '>', String(q.after)).orderBy('seq', 'asc');
    else if (q.around !== undefined)
      query = query
        .where('seq', '>=', String(Math.max(0, q.around - Math.floor(q.limit / 2))))
        .orderBy('seq', 'asc');
    else {
      if (q.before !== undefined) query = query.where('seq', '<', String(q.before));
      query = query.orderBy('seq', 'desc');
    }
    const rows = await query.limit(q.limit).execute();
    rows.sort((a, b) => Number(a.seq) - Number(b.seq));
    // Fetching is delivery.
    const newest = rows.length ? Number(rows[rows.length - 1]!.seq) : 0;
    if (newest > Number(me.last_delivered_seq)) {
      await ctx.db
        .updateTable('participants')
        .set({ last_delivered_seq: newest })
        .where('conversation_id', '=', id)
        .where('user_id', '=', auth.userId)
        .execute();
    }
    return {
      messages: await messageViews(ctx.db, rows, auth.userId),
      lastSeq: Number(conversation.last_seq),
      hasMore: q.after === undefined && rows.length === q.limit,
    };
  });

  app.post('/conversations/:id/messages', async (req, reply) => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const body = parse(SendMessageBody, req.body);
    ctx.limiter.hit(`send:${auth.userId}`, ctx.config.isTest ? 10_000 : 120, 60_000);
    const result = await sendMessage(ctx, auth.userId, id, body);
    const [view] = await messageViews(ctx.db, [result.message], auth.userId);
    if (result.created) {
      reply.status(201);
      const members = await participantsOf(ctx.db, id);
      await ctx.bus.publish(
        members.map((m) => m.user_id).filter((u) => u !== auth.userId),
        { type: 'message.created', data: { ...view, clientId: null } },
      );
      // The sender's other devices and this one get the echo with its clientId (ADR-8).
      await ctx.bus.publish([auth.userId], { type: 'message.created', data: view });
      await ctx.bus.publish([auth.userId], {
        type: 'message.sent',
        data: { conversationId: id, clientId: body.clientId, id: view!.id, seq: view!.seq },
      });
      const { analysis, message } = result;
      ctx.defer('after-message', () => afterMessage(ctx, message, analysis));
    }
    return { message: view };
  });

  app.patch('/messages/:id', async (req) => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const body = parse(EditMessageBody, req.body);
    const m = await ctx.db
      .selectFrom('messages')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!m) throw notFound('That message');
    await membership(ctx, auth.userId, m.conversation_id);
    if (m.sender_id !== auth.userId) throw forbidden('You can only edit your own messages.');
    await assertCanWrite(ctx, m.conversation_id, auth.userId);
    if (m.deleted_at) throw badRequest('That message was deleted.');
    if (body.body !== undefined && m.kind !== 'text')
      throw badRequest('Only text messages can be edited.');
    const updated = await ctx.db
      .updateTable('messages')
      .set({
        ...(body.body !== undefined ? { body: body.body, edited_at: ctx.now() } : {}),
        ...(body.mode !== undefined ? { mode: body.mode, mode_source: 'user' } : {}),
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    const [view] = await messageViews(ctx.db, [updated], auth.userId);
    await recordEvent(ctx.db, 'message.edited', auth.userId, { messageId: id });
    await ctx.bus.publish(
      (await participantsOf(ctx.db, m.conversation_id)).map((p) => p.user_id),
      { type: 'message.updated', data: { ...view, clientId: null } },
    );
    return { message: view };
  });

  // Moving a kit card along (PRD §41): approve, accept, mark paid. Who may make which move is the
  // kit's flow in core (kit-cards.ts); the move is applied only if nobody moved the card first.
  app.post('/messages/:id/kit', async (req) => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const { to } = parse(z.object({ to: z.string().min(1).max(40) }), req.body);
    const m = await ctx.db
      .selectFrom('messages')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!m) throw notFound('That message');
    await membership(ctx, auth.userId, m.conversation_id);
    await assertCanWrite(ctx, m.conversation_id, auth.userId);
    const card = (m.payload ?? {}) as {
      kit?: unknown;
      state?: string;
      title?: string;
      history?: Array<{ state: string; by: string; at: string }>;
    };
    if (m.kind !== 'kit' || m.deleted_at || !isCardKit(card.kit))
      throw badRequest('That isn’t a card that can change.');
    const from = card.state ?? '';
    // In a business conversation the team is one side: anyone on it acts for a card it sent.
    const business = await customerMask(ctx.db, m.conversation_id);
    const onTeam = (userId: string | null) => Boolean(business && userId !== business.customerId);
    const senderSide = m.sender_id === auth.userId || (onTeam(m.sender_id) && onTeam(auth.userId));
    const move = kitMoves(card.kit, from, senderSide).find((x) => x.to === to);
    if (!move) throw forbidden('You can’t make that change to this card.');
    const updated = await ctx.db
      .updateTable('messages')
      .set({
        payload: JSON.stringify({
          ...card,
          state: to,
          history: [...(card.history ?? []), { state: to, by: auth.userId, at: ctx.now() }],
        }),
      })
      .where('id', '=', id)
      .where(sql<boolean>`payload->>'state' = ${from}`)
      .returningAll()
      .executeTakeFirst();
    if (!updated) throw new AppError(409, 'conflict', 'Someone just changed this card.');
    const members = (await participantsOf(ctx.db, m.conversation_id)).map((p) => p.user_id);
    const [view] = await messageViews(ctx.db, [updated], auth.userId);
    await recordEvent(ctx.db, 'kit.moved', auth.userId, { messageId: id, kit: card.kit, to });
    await ctx.bus.publish(members, { type: 'message.updated', data: { ...view, clientId: null } });
    const mover = await ctx.db
      .selectFrom('users')
      .select('display_name')
      .where('id', '=', auth.userId)
      .executeTakeFirstOrThrow();
    // Everyone else hears it; an answer to what the sender asked matters more than an update.
    // In a business conversation, the other side does: the customer hears the organization.
    for (const userId of members) {
      if (userId === auth.userId) continue;
      if (business && onTeam(userId) === onTeam(auth.userId)) continue;
      if (business && onTeam(userId) && userId !== m.sender_id) continue;
      await notify(ctx, {
        userId,
        kind: 'kit',
        level: userId === m.sender_id ? 'attention' : 'activity',
        title: `${business && !onTeam(userId) ? business.orgName : mover.display_name}: ${kitStateLabel(to)}`,
        body: `${KITS[card.kit].name} · ${card.title ?? ''}`,
        data: { conversationId: m.conversation_id, messageId: id },
      });
    }
    return { message: view };
  });

  /**
   * A checklist card (PRD §41): anyone in the conversation ticks and adds; whoever added an item,
   * or made the list, changes or removes it. Changes are applied one at a time (the card's row is
   * locked), so two people ticking at once never undo each other.
   */
  /**
   * A live location moves with its sharer, and only theirs: only the latest point is kept, never
   * a trail. It stops at the time they chose, or when they stop it.
   */
  async function moveLiveLocation(
    id: string,
    userId: string,
    change: (card: LocationPayloadT & { live: LiveLocation }, at: Date) => Record<string, unknown>,
  ) {
    const found = await ctx.db
      .selectFrom('messages')
      .select('conversation_id')
      .where('id', '=', id)
      .executeTakeFirst();
    if (!found) throw notFound('That message');
    await membership(ctx, userId, found.conversation_id);
    await assertCanWrite(ctx, found.conversation_id, userId);
    const updated = await ctx.db.transaction().execute(async (trx) => {
      const m = await trx
        .selectFrom('messages')
        .selectAll()
        .where('id', '=', id)
        .forUpdate()
        .executeTakeFirstOrThrow();
      const card = (m.payload ?? {}) as LocationPayloadT & { live?: LiveLocation };
      if (m.kind !== 'location' || m.deleted_at || !card.live)
        throw badRequest('That isn’t a live location.');
      if (m.sender_id !== userId) throw forbidden('Only whoever is sharing it can change it.');
      const at = ctx.now();
      if (!liveNow(card.live, at))
        throw new AppError(409, 'location_ended', 'This live location has ended.');
      return trx
        .updateTable('messages')
        .set({ payload: JSON.stringify(change({ ...card, live: card.live }, at)) })
        .where('id', '=', id)
        .returningAll()
        .executeTakeFirstOrThrow();
    });
    const members = (await participantsOf(ctx.db, found.conversation_id)).map((p) => p.user_id);
    const [view] = await messageViews(ctx.db, [updated], userId);
    await ctx.bus.publish(members, { type: 'message.updated', data: { ...view, clientId: null } });
    return { message: view! };
  }

  app.post('/messages/:id/location', async (req) => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const point = parse(LiveLocationUpdate, req.body);
    // A moving phone reports often; every few seconds is plenty for the people watching.
    ctx.limiter.hit(`live-location:${id}`, ctx.config.isTest ? 1000 : 1, 2_000);
    return moveLiveLocation(id, auth.userId, (card, at) => ({
      ...card,
      lat: point.lat,
      lng: point.lng,
      accuracy: point.accuracy,
      live: { ...card.live, updatedAt: at.toISOString() },
    }));
  });

  app.post('/messages/:id/location/stop', async (req) => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    return moveLiveLocation(id, auth.userId, (card, at) => ({
      ...card,
      live: { ...card.live, stoppedAt: at.toISOString() },
    }));
  });

  app.post('/messages/:id/checklist', async (req) => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const op = parse(ChecklistOpBody, req.body);
    const found = await ctx.db
      .selectFrom('messages')
      .select('conversation_id')
      .where('id', '=', id)
      .executeTakeFirst();
    if (!found) throw notFound('That message');
    await membership(ctx, auth.userId, found.conversation_id);
    await assertCanWrite(ctx, found.conversation_id, auth.userId);
    const { updated, before, card } = await ctx.db.transaction().execute(async (trx) => {
      const m = await trx
        .selectFrom('messages')
        .selectAll()
        .where('id', '=', id)
        .forUpdate()
        .executeTakeFirstOrThrow();
      const card = (m.payload ?? {}) as {
        kit?: unknown;
        state?: string;
        title?: string;
        fields?: Record<string, unknown>;
      };
      if (m.kind !== 'kit' || m.deleted_at || card.kit !== 'checklist')
        throw badRequest('That isn’t a checklist.');
      const applied = applyChecklistOp(checklistItems(card.fields ?? {}), op, {
        userId: auth.userId,
        isCreator: m.sender_id === auth.userId,
      });
      if (!applied.ok)
        throw applied.forbidden ? forbidden(applied.error) : badRequest(applied.error);
      const updated = await trx
        .updateTable('messages')
        .set({
          payload: JSON.stringify({
            ...card,
            fields: { ...card.fields, items: applied.items },
            state: checklistState(applied.items),
          }),
        })
        .where('id', '=', id)
        .returningAll()
        .executeTakeFirstOrThrow();
      return { updated, before: card.state, card: { ...card, creatorId: m.sender_id } };
    });
    const members = (await participantsOf(ctx.db, found.conversation_id)).map((p) => p.user_id);
    const [view] = await messageViews(ctx.db, [updated], auth.userId);
    await ctx.bus.publish(members, { type: 'message.updated', data: { ...view, clientId: null } });
    // Finishing the list is news for whoever made it; each tick isn't.
    const state = (updated.payload as { state?: string }).state;
    if (before !== 'done' && state === 'done' && card.creatorId && card.creatorId !== auth.userId) {
      const who = await ctx.db
        .selectFrom('users')
        .select('display_name')
        .where('id', '=', auth.userId)
        .executeTakeFirstOrThrow();
      await notify(ctx, {
        userId: card.creatorId,
        kind: 'kit',
        level: 'activity',
        title: `${who.display_name} finished ${card.title ?? 'the list'}`,
        body: 'Everything on it is ticked.',
        data: { conversationId: found.conversation_id, messageId: id },
      });
    }
    return { message: view };
  });

  // --- Shared albums (PRD §41): photos people in the conversation add to one card -------------

  const ALBUM_MAX = 500;

  async function albumCard(id: string, userId: string) {
    const m = await ctx.db
      .selectFrom('messages')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!m) throw notFound('That album');
    await membership(ctx, userId, m.conversation_id);
    const card = (m.payload ?? {}) as { kit?: unknown; state?: string; title?: string };
    if (m.kind !== 'kit' || m.deleted_at || card.kit !== 'shared_album')
      throw notFound('That album');
    return { m, card };
  }

  /** Everyone in the conversation sees the card change: its count and latest photos. */
  async function albumChanged(messageId: string, conversationId: string, actorId: string) {
    const updated = await ctx.db
      .selectFrom('messages')
      .selectAll()
      .where('id', '=', messageId)
      .executeTakeFirstOrThrow();
    const members = (await participantsOf(ctx.db, conversationId)).map((p) => p.user_id);
    const [view] = await messageViews(ctx.db, [updated], actorId);
    await ctx.bus.publish(members, { type: 'message.updated', data: { ...view, clientId: null } });
    return { view, members };
  }

  app.get('/messages/:id/album', async (req): Promise<{ photos: AlbumPhotoView[] }> => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    await albumCard(id, auth.userId);
    const rows = await ctx.db
      .selectFrom('album_photos as a')
      .innerJoin('files', 'files.id', 'a.file_id')
      .select([
        'a.added_by',
        'a.created_at as added_at',
        'files.id',
        'files.name',
        'files.mime',
        'files.size',
        'files.kind',
        'files.width',
        'files.height',
        'files.duration_ms',
        'files.thumb_key',
      ])
      .where('a.message_id', '=', id)
      .orderBy('a.created_at', 'desc')
      .orderBy('a.file_id', 'desc')
      .execute();
    return {
      photos: rows.map((r) => ({
        file: fileView(r),
        addedBy: r.added_by,
        addedAt: r.added_at.toISOString(),
      })),
    };
  });

  app.post('/messages/:id/album', async (req) => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const { fileIds } = parse(
      z.object({ fileIds: z.array(z.string().uuid()).min(1).max(20) }),
      req.body,
    );
    const { m, card } = await albumCard(id, auth.userId);
    await assertCanWrite(ctx, m.conversation_id, auth.userId);
    if (card.state === 'closed') throw badRequest('This album is closed.');
    const wanted = [...new Set(fileIds)];
    const files = await ctx.db
      .selectFrom('files')
      .select(['id', 'kind', 'status', 'owner_id', 'name'])
      .where('id', 'in', wanted)
      .execute();
    // Your own uploads only: nobody adds a photo they were merely shown elsewhere.
    if (
      files.length !== wanted.length ||
      files.some((f) => f.owner_id !== auth.userId || f.status !== 'ready')
    )
      throw badRequest('Add photos you’ve uploaded.');
    if (files.some((f) => f.kind !== 'image' && f.kind !== 'video'))
      throw badRequest('Albums take photos and videos.');
    const { n } = await ctx.db
      .selectFrom('album_photos')
      .select(sql<number>`count(*)::int`.as('n'))
      .where('message_id', '=', id)
      .executeTakeFirstOrThrow();
    if (n + files.length > ALBUM_MAX) throw badRequest(`An album holds ${ALBUM_MAX} photos.`);
    const added = await ctx.db.transaction().execute(async (trx) => {
      const inserted = await trx
        .insertInto('album_photos')
        .values(
          files.map((f) => ({
            message_id: id,
            file_id: f.id,
            added_by: auth.userId,
            created_at: ctx.now(),
          })),
        )
        .onConflict((oc) => oc.doNothing())
        .returning('file_id')
        .execute();
      const fresh = files.filter((f) => inserted.some((i) => i.file_id === f.id));
      if (fresh.length)
        await trx
          .insertInto('assets')
          .values(
            fresh.map((f) => ({
              id: uuidv7(),
              conversation_id: m.conversation_id,
              message_id: id,
              sender_id: auth.userId,
              kind: f.kind === 'video' ? ('video' as const) : ('photo' as const),
              file_id: f.id,
              title: f.name,
              created_at: ctx.now(),
            })),
          )
          .execute();
      return fresh.length;
    });
    const { view, members } = await albumChanged(id, m.conversation_id, auth.userId);
    if (added) {
      const who = await ctx.db
        .selectFrom('users')
        .select('display_name')
        .where('id', '=', auth.userId)
        .executeTakeFirstOrThrow();
      // News, not something to do: activity, one line per album however many arrive.
      for (const userId of members) {
        if (userId === auth.userId) continue;
        await notify(ctx, {
          userId,
          kind: 'kit',
          level: 'activity',
          title: `${who.display_name} added ${added === 1 ? 'a photo' : `${added} photos`} to ${card.title ?? 'the album'}`,
          data: { conversationId: m.conversation_id, messageId: id },
          groupKey: `album:${id}`,
        });
      }
    }
    return { message: view };
  });

  app.delete('/messages/:id/album/:fileId', async (req) => {
    const auth = requireAuth(req);
    const { id, fileId } = parse(
      z.object({ id: z.string().uuid(), fileId: z.string().uuid() }),
      req.params,
    );
    const { m } = await albumCard(id, auth.userId);
    const photo = await ctx.db
      .selectFrom('album_photos')
      .select('added_by')
      .where('message_id', '=', id)
      .where('file_id', '=', fileId)
      .executeTakeFirst();
    if (!photo) throw notFound('That photo');
    // Whoever added it, or whoever made the album, takes it out.
    if (photo.added_by !== auth.userId && m.sender_id !== auth.userId)
      throw forbidden('Only whoever added it, or made the album, can take it out.');
    await ctx.db.transaction().execute(async (trx) => {
      await trx
        .deleteFrom('album_photos')
        .where('message_id', '=', id)
        .where('file_id', '=', fileId)
        .execute();
      await trx
        .deleteFrom('assets')
        .where('message_id', '=', id)
        .where('file_id', '=', fileId)
        .execute();
    });
    const { view } = await albumChanged(id, m.conversation_id, auth.userId);
    return { message: view };
  });

  app.delete('/messages/:id', async (req) => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const { forEveryone } = parse(
      z.object({ forEveryone: z.enum(['true', 'false']).default('true') }),
      req.query,
    );
    const m = await ctx.db
      .selectFrom('messages')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!m) throw notFound('That message');
    const { me } = await membership(ctx, auth.userId, m.conversation_id);
    if (forEveryone === 'false') {
      await ctx.db
        .insertInto('hidden_messages')
        .values({ message_id: id, user_id: auth.userId })
        .onConflict((oc) => oc.doNothing())
        .execute();
      await ctx.bus.publish([auth.userId], {
        type: 'message.hidden',
        data: { id, conversationId: m.conversation_id },
      });
      return { ok: true };
    }
    const moderator = ['owner', 'admin'].includes(me.role);
    if (m.sender_id !== auth.userId && !moderator)
      throw forbidden('You can delete your own messages.');
    await ctx.db.transaction().execute(async (trx) => {
      await trx
        .updateTable('messages')
        .set({ deleted_at: ctx.now(), body: null, payload: '{}', entities: '{}' })
        .where('id', '=', id)
        .execute();
      await trx.deleteFrom('assets').where('message_id', '=', id).execute();
      await trx.deleteFrom('message_files').where('message_id', '=', id).execute();
      await trx
        .updateTable('suggestions')
        .set({ status: 'expired', resolved_at: ctx.now() })
        .where('message_id', '=', id)
        .where('status', '=', 'pending')
        .execute();
      await recordEvent(trx, 'message.deleted', auth.userId, { messageId: id });
    });
    await ctx.bus.publish(
      (await participantsOf(ctx.db, m.conversation_id)).map((p) => p.user_id),
      { type: 'message.deleted', data: { id, conversationId: m.conversation_id } },
    );
    return { ok: true };
  });

  app.post('/messages/:id/reactions', async (req) => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const { emoji } = parse(ReactionBody, req.body);
    const m = await ctx.db
      .selectFrom('messages')
      .select(['conversation_id', 'deleted_at'])
      .where('id', '=', id)
      .executeTakeFirst();
    if (!m || m.deleted_at) throw notFound('That message');
    await membership(ctx, auth.userId, m.conversation_id);
    await assertCanWrite(ctx, m.conversation_id, auth.userId);
    await ctx.db
      .insertInto('reactions')
      .values({ message_id: id, user_id: auth.userId, emoji })
      .onConflict((oc) => oc.doNothing())
      .execute();
    await ctx.bus.publish(
      (await participantsOf(ctx.db, m.conversation_id)).map((p) => p.user_id),
      {
        type: 'reaction',
        data: {
          messageId: id,
          conversationId: m.conversation_id,
          userId: auth.userId,
          emoji,
          added: true,
        },
      },
    );
    return { ok: true };
  });

  app.delete('/messages/:id/reactions/:emoji', async (req) => {
    const auth = requireAuth(req);
    const { id, emoji } = parse(
      z.object({ id: z.string().uuid(), emoji: z.string().min(1).max(16) }),
      req.params,
    );
    const m = await ctx.db
      .selectFrom('messages')
      .select(['conversation_id'])
      .where('id', '=', id)
      .executeTakeFirst();
    if (!m) throw notFound('That message');
    await membership(ctx, auth.userId, m.conversation_id);
    await ctx.db
      .deleteFrom('reactions')
      .where('message_id', '=', id)
      .where('user_id', '=', auth.userId)
      .where('emoji', '=', emoji)
      .execute();
    await ctx.bus.publish(
      (await participantsOf(ctx.db, m.conversation_id)).map((p) => p.user_id),
      {
        type: 'reaction',
        data: {
          messageId: id,
          conversationId: m.conversation_id,
          userId: auth.userId,
          emoji,
          added: false,
        },
      },
    );
    return { ok: true };
  });

  app.post('/messages/:id/vote', async (req) => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const { optionIds } = parse(VoteBody, req.body);
    const m = await ctx.db
      .selectFrom('messages')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (m?.kind !== 'poll' || m.deleted_at) throw notFound('That poll');
    await membership(ctx, auth.userId, m.conversation_id);
    await assertCanWrite(ctx, m.conversation_id, auth.userId);
    const poll = PollPayload.parse(m.payload);
    const valid = new Set(poll.options.map((o) => o.id));
    if (optionIds.some((o) => !valid.has(o))) throw badRequest('That option isn’t in the poll.');
    if (!poll.multiple && optionIds.length > 1) throw badRequest('Choose one option.');
    await ctx.db.transaction().execute(async (trx) => {
      await trx
        .deleteFrom('poll_votes')
        .where('message_id', '=', id)
        .where('user_id', '=', auth.userId)
        .execute();
      if (optionIds.length) {
        await trx
          .insertInto('poll_votes')
          .values(optionIds.map((o) => ({ message_id: id, user_id: auth.userId, option_id: o })))
          .execute();
      }
    });
    const [view] = await messageViews(ctx.db, [m], auth.userId);
    await ctx.bus.publish(
      (await participantsOf(ctx.db, m.conversation_id)).map((p) => p.user_id),
      { type: 'poll.updated', data: { messageId: id, conversationId: m.conversation_id } },
    );
    return { message: view };
  });

  app.post('/messages/:id/forward', async (req) => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const body = parse(ForwardBody, req.body);
    const m = await ctx.db
      .selectFrom('messages')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!m || m.deleted_at) throw notFound('That message');
    await membership(ctx, auth.userId, m.conversation_id);
    const files = await ctx.db
      .selectFrom('message_files')
      .select('file_id')
      .where('message_id', '=', id)
      .orderBy('position')
      .execute();
    const out: string[] = [];
    for (const [i, conversationId] of body.conversationIds.entries()) {
      await membership(ctx, auth.userId, conversationId);
      const result = await sendMessage(
        ctx,
        auth.userId,
        conversationId,
        {
          clientId: `${body.clientId}:${i}`,
          kind: m.kind === 'system' ? 'text' : m.kind,
          body: m.body,
          payload: m.payload,
          fileIds: files.map((f) => f.file_id),
        },
        { forwardedFromId: id },
      );
      out.push(result.message.id);
      if (result.created) {
        const [view] = await messageViews(ctx.db, [result.message], auth.userId);
        await ctx.bus.publish(
          (await participantsOf(ctx.db, conversationId)).map((p) => p.user_id),
          { type: 'message.created', data: { ...view, clientId: null } },
        );
        const { message, analysis } = result;
        ctx.defer('after-message', () => afterMessage(ctx, message, analysis));
      }
    }
    return { messageIds: out };
  });

  /** The asset index (PRD §26): everything shared, without scrolling. */
  app.get('/conversations/:id/assets', async (req) => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const { kind, limit } = parse(
      z.object({
        kind: z
          .enum(['photo', 'video', 'document', 'audio', 'link', 'location', 'contact'])
          .optional(),
        limit: z.coerce.number().int().min(1).max(200).default(60),
      }),
      req.query,
    );
    await membership(ctx, auth.userId, id);
    const rows = await ctx.db
      .selectFrom('assets as a')
      .leftJoin('files as f', 'f.id', 'a.file_id')
      .select([
        'a.id',
        'a.kind',
        'a.url',
        'a.title',
        'a.host',
        'a.message_id',
        'a.sender_id',
        'a.created_at',
        'f.id as file_id',
        'f.name',
        'f.mime',
        'f.size',
        'f.kind as file_kind',
        'f.width',
        'f.height',
        'f.duration_ms',
        'f.thumb_key',
      ])
      .where('a.conversation_id', '=', id)
      .$if(Boolean(kind), (qb) => qb.where('a.kind', '=', kind!))
      .orderBy('a.created_at', 'desc')
      .limit(limit)
      .execute();
    const counts = await ctx.db
      .selectFrom('assets')
      .select(['kind', sql<number>`count(*)::int`.as('n')])
      .where('conversation_id', '=', id)
      .groupBy('kind')
      .execute();
    const mask = await maskFor(ctx.db, id, auth.userId);
    return {
      counts: Object.fromEntries(counts.map((c) => [c.kind, c.n])),
      assets: rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        url: r.url,
        title: r.title,
        host: r.host,
        messageId: r.message_id,
        senderId: mask ? maskId(mask, r.sender_id) : r.sender_id,
        createdAt: r.created_at.toISOString(),
        file: r.file_id
          ? fileView({
              id: r.file_id,
              name: r.name!,
              mime: r.mime!,
              size: r.size!,
              kind: r.file_kind!,
              width: r.width,
              height: r.height,
              duration_ms: r.duration_ms,
              thumb_key: r.thumb_key,
            })
          : null,
      })),
    };
  });

  /** Every conversation I'm in with one person, general first. */
  app.get('/people/:id/conversations', async (req) => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const { key } = pairKey(auth.userId, id);
    const rows = await ctx.db
      .selectFrom('conversations')
      .select(['id', 'title', 'is_general', 'last_message_at'])
      .where('direct_key', '=', key)
      .orderBy('is_general', 'desc')
      .orderBy('last_message_at', sql`desc nulls last`)
      .execute();
    return {
      conversations: rows.map((r) => ({
        id: r.id,
        title: r.is_general ? 'General' : r.title,
        isGeneral: r.is_general,
        lastMessageAt: r.last_message_at?.toISOString() ?? null,
      })),
    };
  });
}

/** Add a system event and tell everyone in the conversation. */
export async function sendSystem(
  ctx: AppContext,
  conversationId: string,
  actorId: string,
  event: string,
  data: Record<string, unknown>,
) {
  const row = await insertSystemMessage(ctx, conversationId, actorId, event, data);
  const [view] = await messageViews(ctx.db, [row], actorId);
  await ctx.bus.publish(
    (await participantsOf(ctx.db, conversationId)).map((p) => p.user_id),
    { type: 'message.created', data: view },
  );
}
