/**
 * The Attention inbox (PRD §19–§20, §63; PRODUCT-REVIEW R7, R8). Gathers every signal for every
 * conversation in a fixed number of queries, then runs the same attention engine the clients run.
 */

import type { InboxAllResponse, InboxItemView, InboxResponse, OrgRef, Sphere } from '@caime/core';
import {
  type AttentionInput,
  attentionHeadline,
  classifyAttention,
  currentPriority,
  resolvePolicy,
  SECTION_LABELS,
  systemText,
} from '@caime/core';
import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { z } from 'zod';
import type { AppContext } from '../context';
import { maskPayload, orgRef } from '../lib/business';
import { overdueAtSql } from '../lib/due';
import { messagePreview } from '../lib/messages';
import { personViewsFor } from '../lib/people-batch';
import {
  activeRelationships,
  loadPolicies,
  policyTargetFor,
  relationshipView,
} from '../lib/relations';
import { spaceConversationTitle, spaceRefs } from '../lib/spaces';
import { parse } from '../lib/validate';
import { requireAuth } from '../plugins/auth';

export async function buildInbox(
  ctx: AppContext,
  userId: string,
): Promise<InboxResponse & { conversations: InboxItemView[] }> {
  const now = ctx.now();
  const me = await ctx.db
    .selectFrom('users')
    .select(['time_zone'])
    .where('id', '=', userId)
    .executeTakeFirstOrThrow();

  const rows = await ctx.db
    .selectFrom('participants as p')
    .innerJoin('conversations as c', 'c.id', 'p.conversation_id')
    .select([
      'c.id',
      'c.kind',
      'c.title',
      'c.is_general',
      'c.parent_id',
      'c.connection_id',
      'c.direct_key',
      'c.last_seq',
      'c.last_message_at',
      'c.created_at',
      'c.privacy_class',
      'c.space_id',
      // A group's topic goes by its group's name, with its own as the topic (PRD §58).
      sql<
        string | null
      >`(select g.title from conversations g where g.id = c.parent_id and c.kind = 'group')`.as(
        'group_title',
      ),
      'p.last_read_seq',
      'p.attention',
      'p.muted_until',
      'p.archived_at',
      'p.pinned_at',
      'p.request_state',
      'p.dismissed_seq',
      'p.draft',
      sql<number>`(select count(*)::int from messages m where m.conversation_id = c.id and m.seq > p.last_read_seq
        and m.sender_id is distinct from ${userId} and m.deleted_at is null and m.kind <> 'system')`.as(
        'unread',
      ),
      sql<number>`(select count(*)::int from messages m where m.conversation_id = c.id and m.seq > p.last_read_seq
        and ${userId}::uuid = any(m.mentions) and m.deleted_at is null)`.as('unread_mentions'),
      sql<
        string | null
      >`(select max(m.seq)::text from messages m where m.conversation_id = c.id and m.sender_id = ${userId})`.as(
        'my_last_seq',
      ),
      sql<number>`(select count(*)::int from participants x where x.conversation_id = c.id and x.left_at is null)`.as(
        'member_count',
      ),
      sql<
        string | null
      >`(select x.user_id::text from participants x where x.conversation_id = c.id and x.user_id <> ${userId} and x.left_at is null limit 1)`.as(
        'other_id',
      ),
      sql<
        string | null
      >`(select x.request_state from participants x where x.conversation_id = c.id and x.user_id <> ${userId} limit 1)`.as(
        'other_request_state',
      ),
    ])
    .where('p.user_id', '=', userId)
    .where('p.left_at', 'is', null)
    // An organization's conversations are in its Business inbox, not its team's own (PRD §38).
    .where('p.role', '<>', 'agent')
    .execute();

  const ids = rows.map((r) => r.id);
  if (ids.length === 0) {
    return {
      sections: [],
      counts: {},
      headline: attentionHeadline({}),
      conversations: [] as never[],
    };
  }

  const [lastMessages, pending, tasks, waitingByPerson] = await Promise.all([
    ctx.db
      .selectFrom('messages as m')
      .selectAll('m')
      .where(
        sql<boolean>`(m.conversation_id, m.seq) in (select conversation_id, max(seq) from messages where conversation_id in (${sql.join(ids)}) group by conversation_id)`,
      )
      .execute(),
    // The latest message from someone else after my last one, that asks me something.
    ctx.db
      .selectFrom('messages as m')
      .innerJoin('participants as p', (j) =>
        j.onRef('p.conversation_id', '=', 'm.conversation_id').on('p.user_id', '=', userId),
      )
      .innerJoin('conversations as c', 'c.id', 'm.conversation_id')
      .select([
        'm.conversation_id',
        'm.seq',
        'm.is_question',
        'm.is_request',
        'm.created_at',
        'm.mentions',
        'm.reply_to_id',
        'c.kind',
        'p.dismissed_seq',
      ])
      .where('m.conversation_id', 'in', ids)
      .where('m.sender_id', 'is not', null)
      .where('m.sender_id', '<>', userId)
      .where('m.deleted_at', 'is', null)
      .where((eb) => eb.or([eb('m.is_question', '=', true), eb('m.is_request', '=', true)]))
      .where(
        sql<boolean>`m.seq > coalesce((select max(x.seq) from messages x where x.conversation_id = m.conversation_id and x.sender_id = ${userId}), 0)`,
      )
      .orderBy('m.seq', 'desc')
      .execute(),
    ctx.db
      .selectFrom('tasks')
      .select([
        'conversation_id',
        sql<number>`count(*) filter (where assignee_id = ${userId} and owner_id <> ${userId} and shared and status in ('open','accepted'))::int`.as(
          'requests_to_me',
        ),
        sql<number>`count(*) filter (where assignee_id = ${userId} and status in ('open','accepted') and ${overdueAtSql} < ${now})::int`.as(
          'overdue',
        ),
        sql<number>`count(*) filter (where assignee_id = ${userId} and status in ('open','accepted') and ${overdueAtSql} >= ${now} and due_at < ${new Date(now.getTime() + 86_400_000)})::int`.as(
          'due_soon',
        ),
      ])
      .where('conversation_id', 'in', ids)
      .where((eb) => eb.or([eb('assignee_id', '=', userId), eb('owner_id', '=', userId)]))
      .groupBy('conversation_id')
      .execute(),
    ctx.db
      .selectFrom('tasks')
      .select(['assignee_id', sql<number>`count(*)::int`.as('n')])
      .where('owner_id', '=', userId)
      .where('assignee_id', '<>', userId)
      .where('status', 'in', ['open', 'accepted'])
      .groupBy('assignee_id')
      .execute(),
  ]);

  const directOthers = rows
    .filter((r) => r.kind === 'direct' && r.other_id)
    .map((r) => r.other_id!);
  const [people, rels, policies, mySentReplies] = await Promise.all([
    personViewsFor(ctx, userId, directOthers),
    activeRelationships(ctx.db, userId, directOthers),
    loadPolicies(ctx.db, userId),
    ctx.db
      .selectFrom('messages')
      .select('id')
      .where('conversation_id', 'in', ids)
      .where('sender_id', '=', userId)
      .execute(),
  ]);
  const myMessageIds = new Set(mySentReplies.map((m) => m.id));
  // A customer's conversations with organizations: the organization is who they talk to (R15).
  const businessIds = rows.filter((r) => r.kind === 'business').map((r) => r.id);
  const orgs = new Map<string, OrgRef>();
  if (businessIds.length)
    for (const o of await ctx.db
      .selectFrom('business_threads as t')
      .innerJoin('organizations as g', 'g.id', 't.org_id')
      .select([
        't.conversation_id',
        'g.id',
        'g.name',
        'g.handle',
        'g.kind',
        'g.domain',
        'g.verified_at',
        'g.country',
      ])
      .where('t.conversation_id', 'in', businessIds)
      .execute())
      orgs.set(o.conversation_id, orgRef(o));
  const spaces = await spaceRefs(
    ctx.db,
    rows.map((r) => r.space_id),
  );

  const conversations = rows.map((r): InboxItemView => {
    const last = lastMessages.find((m) => m.conversation_id === r.id);
    const t = tasks.find((x) => x.conversation_id === r.id);
    const other = r.other_id && r.kind === 'direct' ? people.get(r.other_id) : undefined;
    const rel =
      r.kind === 'direct' && r.other_id ? rels.find((x) => x.subject_id === r.other_id) : undefined;
    const policy = resolvePolicy(policies, policyTargetFor(rel, r.connection_id));
    const inbound = pending.find(
      (m) =>
        m.conversation_id === r.id &&
        (m.kind === 'direct' ||
          m.kind === 'business' ||
          m.mentions.includes(userId) ||
          (m.reply_to_id !== null && myMessageIds.has(m.reply_to_id))),
    );
    const myLast = r.my_last_seq ? Number(r.my_last_seq) : 0;
    const lastIsMine = last !== undefined && last.sender_id === userId && last.kind !== 'system';
    const awaitingReply =
      lastIsMine && (last.is_question || last.is_request)
        ? { at: last.created_at.toISOString() }
        : null;
    const followUpDue = Boolean(
      awaitingReply &&
        policy.followUpHours &&
        now.getTime() - last!.created_at.getTime() > policy.followUpHours * 3_600_000,
    );
    const waitingOnThem =
      r.kind === 'direct' && r.is_general && r.other_id
        ? (waitingByPerson.find((w) => w.assignee_id === r.other_id)?.n ?? 0)
        : 0;
    const input: AttentionInput = {
      archived: r.archived_at !== null,
      pinned: r.pinned_at !== null,
      isMessageRequest: r.request_state === 'pending',
      mutedUntil: r.muted_until?.toISOString() ?? null,
      override: r.attention as AttentionInput['override'],
      unreadCount: r.unread,
      unreadMentions: r.unread_mentions,
      lastActivityAt: (r.last_message_at ?? r.created_at).toISOString(),
      pendingInbound:
        inbound && Number(inbound.seq) > myLast
          ? {
              isQuestion: inbound.is_question,
              isRequest: inbound.is_request,
              at: inbound.created_at.toISOString(),
              dismissed: Number(inbound.seq) <= Number(r.dismissed_seq),
            }
          : null,
      awaitingReply,
      followUpDue,
      openRequestsToMe: t?.requests_to_me ?? 0,
      overdueToMe: t?.overdue ?? 0,
      dueSoonToMe: t?.due_soon ?? 0,
      waitingOnThem,
      relationship: rel
        ? {
            priorityNow: currentPriority(policy, now, me.time_zone),
            label: relationshipView(rel).label,
          }
        : r.kind === 'direct'
          ? { priorityNow: currentPriority(policy, now, me.time_zone), label: null }
          : null,
    };
    const result = classifyAttention(input, now);
    const space = r.space_id ? (spaces.get(r.space_id) ?? null) : null;
    const org = orgs.get(r.id) ?? null;
    // Anyone but me in a customer's conversation reads as the organization.
    const shownSender = (id: string | null) => (org && id !== null && id !== userId ? org.id : id);
    return {
      id: r.id,
      kind: r.kind,
      title: org
        ? org.name
        : space
          ? spaceConversationTitle(space, r)
          : r.kind === 'direct'
            ? r.is_general
              ? (other?.displayName ?? 'Deleted account')
              : (r.title ?? 'Topic')
            : r.parent_id && r.kind === 'group'
              ? (r.group_title ?? 'Group')
              : (r.title ?? 'Group'),
      space,
      org,
      topic:
        (r.kind === 'direct' && !r.is_general) || (r.parent_id && r.kind === 'group')
          ? r.title
          : null,
      isGeneral: r.is_general,
      parentId: r.parent_id,
      privacyClass: r.privacy_class,
      other: other ?? null,
      relationship: rel
        ? { label: relationshipView(rel).label, sphere: rel.sphere as Sphere }
        : null,
      memberCount: r.member_count,
      lastMessage: last
        ? {
            id: last.id,
            seq: Number(last.seq),
            senderId: shownSender(last.sender_id),
            kind: last.kind,
            preview:
              r.privacy_class === 'private'
                ? 'Encrypted message'
                : last.kind === 'system'
                  ? systemText(
                      org
                        ? maskPayload(last.payload, {
                            conversationId: r.id,
                            orgId: org.id,
                            orgName: org.name,
                            customerId: userId,
                          })
                        : last.payload,
                      userId,
                    )
                  : messagePreview(last),
            mine: last.kind !== 'system' && last.sender_id === userId,
            createdAt: last.created_at.toISOString(),
          }
        : null,
      unreadCount: r.unread,
      unreadMentions: r.unread_mentions,
      lastActivityAt: (r.last_message_at ?? r.created_at).toISOString(),
      pinned: input.pinned ?? false,
      muted: input.mutedUntil !== null && Date.parse(input.mutedUntil) > now.getTime(),
      archived: input.archived,
      attention: r.attention,
      draft: r.draft,
      request:
        r.request_state === 'pending'
          ? 'incoming'
          : r.other_request_state === 'pending' || r.other_request_state === 'declined'
            ? 'outgoing'
            : null,
      lastSeq: Number(r.last_seq),
      section: result.section,
      reasons: result.reasons,
      rank: result.rank,
    };
  });

  const order = [
    'needs_you',
    'important',
    'waiting',
    'recent',
    'quiet',
    'requests',
    'archived',
  ] as const;
  const sections = order
    .map((section) => ({
      section,
      label: SECTION_LABELS[section],
      items: conversations.filter((c) => c.section === section).sort((a, b) => b.rank - a.rank),
    }))
    .filter((s) => s.items.length > 0);
  const counts = Object.fromEntries(sections.map((s) => [s.section, s.items.length]));
  return { sections, counts, headline: attentionHeadline(counts), conversations };
}

export async function inboxRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get('/inbox', async (req): Promise<InboxResponse | InboxAllResponse> => {
    const auth = requireAuth(req);
    const { view } = parse(
      z.object({ view: z.enum(['attention', 'all']).default('attention') }),
      req.query,
    );
    const inbox = await buildInbox(ctx, auth.userId);
    if (view === 'all') {
      return {
        conversations: inbox.conversations
          .filter((c) => c.section !== 'archived' && c.section !== 'requests')
          .sort(
            (a, b) =>
              (Number(b.pinned) - Number(a.pinned)) * 1e15 +
              (Date.parse(b.lastActivityAt) - Date.parse(a.lastActivityAt)),
          ),
        counts: inbox.counts,
        headline: inbox.headline,
      };
    }
    return { sections: inbox.sections, counts: inbox.counts, headline: inbox.headline };
  });
}
