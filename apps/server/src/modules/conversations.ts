/**
 * Conversations and messages (PRD §15–§22, §26, §56; R14).
 */

import type {
  AlbumPhotoView,
  AssetsResponse,
  ConversationBusinessView,
  ConversationView,
  MessagesPage,
  MessageView,
} from '@caime/core';
import {
  applyChecklistOp,
  applySplitOp,
  type CardKitId,
  ChecklistOpBody,
  CreateConversationBody,
  canChangeSpaceRole,
  canPin,
  canRemoveFromSpace,
  canRemoveOthersMessages,
  checklistItems,
  checklistState,
  customMoves,
  customState,
  EditMessageBody,
  ForwardBody,
  formatAmount,
  isCardKit,
  isCustomCard,
  KITS,
  kitMoves,
  kitStateLabel,
  type LiveLocation,
  LiveLocationUpdate,
  type LocationPayloadT,
  liveNow,
  MembersBody,
  PINNED_MAX,
  PollPayload,
  PRIVATE_GROUP_MAX,
  ReactionBody,
  ReceiptsBody,
  SendMessageBody,
  type SpaceRole,
  SpaceRoleBody,
  SplitOpBody,
  splitShares,
  splitState,
  TopicBody,
  tr,
  trn,
  UpdateConversationBody,
  uuidv7,
  VoteBody,
} from '@caime/core';
import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { z } from 'zod';
import type { AppContext } from '../context';

const privateGroupFull = () =>
  badRequest(
    tr(
      'A private group holds up to {PRIVATE_GROUP_MAX} people: each message is sealed for every device in it.',
      { PRIVATE_GROUP_MAX },
    ),
  );

import type { Conversation, Participant } from '../db/schema';
import { dropSaved, tellSaved } from '../lib/automations';
import { assertCanWrite, businessClosed } from '../lib/blocks';
import { customerMask, maskFor, maskId, orgRef, threadViews } from '../lib/business';
import { canEditConversation, contextEditable, contextVisible } from '../lib/contexts';
import {
  ensureDirectConversation,
  handOverGroup,
  isGroupTopic,
  lockConversation,
  mirrorTopics,
  seatIn,
  type TopicChange,
} from '../lib/conversations';
import { assertSealedForEveryone } from '../lib/e2ee';
import { AppError, badRequest, forbidden, notFound } from '../lib/errors';
import { recordEvent } from '../lib/events';
import { leaveGroupCallsIn } from '../lib/group-calls';
import { tellCardApp } from '../lib/kits';
import { afterMentioning, afterMessage } from '../lib/message-effects';
import {
  assertCanMessage,
  assertCanSend,
  fileView,
  insertSystemMessage,
  messageViews,
  notHiddenFor,
  participantsOf,
  sendMessage,
} from '../lib/messages';
import { removeForEveryone } from '../lib/moderation';
import { notify } from '../lib/notify';
import {
  activeRelationships,
  between,
  pairKey,
  readReceiptVisibleTo,
  relationshipView,
  viewerRelation,
} from '../lib/relations';
import { spaceChanged, spaceConversationTitle, spaceRefs } from '../lib/spaces';
import { minorOf, personView } from '../lib/users';
import { parse } from '../lib/validate';
import { requireAuth } from '../plugins/auth';
import { identityShownTo } from './people';
import { createSpaceConversation } from './spaces';

/** Whether the person ever had a seat here, left or not. */
async function hadSeat(ctx: AppContext, conversationId: string, userId: string): Promise<boolean> {
  const row = await ctx.db
    .selectFrom('participants')
    .select('user_id')
    .where('conversation_id', '=', conversationId)
    .where('user_id', '=', userId)
    .executeTakeFirst();
  return Boolean(row);
}

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
  if (!row) throw notFound(tr('That conversation'));
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
      'p.joined_at as member_joined_at',
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
        joinedAt: m.member_joined_at.toISOString(),
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
  // A one-to-one between connections, now: topics start only there (assertCanStartTopic).
  const connected =
    conversation.kind === 'direct' && conversation.connection_id
      ? Boolean(
          await ctx.db
            .selectFrom('connections')
            .select('id')
            .where('id', '=', conversation.connection_id)
            .where('status', '=', 'active')
            .executeTakeFirst(),
        )
      : false;
  // A group's topic goes by the group's name, with its own as the topic (PRD §58).
  const group =
    isGroupTopic(conversation) && conversation.parent_id
      ? await ctx.db
          .selectFrom('conversations')
          .select('title')
          .where('id', '=', conversation.parent_id)
          .executeTakeFirst()
      : undefined;
  // Its topics that the viewer is in, the liveliest first; a topic has none of its own.
  const topics = group
    ? []
    : await ctx.db
        .selectFrom('conversations as c')
        .innerJoin('participants as p', 'p.conversation_id', 'c.id')
        .select(['c.id', 'c.title', 'c.last_message_at'])
        .where('c.parent_id', '=', conversation.id)
        .where('p.user_id', '=', userId)
        .where('p.left_at', 'is', null)
        .orderBy(sql`c.last_message_at desc nulls last`)
        .limit(50)
        .execute();
  let title = space
    ? spaceConversationTitle(space, conversation)
    : conversation.kind === 'direct'
      ? conversation.is_general
        ? (other?.person.displayName ?? 'Deleted account')
        : (conversation.title ?? 'Topic')
      : group
        ? (group.title ?? 'Group')
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
          orgClosed: org.archived_at !== null,
          retentionDays: org.retention_days,
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
          orgClosed: org.archived_at !== null,
          retentionDays: org.retention_days,
        };
      }
    }
  }
  return {
    id: conversation.id,
    kind: conversation.kind,
    title,
    name: conversation.is_general || conversation.kind === 'business' ? null : conversation.title,
    space,
    topic:
      (conversation.kind === 'direct' && !conversation.is_general) || group
        ? conversation.title
        : null,
    connected,
    topics: topics.map((c) => ({
      id: c.id,
      title: c.title ?? 'Topic',
      lastMessageAt: c.last_message_at?.toISOString() ?? null,
    })),
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
    hasMinor: members.some((m) => minorOf(m, now)),
    lastSeq: Number(conversation.last_seq),
    lastMessageAt: conversation.last_message_at?.toISOString() ?? null,
    createdAt: conversation.created_at.toISOString(),
  };
}

/** Why a topic's people aren't changed in it. */
const TOPIC_PEOPLE = () =>
  tr('A topic’s people are its group’s: add, remove or make admins there.');

/**
 * Whether someone may start a topic from a conversation (PRD §58), however they start it (from
 * its details, or by accepting a suggestion): someone who may write there (blocks), from a
 * one-to-one only with someone they're connected with and never a private one, and never with an
 * organization. A few an hour.
 */
export async function assertCanStartTopic(
  ctx: AppContext,
  userId: string,
  conversation: Pick<Conversation, 'id' | 'kind' | 'privacy_class'>,
): Promise<void> {
  await assertCanWrite(ctx, conversation.id, userId);
  if (conversation.kind === 'business')
    throw badRequest(tr('Topics are for conversations between people.'));
  if (conversation.kind === 'direct') {
    // Connected now: a connection removed since leaves the pair's one-to-one, not its topics.
    const other = await ctx.db
      .selectFrom('participants')
      .select('user_id')
      .where('conversation_id', '=', conversation.id)
      .where('user_id', '<>', userId)
      .executeTakeFirst();
    if (!other || !(await between(ctx.db, userId, other.user_id)).connected)
      throw forbidden(tr('Connect first to start topics.'));
    // A private one-to-one keeps to itself: a topic of it would be written in the clear.
    if (conversation.privacy_class === 'private')
      throw badRequest(
        tr('A private conversation keeps to itself: start a topic from your main one.'),
      );
  }
  ctx.limiter.hit(`topic:${userId}`, ctx.config.isTest ? 1000 : 20, 3_600_000);
}

export async function createTopicConversation(
  ctx: AppContext,
  userId: string,
  parentId: string,
  title: string,
  privacy: 'standard' | 'private' = 'standard',
) {
  const { conversation } = await membership(ctx, userId, parentId);
  // In a space, a topic that keeps coming up in General becomes a conversation for everyone.
  if (conversation.space_id && conversation.is_general && privacy === 'standard')
    return createSpaceConversation(ctx, userId, conversation.space_id, { title, everyone: true });
  if (conversation.kind === 'group' && !conversation.space_id)
    return createGroupTopic(ctx, userId, conversation.parent_id ?? conversation.id, title);
  if (conversation.kind !== 'direct' || !conversation.direct_key)
    throw badRequest(tr('Topics branch off a one-to-one, a group, or a space’s General.'));
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
        privacy_class: privacy,
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

/**
 * A group's topic (PRD §58): the group again, on one subject. Its people are the group's, in the
 * roles they have there, and stay so (mirrorTopics); it's as private as the group, and its
 * messages disappear as the group's do. A topic of a topic is one of the group's. The same
 * subject started twice is the one topic.
 */
async function createGroupTopic(
  ctx: AppContext,
  userId: string,
  groupId: string,
  title: string,
): Promise<string> {
  const name = title.trim();
  const made = await ctx.db.transaction().execute(async (trx) => {
    await lockConversation(trx, groupId);
    if (!(await seatIn(trx, groupId, userId))) throw notFound(tr('That conversation'));
    const group = await trx
      .selectFrom('conversations')
      .selectAll()
      .where('id', '=', groupId)
      .executeTakeFirstOrThrow();
    const same = await trx
      .selectFrom('conversations')
      .select('id')
      .where('parent_id', '=', groupId)
      .where('kind', '=', 'group')
      .where(sql`lower(title)`, '=', sql`lower(${name})`)
      .executeTakeFirst();
    if (same) return { id: same.id, group, fresh: false };
    const id = uuidv7();
    await trx
      .insertInto('conversations')
      .values({
        id,
        kind: 'group',
        title: name,
        parent_id: groupId,
        privacy_class: group.privacy_class,
        retention_days: group.retention_days,
        created_by: userId,
      })
      .execute();
    await mirrorTopics(trx, groupId, ctx.now());
    await recordEvent(trx, 'conversation.created', userId, { conversationId: id, kind: 'topic' });
    return { id, group, fresh: true };
  });
  if (!made.fresh) return made.id;
  const by = await ctx.db
    .selectFrom('users')
    .select('display_name')
    .where('id', '=', userId)
    .executeTakeFirstOrThrow();
  await sendSystem(ctx, made.id, userId, 'topic_created', {
    title: made.group.title,
    by: by.display_name,
  });
  await sendSystem(ctx, groupId, userId, 'topic_started', {
    title: name,
    by: by.display_name,
    conversationId: made.id,
  });
  await ctx.bus.publish(
    (await participantsOf(ctx.db, made.id)).map((p) => p.user_id),
    { type: 'conversation.created', data: { conversationId: made.id } },
  );
  // The group lists its topics.
  await ctx.bus.publish(
    (await participantsOf(ctx.db, groupId)).map((p) => p.user_id),
    { type: 'conversation.updated', data: { conversationId: groupId } },
  );
  return made.id;
}

export async function conversationRoutes(app: FastifyInstance, ctx: AppContext) {
  app.post('/conversations', async (req, reply) => {
    const auth = requireAuth(req);
    const body = parse(CreateConversationBody, req.body);
    if (body.kind === 'direct') {
      if (body.userId === auth.userId) throw badRequest(tr('That’s you.'));
      const b = await between(ctx.db, auth.userId, body.userId);
      if (b.blockedByMe || b.blockedMe) throw forbidden(tr('You can’t message this person.'));
      if (body.title || body.private) {
        if (!b.connected)
          throw forbidden(
            body.private
              ? tr('Connect first to start a private conversation.')
              : tr('Connect first to start topics.'),
          );
        const general = await ensureDirectConversation(ctx.db, auth.userId, body.userId, {
          connectionId: b.connectionId,
          createdBy: auth.userId,
        });
        // A private one (R18) is a conversation of its own with them, end to end encrypted: the
        // one already there, unless it's given a name of its own.
        const existing =
          body.private && !body.title
            ? await ctx.db
                .selectFrom('conversations as c')
                .innerJoin('participants as p', 'p.conversation_id', 'c.id')
                .select('c.id')
                .where('c.direct_key', '=', pairKey(auth.userId, body.userId).key)
                .where('c.privacy_class', '=', 'private')
                .where('c.is_general', '=', false)
                .where('c.title', '=', 'Private')
                .where('p.user_id', '=', auth.userId)
                .where('p.left_at', 'is', null)
                .orderBy('c.created_at')
                .executeTakeFirst()
            : undefined;
        if (existing) {
          const m = await membership(ctx, auth.userId, existing.id);
          return { conversation: await conversationView(ctx, auth.userId, m.conversation, m.me) };
        }
        const id = await createTopicConversation(
          ctx,
          auth.userId,
          general.id,
          body.title ?? 'Private',
          body.private ? 'private' : 'standard',
        );
        // Only a context they may change (and so can see): an id alone opens nothing.
        if (body.contextId && (await contextEditable(ctx.db, auth.userId, body.contextId)))
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
    if (body.private && memberIds.length + 1 > PRIVATE_GROUP_MAX) throw privateGroupFull();
    const connected = await ctx.db
      .selectFrom('connection_sides as s')
      .innerJoin('connections as c', 'c.id', 's.connection_id')
      .select('s.other_id')
      .where('s.owner_id', '=', auth.userId)
      .where('s.other_id', 'in', memberIds)
      .where('c.status', '=', 'active')
      .execute();
    if (connected.length !== memberIds.length)
      throw badRequest(tr('You can add people you’re connected with.'));
    const id = uuidv7();
    await ctx.db.transaction().execute(async (trx) => {
      await trx
        .insertInto('conversations')
        .values({
          id,
          kind: 'group',
          title: body.title,
          purpose: body.purpose ?? null,
          privacy_class: body.private ? 'private' : 'standard',
          created_by: auth.userId,
        })
        .execute();
      await trx
        .insertInto('participants')
        // Joined now, on the app's clock: who's been in it longest decides who runs it next.
        .values([
          { conversation_id: id, user_id: auth.userId, role: 'owner', joined_at: ctx.now() },
          ...memberIds.map((u) => ({
            conversation_id: id,
            user_id: u,
            role: 'member' as const,
            joined_at: ctx.now(),
          })),
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

  /** Start a topic (PRD §58): in a one-to-one, a group, or a space's General. */
  app.post('/conversations/:id/topics', async (req, reply) => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const { title } = parse(TopicBody, req.body);
    const { conversation } = await membership(ctx, auth.userId, id);
    await assertCanStartTopic(ctx, auth.userId, conversation);
    const conversationId = await createTopicConversation(ctx, auth.userId, id, title);
    reply.status(201);
    return { conversationId };
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
    // What's being written in a private conversation stays on the device writing it.
    if (body.draft && conversation.privacy_class === 'private')
      throw badRequest(tr('Drafts in a private conversation stay on your device.'));
    const shared: Record<string, unknown> = {};
    if (
      body.title !== undefined ||
      body.purpose !== undefined ||
      body.contextId !== undefined ||
      body.retentionDays !== undefined
    ) {
      if (!canEditConversation(conversation.kind, me.role))
        throw forbidden(tr('Only admins can change this.'));
      // A topic's messages disappear as its group's do: that's changed in the group.
      if (body.retentionDays !== undefined && isGroupTopic(conversation))
        throw badRequest(tr('A topic’s messages disappear as its group’s do: change it there.'));
      // Linked only to a context they may change: an id alone opens nothing, and one they only
      // read (a group's, where they're a member) isn't theirs to take somewhere they'd run it.
      if (body.contextId) {
        if (!(await contextVisible(ctx.db, auth.userId, body.contextId)))
          throw notFound(tr('That context'));
        if (!(await contextEditable(ctx.db, auth.userId, body.contextId)))
          throw forbidden(tr('Only someone who may change that context links it here.'));
      }
      if (body.title !== undefined) {
        if (conversation.kind === 'direct' && conversation.is_general)
          throw badRequest(tr('The general conversation takes the person’s name.'));
        if (conversation.space_id && conversation.is_general)
          throw badRequest(tr('General takes the space’s name. Rename the space instead.'));
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
      // Everyone sees what changed about it, and who changed it.
      if (body.title !== undefined && body.title !== conversation.title)
        await sendSystem(ctx, id, auth.userId, 'renamed', { title: body.title });
      if (body.purpose !== undefined && (body.purpose ?? null) !== (conversation.purpose ?? null))
        await sendSystem(ctx, id, auth.userId, 'purpose_changed', {
          purpose: body.purpose ?? null,
        });
      if (body.retentionDays !== undefined && body.retentionDays !== conversation.retention_days)
        await sendSystem(ctx, id, auth.userId, 'retention_changed', { days: body.retentionDays });
      // A group's topics go as it goes: its disappearing messages are theirs, and each says so.
      if (conversation.kind === 'group' && !conversation.parent_id) {
        const topics = await ctx.db
          .selectFrom('conversations')
          .select(['id', 'retention_days'])
          .where('parent_id', '=', id)
          .where('kind', '=', 'group')
          .execute();
        if (body.retentionDays !== undefined) {
          const days = body.retentionDays;
          const moved = topics.filter((x) => x.retention_days !== days);
          if (moved.length) {
            await ctx.db
              .updateTable('conversations')
              .set({ retention_days: days, updated_at: ctx.now() })
              .where(
                'id',
                'in',
                moved.map((x) => x.id),
              )
              .execute();
            for (const x of moved)
              await sendSystem(ctx, x.id, auth.userId, 'retention_changed', { days });
          }
        }
        // Each topic shows the group's name (and its disappearing messages): theirs changed too.
        if (topics.length && (body.title !== undefined || body.retentionDays !== undefined))
          for (const x of topics)
            await ctx.bus.publish(
              (await participantsOf(ctx.db, x.id)).map((p) => p.user_id),
              { type: 'conversation.updated', data: { conversationId: x.id } },
            );
      }
      // A group lists its topics by name.
      if (body.title !== undefined && isGroupTopic(conversation) && conversation.parent_id)
        await ctx.bus.publish(
          (await participantsOf(ctx.db, conversation.parent_id)).map((p) => p.user_id),
          { type: 'conversation.updated', data: { conversationId: conversation.parent_id } },
        );
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
    if (me.request_state !== 'pending') throw badRequest(tr('There’s no request to answer here.'));
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

  /** A topic's people changed with its group's: everyone in it, and whoever went, sees so. */
  async function tellTopics(changes: TopicChange[]) {
    for (const c of changes)
      await ctx.bus.publish(
        [...c.left, ...(await participantsOf(ctx.db, c.topicId)).map((p) => p.user_id)],
        { type: 'conversation.updated', data: { conversationId: c.topicId } },
      );
  }

  app.post('/conversations/:id/members', async (req) => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const body = parse(MembersBody, req.body);
    const { conversation, me } = await membership(ctx, auth.userId, id);
    if (conversation.kind === 'direct') throw badRequest(tr('Start a group to add people.'));
    if (conversation.kind === 'business')
      throw badRequest(tr('Its team is the organization’s: add people to the team instead.'));
    if (isGroupTopic(conversation)) throw badRequest(TOPIC_PEOPLE());
    if (!['owner', 'admin'].includes(me.role)) throw forbidden(tr('Only admins can add people.'));
    if (conversation.space_id) {
      // A space's conversations hold its people: General all of them, the others who join.
      if (conversation.is_general) throw badRequest(tr('Add people to the space instead.'));
      const inSpace = await ctx.db
        .selectFrom('space_members')
        .select('user_id')
        .where('space_id', '=', conversation.space_id)
        .where('user_id', 'in', body.userIds)
        .where('left_at', 'is', null)
        .execute();
      if (inSpace.length !== new Set(body.userIds).size)
        throw badRequest(tr('Add them to the space first.'));
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
        throw badRequest(tr('You can add people you’re connected with.'));
    }
    const added = await ctx.db.transaction().execute(async (trx) => {
      await lockConversation(trx, id);
      // Who runs it, and who's in it, as they are now.
      const mine = await seatIn(trx, id, auth.userId);
      if (!mine) throw notFound(tr('That conversation'));
      if (!['owner', 'admin'].includes(mine.role))
        throw forbidden(tr('Only admins can add people.'));
      const inIt = new Set((await participantsOf(trx, id)).map((p) => p.user_id));
      const fresh = [...new Set(body.userIds)].filter((u) => !inIt.has(u));
      // Every message in a private group is sealed for each of its people's devices.
      if (conversation.privacy_class === 'private' && inIt.size + fresh.length > PRIVATE_GROUP_MAX)
        throw privateGroupFull();
      const { last_seq } = await trx
        .selectFrom('conversations')
        .select('last_seq')
        .where('id', '=', id)
        .executeTakeFirstOrThrow();
      for (const userId of fresh)
        await trx
          .insertInto('participants')
          .values({
            conversation_id: id,
            user_id: userId,
            role: 'member',
            joined_at: ctx.now(),
            last_read_seq: last_seq,
          })
          // Back in it after leaving, they start again: a member, from now, caught up. Whatever
          // they were before (an admin, the longest there) isn't theirs any more.
          .onConflict((oc) =>
            oc
              .columns(['conversation_id', 'user_id'])
              .doUpdateSet({
                left_at: null,
                role: 'member',
                joined_at: ctx.now(),
                last_read_seq: last_seq,
                last_delivered_seq: last_seq,
              })
              .where('participants.left_at', 'is not', null),
          )
          .execute();
      // Its topics have its people.
      return { fresh, topics: await mirrorTopics(trx, id, ctx.now()) };
    });
    await tellTopics(added.topics);
    if (!added.fresh.length) return { ok: true };
    await sendSystem(ctx, id, auth.userId, 'members_added', { userIds: added.fresh });
    await ctx.bus.publish([...(await participantsOf(ctx.db, id)).map((p) => p.user_id)], {
      type: 'conversation.updated',
      data: { conversationId: id },
    });
    // A space's conversation: the space shows who's in each of its conversations.
    if (conversation.space_id) await spaceChanged(ctx, conversation.space_id);
    return { ok: true };
  });

  app.delete('/conversations/:id/members/:userId', async (req) => {
    const auth = requireAuth(req);
    const { id, userId } = parse(
      z.object({ id: z.string().uuid(), userId: z.string().uuid() }),
      req.params,
    );
    const leaving = userId === auth.userId;
    const found = await membership(ctx, auth.userId, id).catch(async (err: unknown) => {
      // Leaving from two devices at once: the second finds the seat left a moment ago. Done.
      if (
        leaving &&
        err instanceof AppError &&
        err.status === 404 &&
        (await hadSeat(ctx, id, userId))
      )
        return null;
      throw err;
    });
    if (!found) return { ok: true };
    const { conversation } = found;
    if (conversation.kind === 'direct' || conversation.kind === 'business')
      throw badRequest(tr('You can archive this conversation instead.'));
    if (isGroupTopic(conversation))
      throw badRequest(
        leaving
          ? tr('Leave the group to leave its topics. You can archive this one.')
          : TOPIC_PEOPLE(),
      );
    if (conversation.space_id && conversation.is_general)
      throw badRequest(
        userId === auth.userId
          ? tr('Leave the space to leave its General conversation.')
          : tr('Remove them from the space instead.'),
      );
    const done = await ctx.db.transaction().execute(async (trx) => {
      await lockConversation(trx, id);
      // Read under the lock: a role changed, or someone gone, a moment ago counts.
      const me = await seatIn(trx, id, auth.userId);
      // Left already, from another of their devices: that's done.
      if (!me && leaving) return null;
      if (!me) throw notFound(tr('That conversation'));
      const target = leaving ? me : await seatIn(trx, id, userId);
      if (!target) throw notFound(tr('That person in this conversation'));
      // The owner removes anyone; admins remove members; anyone may leave (PRD §56).
      if (!leaving && !canRemoveFromSpace(me.role as SpaceRole, target.role as SpaceRole))
        throw forbidden(
          me.role === 'admin'
            ? tr('Admins remove members; the owner removes admins.')
            : tr('Only admins can remove people.'),
        );
      // Out, they're nobody in it: added again, they start as a member.
      await trx
        .updateTable('participants')
        .set({ left_at: ctx.now(), role: 'member' })
        .where('conversation_id', '=', id)
        .where('user_id', '=', userId)
        .where('left_at', 'is', null)
        .execute();
      // Whoever owned it hands it on as they go, so someone can always run it.
      const heir = target.role === 'owner' ? await handOverGroup(trx, id, userId) : null;
      // Out of the group is out of its topics, and they're run as it is now.
      const topics = await mirrorTopics(trx, id, ctx.now());
      // What Caime offered them about it, and its topics, is gone with them.
      await trx
        .updateTable('suggestions')
        .set({ status: 'expired', resolved_at: ctx.now() })
        .where('user_id', '=', userId)
        .where('conversation_id', 'in', [id, ...topics.map((t) => t.topicId)])
        .where('status', '=', 'pending')
        .execute();
      return { heir, topics };
    });
    if (!done) return { ok: true };
    const { heir, topics } = done;
    // What they saved of it is out of their Saved now, on every device.
    await tellSaved(ctx, [userId]);
    // Out of the conversation is out of its call, and its topics' calls.
    await leaveGroupCallsIn(ctx, userId, [
      id,
      ...topics.filter((t) => t.left.includes(userId)).map((t) => t.topicId),
    ]);
    await tellTopics(topics);
    await sendSystem(
      ctx,
      id,
      auth.userId,
      userId === auth.userId ? 'member_left' : 'member_removed',
      { userId },
    );
    if (heir) await sendSystem(ctx, id, auth.userId, 'owner_changed', { userId: heir });
    await ctx.bus.publish([userId, ...(await participantsOf(ctx.db, id)).map((p) => p.user_id)], {
      type: 'conversation.updated',
      data: { conversationId: id },
    });
    if (conversation.space_id) await spaceChanged(ctx, conversation.space_id);
    return { ok: true };
  });

  /** Make someone in a group an admin, or a member again: its owner does (PRD §56). */
  app.patch('/conversations/:id/members/:userId', async (req) => {
    const auth = requireAuth(req);
    const { id, userId } = parse(
      z.object({ id: z.string().uuid(), userId: z.string().uuid() }),
      req.params,
    );
    const body = parse(SpaceRoleBody, req.body);
    const { conversation } = await membership(ctx, auth.userId, id);
    if (conversation.kind === 'direct' || conversation.kind === 'business')
      throw badRequest(tr('Only a group has admins.'));
    if (isGroupTopic(conversation)) throw badRequest(TOPIC_PEOPLE());
    if (conversation.space_id && conversation.is_general)
      throw badRequest(tr('Make them an admin of the space instead.'));
    const changed = await ctx.db.transaction().execute(async (trx) => {
      await lockConversation(trx, id);
      // Both as they are now: the owner may have just left, or handed it to them.
      const me = await seatIn(trx, id, auth.userId);
      if (!me) throw notFound(tr('That conversation'));
      const target = await seatIn(trx, id, userId);
      if (!target || !['admin', 'member'].includes(target.role))
        throw notFound(tr('That person in this conversation'));
      if (!canChangeSpaceRole(me.role as SpaceRole, target.role as SpaceRole))
        throw forbidden(tr('Only the owner makes admins.'));
      if (target.role === body.role) return false;
      // Only from the role read: never over an owner someone just handed it to.
      const done = await trx
        .updateTable('participants')
        .set({ role: body.role })
        .where('conversation_id', '=', id)
        .where('user_id', '=', userId)
        .where('left_at', 'is', null)
        .where('role', '=', target.role)
        .executeTakeFirst();
      if (Number(done.numUpdatedRows) === 0) return null;
      // Its topics are run by the same people.
      return mirrorTopics(trx, id, ctx.now());
    });
    if (!changed) return { ok: true };
    await tellTopics(changed);
    await sendSystem(
      ctx,
      id,
      auth.userId,
      body.role === 'admin' ? 'admin_added' : 'admin_removed',
      { userId },
    );
    await ctx.bus.publish(
      (await participantsOf(ctx.db, id)).map((p) => p.user_id),
      {
        type: 'conversation.updated',
        data: { conversationId: id },
      },
    );
    return { ok: true };
  });

  app.post('/conversations/:id/receipts', async (req) => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const body = parse(ReceiptsBody, req.body);
    // A device that hasn't heard yet that its person left (or was removed) may still say what
    // arrived: that's nothing to do now, and nothing to refuse. Anyone never in it is refused.
    const gone = await ctx.db
      .selectFrom('participants')
      .select('left_at')
      .where('conversation_id', '=', id)
      .where('user_id', '=', auth.userId)
      .where('left_at', 'is not', null)
      .executeTakeFirst();
    if (gone) return { ok: true };
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
    // Needs you got it wrong for them (PRD §83): counted, never who or where.
    await recordEvent(ctx.db, 'attention.dismissed', null, {});
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
    const result = await sendMessage(ctx, auth.userId, id, body, {
      sentVia: auth.grant?.name ?? null,
      app: auth.app ?? null,
    });
    const [view] = await messageViews(ctx.db, [result.message], auth.userId);
    if (result.created) {
      reply.status(201);
      // One of an app's cards, sent by someone on the team: the app hears of it (PRD §74).
      if (result.message.kind === 'kit' && isCustomCard(result.message.payload)) {
        const mask = await customerMask(ctx.db, id);
        if (mask) await tellCardApp(ctx, result.message, mask, auth.userId, 'kit.posted');
      }
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
    if (!m) throw notFound(tr('That message'));
    await membership(ctx, auth.userId, m.conversation_id);
    if (m.sender_id !== auth.userId) throw forbidden(tr('You can only edit your own messages.'));
    await assertCanWrite(ctx, m.conversation_id, auth.userId);
    if (m.deleted_at) throw badRequest(tr('That message was deleted.'));
    if (body.body !== undefined && m.kind !== 'text')
      throw badRequest(tr('Only text messages can be edited.'));
    // A private one is edited by sealing it again, as the next edit of the same message.
    if (m.sealed) {
      const was = m.sealed as { edit?: number };
      if (!body.sealed || body.body !== undefined || body.mentions?.length)
        throw badRequest(tr('Messages in a private conversation are text, sealed on your device.'));
      if (body.sealed.cid !== m.client_id || body.sealed.edit <= (was.edit ?? 0))
        throw badRequest(tr('That message isn’t sealed properly.'));
      await assertSealedForEveryone(ctx, m.conversation_id, auth.userId, body.sealed);
    } else if (body.sealed)
      throw badRequest(tr('Only private conversations take sealed messages.'));
    // Who it mentions is who its words now name (PRD §20): people in it, other than its sender.
    const members = new Set(
      (await participantsOf(ctx.db, m.conversation_id)).map((p) => p.user_id),
    );
    const mentions =
      body.mentions === undefined
        ? undefined
        : [...new Set(body.mentions)].filter((u) => members.has(u) && u !== auth.userId);
    const updated = await ctx.db
      .updateTable('messages')
      .set({
        ...(body.body !== undefined ? { body: body.body, edited_at: ctx.now() } : {}),
        ...(body.sealed ? { sealed: JSON.stringify(body.sealed), edited_at: ctx.now() } : {}),
        ...(body.mode !== undefined ? { mode: body.mode, mode_source: 'user' } : {}),
        ...(mentions ? { mentions } : {}),
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    // Someone it names now who it didn't before is told, as they would be of a new message.
    const added = mentions?.filter((u) => !m.mentions.includes(u)) ?? [];
    if (added.length) ctx.defer('after-message', () => afterMentioning(ctx, updated, added));
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
    if (!m) throw notFound(tr('That message'));
    await membership(ctx, auth.userId, m.conversation_id);
    await assertCanWrite(ctx, m.conversation_id, auth.userId);
    const card = (m.payload ?? {}) as {
      kit?: unknown;
      state?: string;
      title?: string;
      history?: Array<{ state: string; by: string; at: string }>;
    };
    const own = isCustomCard(m.payload) ? m.payload : null;
    if (m.kind !== 'kit' || m.deleted_at || !(own || isCardKit(card.kit)))
      throw badRequest(tr('That isn’t a card that can change.'));
    // An app moves only its own cards: those of its kits, and Caime's own its bot sent.
    if (auth.app && !(own ? own.app.id === auth.app.id : m.sender_id === auth.userId))
      throw forbidden(tr('An app moves only its own cards.'));
    const from = card.state ?? '';
    // In a business conversation the team is one side: anyone on it acts for a card it sent.
    const business = await customerMask(ctx.db, m.conversation_id);
    const onTeam = (userId: string | null) => Boolean(business && userId !== business.customerId);
    const senderSide = m.sender_id === auth.userId || (onTeam(m.sender_id) && onTeam(auth.userId));
    // An organization's own card says who moves it: the organization (its team and its apps),
    // its customer, or either.
    const move = own
      ? business
        ? customMoves(own, onTeam(auth.userId)).find((x) => x.to === to)
        : undefined
      : isCardKit(card.kit)
        ? kitMoves(card.kit, from, senderSide).find((x) => x.to === to)
        : undefined;
    if (!move) throw forbidden(tr('You can’t make that change to this card.'));
    // Each move tells the other side: one person, or one app, moves a conversation's cards only
    // so often.
    ctx.limiter.hit(
      `kit-move:${auth.userId}:${m.conversation_id}`,
      ctx.config.isTest ? 10_000 : 10,
      60_000,
    );
    // Only if nobody moved it first, and only where it stands (merged into the card, so an app's
    // change to its fields at the same moment is kept): its row is locked while its history is
    // added to, from the row as it is, the last 50 moves kept.
    const updated = await ctx.db.transaction().execute(async (trx) => {
      const row = await trx
        .selectFrom('messages')
        .select(['deleted_at', 'payload'])
        .where('id', '=', id)
        .forUpdate()
        .executeTakeFirst();
      const now = (row?.payload ?? {}) as typeof card;
      if (!row || row.deleted_at || now.state !== from) return null;
      const history = [...(now.history ?? []), { state: to, by: auth.userId, at: ctx.now() }];
      return trx
        .updateTable('messages')
        .set({
          payload: sql`payload || ${JSON.stringify({ state: to, history: history.slice(-50) })}::jsonb`,
        })
        .where('id', '=', id)
        .returningAll()
        .executeTakeFirstOrThrow();
    });
    if (!updated) throw new AppError(409, 'conflict', tr('Someone just changed this card.'));
    const members = (await participantsOf(ctx.db, m.conversation_id)).map((p) => p.user_id);
    const [view] = await messageViews(ctx.db, [updated], auth.userId);
    await recordEvent(ctx.db, 'kit.moved', auth.userId, { messageId: id, kit: card.kit, to });
    await ctx.bus.publish(members, { type: 'message.updated', data: { ...view, clientId: null } });
    // The card's app hears who moved it, unless it did (PRD §74).
    if (business) await tellCardApp(ctx, updated, business, auth.userId, 'kit.moved', { from, to });
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
        title: () =>
          `${business && !onTeam(userId) ? business.orgName : mover.display_name}: ${own ? customState({ ...own, state: to }).label : tr(kitStateLabel(to))}`,
        body: () =>
          `${own ? own.label : tr(KITS[card.kit as CardKitId].name)} · ${card.title ?? ''}`,
        // A card's moves are one notification, its latest.
        groupKey: `kit:${id}`,
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
    if (!found) throw notFound(tr('That message'));
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
        throw badRequest(tr('That isn’t a live location.'));
      if (m.sender_id !== userId) throw forbidden(tr('Only whoever is sharing it can change it.'));
      const at = ctx.now();
      if (!liveNow(card.live, at))
        throw new AppError(409, 'location_ended', tr('This live location has ended.'));
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
    if (!found) throw notFound(tr('That message'));
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
        throw badRequest(tr('That isn’t a checklist.'));
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
        title: () =>
          card.title
            ? tr('{name} finished {title}', { name: who.display_name, title: card.title })
            : tr('{name} finished the list', { name: who.display_name }),
        body: () => tr('Everything on it is ticked.'),
        data: { conversationId: found.conversation_id, messageId: id },
      });
    }
    return { message: view };
  });

  /**
   * A split card (R38): who owes whom for something one person paid, an equal share each. The
   * person who owes a share, or whoever paid, marks it settled between them; Caime moves nothing.
   * Changes are applied one at a time (the card's row is locked), as a checklist's are.
   */
  app.post('/messages/:id/split', async (req) => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const op = parse(SplitOpBody, req.body);
    const found = await ctx.db
      .selectFrom('messages')
      .select('conversation_id')
      .where('id', '=', id)
      .executeTakeFirst();
    if (!found) throw notFound(tr('That message'));
    await membership(ctx, auth.userId, found.conversation_id);
    await assertCanWrite(ctx, found.conversation_id, auth.userId);
    const at = ctx.now().toISOString();
    const { updated, changed, payer, title, amount } = await ctx.db
      .transaction()
      .execute(async (trx) => {
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
        if (m.kind !== 'kit' || m.deleted_at || card.kit !== 'split')
          throw badRequest(tr('That isn’t a split.'));
        const before = splitShares(card.fields ?? {});
        const applied = applySplitOp(before, op, {
          userId: auth.userId,
          isCreator: m.sender_id === auth.userId,
          at,
        });
        if (!applied.ok)
          throw applied.forbidden ? forbidden(applied.error) : badRequest(applied.error);
        if (applied.shares === before)
          return {
            updated: m,
            changed: false,
            payer: m.sender_id,
            title: card.title,
            amount: null,
          };
        const updated = await trx
          .updateTable('messages')
          .set({
            payload: JSON.stringify({
              ...card,
              fields: { ...card.fields, shares: applied.shares },
              state: splitState(applied.shares),
            }),
          })
          .where('id', '=', id)
          .returningAll()
          .executeTakeFirstOrThrow();
        return {
          updated,
          changed: true,
          payer: m.sender_id,
          title: card.title,
          amount: before.find((s) => s.userId === op.userId)?.amount ?? null,
        };
      });
    const [view] = await messageViews(ctx.db, [updated], auth.userId);
    if (!changed) return { message: view };
    const members = (await participantsOf(ctx.db, found.conversation_id)).map((p) => p.user_id);
    await ctx.bus.publish(members, { type: 'message.updated', data: { ...view, clientId: null } });
    // Someone saying they've settled up is news for whoever paid; the payer's own marks aren't.
    if (op.op === 'settle' && payer && payer !== auth.userId) {
      const people = await ctx.db
        .selectFrom('users')
        .select(['id', 'display_name', 'locale'])
        .where('id', 'in', [auth.userId, payer])
        .execute();
      const who = people.find((u) => u.id === auth.userId);
      const locale = people.find((u) => u.id === payer)?.locale ?? 'en';
      const currency = ((updated.payload as { fields?: { amount?: { currency?: string | null } } })
        .fields?.amount?.currency ?? null) as string | null;
      await notify(ctx, {
        userId: payer,
        kind: 'kit',
        level: 'activity',
        title: () => tr('{name} settled up', { name: who?.display_name ?? tr('Someone') }),
        body: () =>
          amount !== null
            ? tr('{amount} of {title}.', {
                amount: formatAmount(amount, currency, locale),
                title: title ?? tr('the split'),
              })
            : tr('Their share of {title}.', { title: title ?? tr('the split') }),
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
    if (!m) throw notFound(tr('That album'));
    await membership(ctx, userId, m.conversation_id);
    const card = (m.payload ?? {}) as { kit?: unknown; state?: string; title?: string };
    if (m.kind !== 'kit' || m.deleted_at || card.kit !== 'shared_album')
      throw notFound(tr('That album'));
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
    if (card.state === 'closed') throw badRequest(tr('This album is closed.'));
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
      throw badRequest(tr('Add photos you’ve uploaded.'));
    if (files.some((f) => f.kind !== 'image' && f.kind !== 'video'))
      throw badRequest(tr('Albums take photos and videos.'));
    const { n } = await ctx.db
      .selectFrom('album_photos')
      .select(sql<number>`count(*)::int`.as('n'))
      .where('message_id', '=', id)
      .executeTakeFirstOrThrow();
    if (n + files.length > ALBUM_MAX)
      throw badRequest(tr('An album holds {ALBUM_MAX} photos.', { ALBUM_MAX }));
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
          title: () =>
            trn(added, '{name} added a photo to {album}', '{name} added {n} photos to {album}', {
              name: who.display_name,
              album: card.title ?? tr('the album'),
            }),
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
    if (!photo) throw notFound(tr('That photo'));
    // Whoever added it, or whoever made the album, takes it out.
    if (photo.added_by !== auth.userId && m.sender_id !== auth.userId)
      throw forbidden(tr('Only whoever added it, or made the album, can take it out.'));
    const savers = await ctx.db.transaction().execute(async (trx) => {
      await trx
        .deleteFrom('album_photos')
        .where('message_id', '=', id)
        .where('file_id', '=', fileId)
        .execute();
      // What anyone saved of it goes with it, and their lists say so.
      const saved = await trx
        .deleteFrom('saved_items')
        .where(
          'asset_id',
          'in',
          trx
            .selectFrom('assets')
            .select('id')
            .where('message_id', '=', id)
            .where('file_id', '=', fileId),
        )
        .returning('user_id')
        .execute();
      await trx
        .deleteFrom('assets')
        .where('message_id', '=', id)
        .where('file_id', '=', fileId)
        .execute();
      return [...new Set(saved.map((r) => r.user_id))];
    });
    await tellSaved(ctx, savers);
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
    if (!m) throw notFound(tr('That message'));
    const { conversation, me } = await membership(ctx, auth.userId, m.conversation_id);
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
      // Gone from their view, it's gone from what they saved too.
      await tellSaved(ctx, await dropSaved(ctx.db, [id], auth.userId));
      // Pinned, it leaves the top of their view too (it stays pinned for everyone else).
      if (m.pinned_at)
        await ctx.bus.publish([auth.userId], {
          type: 'pins.changed',
          data: { conversationId: m.conversation_id },
        });
      return { ok: true };
    }
    // A line about the conversation (who joined, who changed what) is its record, for everyone.
    if (m.kind === 'system')
      throw badRequest(tr('Lines about the conversation stay. You can delete it for yourself.'));
    if (m.sender_id !== auth.userId && !canRemoveOthersMessages(conversation.kind, me.role))
      throw forbidden(tr('You can delete your own messages.'));
    await removeForEveryone(ctx, m, auth.userId);
    return { ok: true };
  });

  // --- Pinned messages (PRD §22, §56) ------------------------------------------------------

  /** What a conversation keeps at its top, newest pin first. */
  app.get('/conversations/:id/pins', async (req): Promise<{ messages: MessageView[] }> => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    await membership(ctx, auth.userId, id);
    const rows = await ctx.db
      .selectFrom('messages')
      .selectAll()
      .where('conversation_id', '=', id)
      .where('pinned_at', 'is not', null)
      .where('deleted_at', 'is', null)
      // One they deleted for themselves stays out of their sight here too.
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
      )
      .orderBy('pinned_at', 'desc')
      .limit(PINNED_MAX)
      .execute();
    return { messages: await messageViews(ctx.db, rows, auth.userId) };
  });

  /** Everyone in it sees the message marked (or not) and what's at the top change. */
  async function tellPinned(actorId: string, messageId: string, conversationId: string) {
    const row = await ctx.db
      .selectFrom('messages')
      .selectAll()
      .where('id', '=', messageId)
      .executeTakeFirstOrThrow();
    const [view] = await messageViews(ctx.db, [row], actorId);
    const members = (await participantsOf(ctx.db, conversationId)).map((p) => p.user_id);
    await ctx.bus.publish(members, { type: 'message.updated', data: { ...view!, clientId: null } });
    await ctx.bus.publish(members, { type: 'pins.changed', data: { conversationId } });
  }

  /** Pinning or unpinning: whoever may change the conversation (core pins.ts), one at a time. */
  async function pinnable(userId: string, messageId: string) {
    const m = await ctx.db
      .selectFrom('messages')
      .selectAll()
      .where('id', '=', messageId)
      .executeTakeFirst();
    if (!m || m.deleted_at) throw notFound(tr('That message'));
    const { conversation, me } = await membership(ctx, userId, m.conversation_id);
    if (conversation.kind === 'business')
      throw badRequest(tr('Pinned messages are for conversations between people.'));
    if (!canPin(conversation.kind, me.role))
      throw forbidden(tr('Only the group’s owner and admins pin messages.'));
    // Either way it changes what everyone sees at the top, and pinning says so in a line: only
    // from someone who may write there (blocks), and not while a message request is unanswered,
    // which allows one message and nothing more (R14).
    await assertCanWrite(ctx, m.conversation_id, userId);
    const waiting = await ctx.db
      .selectFrom('participants')
      .select('user_id')
      .where('conversation_id', '=', m.conversation_id)
      .where('left_at', 'is', null)
      .where('request_state', 'in', ['pending', 'declined'])
      .executeTakeFirst();
    if (waiting)
      throw new AppError(
        403,
        'awaiting_acceptance',
        tr('Messages are pinned once the message request is answered.'),
      );
    ctx.limiter.hit(`pin:${userId}`, ctx.config.isTest ? 1000 : 30, 60_000);
    return m;
  }

  app.post('/messages/:id/pin', async (req) => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const m = await pinnable(auth.userId, id);
    if (m.kind === 'system') throw badRequest(tr('Lines about the conversation aren’t pinned.'));
    if (m.pinned_at) return { ok: true };
    const pinned = await ctx.db.transaction().execute(async (trx) => {
      await lockConversation(trx, m.conversation_id);
      // The top is the conversation's, so all its pins count, even one they deleted for
      // themselves (it's still at the top for the others), and the refusal says so.
      const { n, hidden } = await trx
        .selectFrom('messages')
        .select([
          sql<number>`count(*)::int`.as('n'),
          sql<number>`(count(*) filter (where not ${notHiddenFor(auth.userId, 'messages.id')}))::int`.as(
            'hidden',
          ),
        ])
        .where('conversation_id', '=', m.conversation_id)
        .where('pinned_at', 'is not', null)
        .where('deleted_at', 'is', null)
        .executeTakeFirstOrThrow();
      if (n >= PINNED_MAX)
        throw badRequest(
          hidden
            ? trn(
                hidden,
                '{PINNED_MAX} messages are pinned already, including one you deleted for yourself. Unpin one first.',
                '{PINNED_MAX} messages are pinned already, including {n} you deleted for yourself. Unpin one first.',
                { PINNED_MAX },
              )
            : tr('{PINNED_MAX} messages are pinned already. Unpin one first.', { PINNED_MAX }),
        );
      const done = await trx
        .updateTable('messages')
        .set({ pinned_at: ctx.now(), pinned_by: auth.userId })
        .where('id', '=', id)
        .where('pinned_at', 'is', null)
        .where('deleted_at', 'is', null)
        .executeTakeFirst();
      return Number(done.numUpdatedRows) > 0;
    });
    if (!pinned) return { ok: true };
    await sendSystem(ctx, m.conversation_id, auth.userId, 'message_pinned', { messageId: id });
    await tellPinned(auth.userId, id, m.conversation_id);
    return { ok: true };
  });

  app.delete('/messages/:id/pin', async (req) => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const m = await pinnable(auth.userId, id);
    const done = await ctx.db
      .updateTable('messages')
      .set({ pinned_at: null, pinned_by: null })
      .where('id', '=', id)
      .where('pinned_at', 'is not', null)
      .executeTakeFirst();
    if (Number(done.numUpdatedRows) > 0) await tellPinned(auth.userId, id, m.conversation_id);
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
    if (!m || m.deleted_at) throw notFound(tr('That message'));
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
    if (!m) throw notFound(tr('That message'));
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
    if (m?.kind !== 'poll' || m.deleted_at) throw notFound(tr('That poll'));
    await membership(ctx, auth.userId, m.conversation_id);
    await assertCanWrite(ctx, m.conversation_id, auth.userId);
    const poll = PollPayload.parse(m.payload);
    const valid = new Set(poll.options.map((o) => o.id));
    if (optionIds.some((o) => !valid.has(o)))
      throw badRequest(tr('That option isn’t in the poll.'));
    if (!poll.multiple && optionIds.length > 1) throw badRequest(tr('Choose one option.'));
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
    if (!m || m.deleted_at) throw notFound(tr('That message'));
    await membership(ctx, auth.userId, m.conversation_id);
    // Its words are only on the devices it was sealed for, and stay in the private conversation.
    if (m.sealed) throw badRequest(tr('Messages in a private conversation stay in it.'));
    // A copy of a card, a poll or a live location isn't the same thing: they stay where they were
    // shared (their state, votes and whereabouts are theirs), and so do lines about a conversation.
    const live = m.kind === 'location' && Boolean((m.payload as { live?: unknown } | null)?.live);
    if (m.kind === 'system' || m.kind === 'kit' || m.kind === 'poll' || live)
      throw badRequest(tr('Cards, polls and live locations stay where they were shared.'));
    const kind = m.kind;
    const files = await ctx.db
      .selectFrom('message_files')
      .select('file_id')
      .where('message_id', '=', id)
      .orderBy('position')
      .execute();
    // One copy for each, known by where it goes: sent again after an answer that never came, or
    // with another conversation added, each still arrives once.
    const copy = (conversationId: string) => ({
      clientId: `${body.clientId}:${conversationId}`,
      kind,
      body: m.body,
      payload: m.payload,
      fileIds: files.map((f) => f.file_id),
    });
    // Every one checked first, with all that sending there would check (blocks, a message request
    // not yet answered, an organization that has closed), so it goes to all of them or to none.
    const targets = [...new Set(body.conversationIds)];
    for (const conversationId of targets) {
      const { conversation } = await membership(ctx, auth.userId, conversationId);
      if (conversation.privacy_class === 'private')
        throw badRequest(tr('Nothing is forwarded into a private conversation.'));
      await assertCanWrite(ctx, conversationId, auth.userId);
      await assertCanSend(ctx, auth.userId, conversationId, copy(conversationId), {
        forwardedFromId: id,
      });
    }
    // Each copy is a message sent, and counts as one.
    for (const _ of targets)
      ctx.limiter.hit(`send:${auth.userId}`, ctx.config.isTest ? 10_000 : 120, 60_000);
    const out: string[] = [];
    for (const conversationId of targets) {
      const result = await sendMessage(ctx, auth.userId, conversationId, copy(conversationId), {
        forwardedFromId: id,
      });
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
  app.get('/conversations/:id/assets', async (req): Promise<AssetsResponse> => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const { kind, before, limit } = parse(
      z.object({
        // One kind, or several: kind=photo,video.
        kind: z
          .string()
          .transform((s) => s.split(','))
          .pipe(
            z
              .array(z.enum(['photo', 'video', 'document', 'audio', 'link', 'location', 'contact']))
              .min(1),
          )
          .optional(),
        // Newest first; the next page starts after the last one shown.
        before: z.string().uuid().optional(),
        limit: z.coerce.number().int().min(1).max(200).default(60),
      }),
      req.query,
    );
    await membership(ctx, auth.userId, id);
    const shown = notHiddenFor(auth.userId, 'assets.message_id');
    const rows = await ctx.db
      .selectFrom('assets')
      .leftJoin('files as f', 'f.id', 'assets.file_id')
      .leftJoin('messages as m', 'm.id', 'assets.message_id')
      .select([
        'm.seq as message_seq',
        'assets.id',
        'assets.kind',
        'assets.url',
        'assets.title',
        'assets.host',
        'assets.message_id',
        'assets.sender_id',
        'assets.created_at',
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
      .where('assets.conversation_id', '=', id)
      .where(shown)
      .$if(Boolean(kind), (qb) => qb.where('assets.kind', 'in', kind!))
      .$if(Boolean(before), (qb) => qb.where('assets.id', '<', before!))
      .orderBy('assets.id', 'desc')
      .limit(limit + 1)
      .execute();
    const page = rows.slice(0, limit);
    const counts = await ctx.db
      .selectFrom('assets')
      .select(['kind', sql<number>`count(*)::int`.as('n')])
      .where('conversation_id', '=', id)
      .where(shown)
      .groupBy('kind')
      .execute();
    const mask = await maskFor(ctx.db, id, auth.userId);
    return {
      counts: Object.fromEntries(counts.map((c) => [c.kind, c.n])),
      nextBefore: rows.length > limit ? (page.at(-1)?.id ?? null) : null,
      assets: page.map((r) => ({
        id: r.id,
        kind: r.kind,
        url: r.url,
        title: r.title,
        host: r.host,
        messageId: r.message_id,
        messageSeq: r.message_seq === null ? null : Number(r.message_seq),
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
