/**
 * A conversation as someone sees it: whether they're in it (`membership`), the view the app
 * draws (`conversationView`), and a line about it for everyone in it (`sendSystem`). Shared by
 * every route module that touches a conversation; the routes themselves are in `modules/`.
 */
/**
 * Conversations and messages (PRD §15–§22, §26, §56; R14).
 */

import type { ConversationBusinessView, ConversationView } from '@caime/core';
import { PRIVATE_GROUP_MAX, tr } from '@caime/core';
import { sql } from 'kysely';
import type { AppContext } from '../context';

import type { Conversation, Participant } from '../db/schema';
import { businessClosed } from '../lib/blocks';
import { orgRef, threadViews } from '../lib/business';
import { isGroupTopic } from '../lib/conversations';
import { badRequest, notFound } from '../lib/errors';
import { insertSystemMessage, messageViews, participantsOf } from '../lib/messages';
import { personViewsFor } from '../lib/people-batch';
import {
  activeRelationships,
  readReceiptsVisibleTo,
  relationshipView,
  viewerRelation,
} from '../lib/relations';
import { spaceConversationTitle, spaceRefs } from '../lib/spaces';
import { minorOf, personView } from '../lib/users';

export const privateGroupFull = () =>
  badRequest(
    tr(
      'A private group holds up to {PRIVATE_GROUP_MAX} people: each message is sealed for every device in it.',
      { PRIVATE_GROUP_MAX },
    ),
  );

/** Whether the person ever had a seat here, left or not. */
export async function hadSeat(
  ctx: AppContext,
  conversationId: string,
  userId: string,
): Promise<boolean> {
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
  // Everyone else as they show themselves to me, and whose read position I may see (R25): a
  // fixed number of queries for the whole group, not seventeen per member.
  const [views, receiptsVisible, myself] = await Promise.all([
    personViewsFor(
      ctx,
      userId,
      others.map((o) => o.id),
    ),
    meUser ? readReceiptsVisibleTo(ctx.db, now, meUser, others) : new Set<string>(),
    meUser ? viewerRelation(ctx.db, userId, userId) : null,
  ]);
  const participants = members.flatMap((m) => {
    const rel = rels.find((r) => r.subject_id === m.id);
    const person =
      m.id === userId ? (myself ? personView(m, myself, now, null) : null) : views.get(m.id);
    if (!person) return [];
    return [
      {
        userId: m.id,
        role: m.member_role,
        person,
        relationship: rel ? relationshipView(rel) : null,
        readSeq: m.id !== userId && receiptsVisible.has(m.id) ? Number(m.last_read_seq) : null,
        deliveredSeq: Number(m.last_delivered_seq),
        joinedAt: m.member_joined_at.toISOString(),
      },
    ];
  });
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
export const TOPIC_PEOPLE = () =>
  tr('A topic’s people are its group’s: add, remove or make admins there.');

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
