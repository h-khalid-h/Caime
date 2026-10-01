/**
 * What happens after a message is stored: relationship-aware notifications with burst
 * consolidation (PRD §31–§33), suggestions for each side (PRD §23, §29, §30; R12), emerging
 * topic detection (PRD §58), follow-up checks and automations (PRD §69).
 */
import {
  type Analysis,
  decideNotification,
  detectEmergingTopic,
  firstName,
  type NotificationKind,
  resolvePolicy,
  type Sphere,
  suggestFromAnalysis,
} from '@caime/core';
import { sql } from 'kysely';
import type { AppContext } from '../context';
import type { Conversation, Message } from '../db/schema';
import { runAutomations } from './automations';
import { busyUntilFor } from './calendar';
import { isGroupTopic } from './conversations';
import { enqueue } from './jobs';
import { messagePreview } from './messages';
import { notify } from './notify';
import {
  activeConnectionId,
  activeRelationships,
  loadPolicies,
  policyTargetFor,
  relationshipView,
} from './relations';
import { spaceConversationTitle, spaceRefs } from './spaces';
import { createSuggestion } from './suggest';
import { identityShownTo } from './users';

const BURST_WINDOW_MS = 10 * 60_000;
const LEVEL_RANK = { activity: 0, attention: 1, urgency: 2 } as const;

export async function afterMessage(
  ctx: AppContext,
  message: Message,
  analysis: Analysis | null,
): Promise<void> {
  const conversation = await ctx.db
    .selectFrom('conversations')
    .selectAll()
    .where('id', '=', message.conversation_id)
    .executeTakeFirstOrThrow();
  const members = await ctx.db
    .selectFrom('participants')
    .select(['user_id', 'request_state', 'muted_until', 'attention'])
    .where('conversation_id', '=', conversation.id)
    .where('left_at', 'is', null)
    .execute();
  const sender = message.sender_id
    ? await ctx.db
        .selectFrom('users')
        .select(['id', 'display_name'])
        .where('id', '=', message.sender_id)
        .executeTakeFirst()
    : undefined;
  if (!sender) return;
  const replyToSender = message.reply_to_id
    ? (
        await ctx.db
          .selectFrom('messages')
          .select('sender_id')
          .where('id', '=', message.reply_to_id)
          .executeTakeFirst()
      )?.sender_id
    : null;
  const recipients = members.filter((m) => m.user_id !== sender.id);
  if (conversation.kind === 'business') {
    // The Business inbox tracks whose turn it is, so no topics or follow-up nudges; what each
    // side asked and promised is still worth a suggestion (R15 decides how it's said).
    await notifyBusiness(ctx, conversation, message, sender, recipients, replyToSender ?? null);
    await suggestBusiness(ctx, conversation, message, analysis, sender);
    await runAutomations(ctx, conversation, message, recipients);
    return;
  }
  const addressed = (userId: string) =>
    conversation.kind === 'direct' || message.mentions.includes(userId) || replyToSender === userId;

  await Promise.all([
    ...recipients.map((r) =>
      notifyRecipient(
        ctx,
        conversation,
        message,
        sender,
        r,
        addressed(r.user_id),
        replyToSender === r.user_id,
      ),
    ),
    suggest(ctx, conversation, message, analysis, sender, recipients, addressed),
    detectTopic(ctx, conversation, message),
    scheduleFollowUp(ctx, conversation, message, recipients),
    runAutomations(ctx, conversation, message, recipients),
  ]);
}

type Recipient = {
  user_id: string;
  request_state: string | null;
  muted_until: Date | null;
  attention: string;
};

/** An edit names people it didn't before (PRD §20): they're told, as of a message for them. */
export async function afterMentioning(
  ctx: AppContext,
  message: Message,
  userIds: string[],
): Promise<void> {
  const conversation = await ctx.db
    .selectFrom('conversations')
    .selectAll()
    .where('id', '=', message.conversation_id)
    .executeTakeFirstOrThrow();
  // Nobody is mentioned to an organization's team, nor to its customer (R15).
  if (conversation.kind === 'business' || !message.sender_id) return;
  const sender = await ctx.db
    .selectFrom('users')
    .select(['id', 'display_name'])
    .where('id', '=', message.sender_id)
    .executeTakeFirst();
  if (!sender) return;
  const recipients = await ctx.db
    .selectFrom('participants')
    .select(['user_id', 'request_state', 'muted_until', 'attention'])
    .where('conversation_id', '=', conversation.id)
    .where('left_at', 'is', null)
    .where('user_id', 'in', userIds)
    .execute();
  await Promise.all(
    recipients.map((r) =>
      notifyRecipient(ctx, conversation, message, sender, r, true, false, { edited: true }),
    ),
  );
}

/**
 * A business conversation (R15): the customer hears from the organization, never who on its
 * team wrote; the team hears from the customer, but only whoever has the thread, or everyone
 * while nobody does.
 */
async function notifyBusiness(
  ctx: AppContext,
  conversation: Conversation,
  message: Message,
  sender: { id: string; display_name: string },
  recipients: Recipient[],
  replyToSender: string | null,
): Promise<void> {
  const thread = await ctx.db
    .selectFrom('business_threads as t')
    .innerJoin('organizations as o', 'o.id', 't.org_id')
    .select(['t.customer_id', 't.assignee_id', 'o.id as org_id', 'o.name as org_name'])
    .where('t.conversation_id', '=', conversation.id)
    .executeTakeFirst();
  if (!thread) return;
  const kinds = await ctx.db
    .selectFrom('users')
    .select(['id', 'kind'])
    .where('id', 'in', [sender.id, ...recipients.map((r) => r.user_id)])
    .execute();
  const kindOf = (id: string) => kinds.find((k) => k.id === id)?.kind;
  const human = (id: string) => kindOf(id) === 'human';
  if (sender.id === thread.customer_id) {
    // People hear it; the organization's bots hear it through their webhooks.
    const team = (
      thread.assignee_id ? recipients.filter((r) => r.user_id === thread.assignee_id) : recipients
    ).filter((r) => human(r.user_id));
    await Promise.all(
      team.map((r) =>
        notifyRecipient(ctx, conversation, message, sender, r, true, replyToSender === r.user_id, {
          context: thread.org_name,
        }),
      ),
    );
    return;
  }
  const customer = recipients.find((r) => r.user_id === thread.customer_id);
  if (customer)
    await notifyRecipient(
      ctx,
      conversation,
      message,
      {
        id: thread.org_id,
        // A bot's or an AI agent's answer says so, even in a notification (R16, PRD §75).
        display_name: human(sender.id)
          ? thread.org_name
          : `${thread.org_name} (${kindOf(sender.id) === 'agent' ? 'AI agent' : 'automated'})`,
      },
      customer,
      true,
      replyToSender === customer.user_id,
    );
}

async function notifyRecipient(
  ctx: AppContext,
  conversation: Conversation,
  message: Message,
  sender: { id: string; display_name: string },
  recipient: Recipient,
  addressed: boolean,
  isReplyToThem: boolean,
  opts: {
    context?: string;
    /** An edit named them: news of its own, never counted as another message in a burst. */
    edited?: boolean;
  } = {},
): Promise<void> {
  const user = await ctx.db
    .selectFrom('users')
    .select(['time_zone', 'quiet_hours', 'preferences'])
    .where('id', '=', recipient.user_id)
    .executeTakeFirstOrThrow();
  const [policies, rels, shown, connectionId] = await Promise.all([
    loadPolicies(ctx.db, recipient.user_id),
    activeRelationships(ctx.db, recipient.user_id, [sender.id]),
    // Named as the sender shows themselves to this person (PRD §35), on a lock screen too; an
    // organization speaking in its own conversation keeps its name.
    identityShownTo(ctx, sender.id, recipient.user_id),
    // A rule just for the sender holds wherever they write: in a group too, by their connection.
    conversation.kind === 'direct'
      ? conversation.connection_id
      : activeConnectionId(ctx.db, recipient.user_id, sender.id),
  ]);
  const senderName = shown?.displayName ?? sender.display_name;
  const policy = resolvePolicy(policies, policyTargetFor(rels[0], connectionId));
  const kind: NotificationKind = message.mentions.includes(recipient.user_id)
    ? 'mention'
    : isReplyToThem
      ? 'reply'
      : message.is_request && addressed
        ? 'request'
        : message.is_question && addressed
          ? 'question'
          : 'message';
  const now = ctx.now();
  // In a meeting, and asked for work to wait (R51): looked up only then, one query.
  const holdWhileBusy = Boolean(
    (user.preferences as { holdWhileBusy?: boolean } | null)?.holdWhileBusy,
  );
  const busyUntil = holdWhileBusy ? await busyUntilFor(ctx, recipient.user_id, now) : null;
  // A request they haven't accepted, or declined, never interrupts them (R14).
  const pendingRequest =
    recipient.request_state === 'pending' || recipient.request_state === 'declined';
  const decision = pendingRequest
    ? {
        deliver: 'silent' as const,
        level: 'activity' as const,
        holdUntil: null,
        reason: 'Message request',
      }
    : decideNotification(
        policy,
        { kind, urgent: message.urgent },
        {
          now,
          timeZone: user.time_zone,
          muted: recipient.muted_until !== null && recipient.muted_until > now,
          conversationPriority: recipient.attention as 'auto',
          quietHours:
            (user.quiet_hours as { days: number[]; start: string; end: string } | null) ?? null,
          relationshipLabel: rels[0] ? relationshipView(rels[0]).label : null,
          busyUntil: busyUntil?.toISOString() ?? null,
          sphere: (rels[0]?.sphere as Sphere | undefined) ?? null,
        },
      );

  // A business conversation is one-to-one: a customer and an organization.
  const isGroup = conversation.kind !== 'direct' && conversation.kind !== 'business';
  const context = opts.context ? ` · ${opts.context}` : '';
  const space = conversation.space_id
    ? (await spaceRefs(ctx.db, [conversation.space_id])).get(conversation.space_id)
    : undefined;
  // A group's topic is named with its group: "Book club · Middlemarch".
  const group = isGroupTopic(conversation)
    ? await ctx.db
        .selectFrom('conversations')
        .select('title')
        .where('id', '=', conversation.parent_id as string)
        .executeTakeFirst()
    : undefined;
  const groupTitle = space
    ? spaceConversationTitle(space, conversation)
    : group
      ? `${group.title ?? 'Group'} · ${conversation.title ?? 'Topic'}`
      : (conversation.title ?? 'Group');
  const preview =
    conversation.privacy_class === 'private' ? 'New message' : messagePreview(message);
  const groupKey = `conv:${conversation.id}`;
  const existing = opts.edited
    ? undefined
    : await ctx.db
        .selectFrom('notifications')
        .selectAll()
        .where('user_id', '=', recipient.user_id)
        .where('group_key', '=', groupKey)
        .where('read_at', 'is', null)
        .where('dismissed_at', 'is', null)
        .where('updated_at', '>', new Date(now.getTime() - BURST_WINDOW_MS))
        .orderBy('updated_at', 'desc')
        .executeTakeFirst();

  const data = {
    conversationId: conversation.id,
    messageId: message.id,
    senderId: sender.id,
    seq: String(message.seq),
  };
  if (existing) {
    // Burst consolidation: one notification that says how many and the one that matters most.
    const count = existing.count + 1;
    const level =
      LEVEL_RANK[decision.level] > LEVEL_RANK[existing.level] ? decision.level : existing.level;
    const salient = kind !== 'message' || !(existing.data as { salient?: boolean }).salient;
    // Whatever its words have been, since a device may still show them (forgetNotificationsOf).
    const quotes = salient ? [...new Set([...existing.quotes, message.id])] : existing.quotes;
    const title = isGroup
      ? `${count} new messages in ${groupTitle}`
      : `${senderName} sent ${count} messages${context}`;
    await ctx.db
      .updateTable('notifications')
      .set({
        count,
        level,
        title,
        body: salient ? preview : existing.body,
        data: JSON.stringify({ ...data, salient: salient && kind !== 'message' }),
        quotes,
        delivery: decision.deliver === 'push' ? 'push' : existing.delivery,
        hold_until: decision.holdUntil ? new Date(decision.holdUntil) : existing.hold_until,
        reason: decision.reason,
        updated_at: now,
      })
      .where('id', '=', existing.id)
      .execute();
    await ctx.bus.publish([recipient.user_id], {
      type: 'notification.updated',
      data: { id: existing.id, count, title, level, body: salient ? preview : existing.body, data },
    });
    return;
  }
  await notify(ctx, {
    userId: recipient.user_id,
    kind: pendingRequest ? 'message_request' : kind,
    level: decision.level,
    title: isGroup ? `${senderName} · ${groupTitle}` : `${senderName}${context}`,
    body: preview,
    data: { ...data, salient: kind !== 'message' },
    quotes: [message.id],
    groupKey,
    delivery: decision.deliver,
    holdUntil: decision.holdUntil ? new Date(decision.holdUntil) : null,
    reason: decision.reason,
  });
}

/**
 * "I'll send it Thursday" names nothing, but usually answers something open between the same two
 * people in the same conversation: my request, or their commitment. Update that one (the due date
 * is news) rather than offering a second, vaguer copy. Returns true when it was absorbed.
 */
async function absorbVague(
  ctx: AppContext,
  opts: {
    userId: string;
    conversationId: string;
    subjectUserId: string | null;
    kinds: string[];
    dueAt: string | null;
    dueText: string | null;
    rationale: string;
  },
): Promise<boolean> {
  if (!opts.subjectUserId) return false;
  const since = new Date(ctx.now().getTime() - 14 * 86_400_000);
  const open = await ctx.db
    .selectFrom('suggestions')
    .select(['id', 'due_at'])
    .where('user_id', '=', opts.userId)
    .where('conversation_id', '=', opts.conversationId)
    .where('subject_user_id', '=', opts.subjectUserId)
    .where('kind', 'in', opts.kinds)
    .where('status', '=', 'pending')
    .where('created_at', '>', since)
    .orderBy('created_at', 'desc')
    .executeTakeFirst();
  if (open) {
    await ctx.db
      .updateTable('suggestions')
      .set({
        rationale: opts.rationale,
        ...(opts.dueAt ? { due_at: new Date(opts.dueAt), due_text: opts.dueText } : {}),
      })
      .where('id', '=', open.id)
      .execute();
    await ctx.bus.publish([opts.userId], {
      type: 'suggestion.created',
      data: { id: open.id, conversationId: opts.conversationId },
    });
    return true;
  }
  // Already tracked as an action between them: nothing new to offer.
  const tracked = await ctx.db
    .selectFrom('tasks')
    .select('id')
    .where('conversation_id', '=', opts.conversationId)
    .where('status', 'in', ['open', 'accepted'])
    .where('created_at', '>', since)
    .where((eb) =>
      eb.or([
        eb.and([eb('owner_id', '=', opts.userId), eb('assignee_id', '=', opts.subjectUserId!)]),
        eb.and([eb('owner_id', '=', opts.subjectUserId!), eb('assignee_id', '=', opts.userId)]),
      ]),
    )
    .executeTakeFirst();
  return Boolean(tracked);
}

async function suggest(
  ctx: AppContext,
  conversation: Conversation,
  message: Message,
  analysis: Analysis | null,
  sender: { id: string; display_name: string },
  recipients: Array<{ user_id: string; request_state: string | null }>,
  addressed: (userId: string) => boolean,
): Promise<void> {
  if (!analysis || conversation.privacy_class === 'private') return;
  const counterpartForSender =
    conversation.kind === 'direct' ? recipients[0]?.user_id : (message.mentions[0] ?? null);
  const mine = suggestFromAnalysis(analysis, { senderIsMe: true, senderName: sender.display_name });
  for (const s of mine) {
    if (s.kind === 'waiting' && !counterpartForSender) continue;
    // "I'll do it Thursday" in reply to their request: it's that task, now with a date.
    if (
      s.vague &&
      s.kind === 'reminder' &&
      (await absorbVague(ctx, {
        userId: sender.id,
        conversationId: conversation.id,
        subjectUserId: counterpartForSender ?? null,
        kinds: ['task', 'reminder'],
        dueAt: s.dueAt,
        dueText: s.dueText,
        rationale: s.rationale,
      }))
    )
      continue;
    await createSuggestion(ctx, {
      userId: sender.id,
      kind: s.kind,
      title: s.title,
      rationale: s.rationale,
      confidence: s.confidence,
      payload: {
        dueHasTime: Boolean(analysisDateHasTime(analysis, s.dueText)),
        decidedBy: sender.id,
      },
      subjectUserId: s.kind === 'waiting' ? counterpartForSender : null,
      conversationId: conversation.id,
      messageId: message.id,
      dueAt: s.dueAt,
      dueText: s.dueText,
      fingerprint: `msg:${message.id}:${s.kind}`,
    });
  }
  for (const r of recipients) {
    // Strangers' messages (pending requests) don't create work for you (R14).
    if (r.request_state === 'pending' || r.request_state === 'declined' || !addressed(r.user_id))
      continue;
    // Said with the name the sender shows this person (PRD §35).
    const shown = await identityShownTo(ctx, sender.id, r.user_id);
    const theirs = suggestFromAnalysis(analysis, {
      senderIsMe: false,
      senderName: firstName(shown?.displayName ?? sender.display_name),
    });
    for (const s of theirs) {
      // "I'll send it Thursday" answering my request: the waiting item, now with a date.
      if (
        s.vague &&
        s.kind === 'waiting' &&
        (await absorbVague(ctx, {
          userId: r.user_id,
          conversationId: conversation.id,
          subjectUserId: sender.id,
          kinds: ['waiting'],
          dueAt: s.dueAt,
          dueText: s.dueText,
          rationale: s.rationale,
        }))
      )
        continue;
      await createSuggestion(ctx, {
        userId: r.user_id,
        kind: s.kind,
        title: s.title,
        rationale: s.rationale,
        confidence: s.confidence,
        payload: {
          dueHasTime: Boolean(analysisDateHasTime(analysis, s.dueText)),
          decidedBy: sender.id,
        },
        subjectUserId: sender.id,
        conversationId: conversation.id,
        messageId: message.id,
        dueAt: s.dueAt,
        dueText: s.dueText,
        fingerprint: `msg:${message.id}:${s.kind}`,
      });
    }
  }
}

/**
 * Suggestions in a conversation with an organization (R15). The customer's come from what the
 * organization asked and decided, said as the organization's and pointing at nobody on its team;
 * what they wait for from it is the conversation's own state. The team's go to whoever has the
 * thread, and to whoever on it made a promise or asked something. None while it's a request the
 * customer hasn't accepted (R14).
 */
async function suggestBusiness(
  ctx: AppContext,
  conversation: Conversation,
  message: Message,
  analysis: Analysis | null,
  sender: { id: string; display_name: string },
): Promise<void> {
  if (!analysis || conversation.privacy_class === 'private') return;
  const thread = await ctx.db
    .selectFrom('business_threads as t')
    .innerJoin('organizations as o', 'o.id', 't.org_id')
    .innerJoin('participants as p', (j) =>
      j
        .onRef('p.conversation_id', '=', 't.conversation_id')
        .onRef('p.user_id', '=', 't.customer_id'),
    )
    .innerJoin('users as u', 'u.id', 't.customer_id')
    .select([
      't.customer_id',
      't.assignee_id',
      'o.name as org_name',
      'p.request_state',
      'u.display_name as customer_name',
    ])
    .where('t.conversation_id', '=', conversation.id)
    .executeTakeFirst();
  if (!thread?.customer_id) return;
  if (thread.request_state === 'pending' || thread.request_state === 'declined') return;
  const customerId = thread.customer_id;
  const senderKind = (
    await ctx.db
      .selectFrom('users')
      .select('kind')
      .where('id', '=', sender.id)
      .executeTakeFirstOrThrow()
  ).kind;
  const file = (
    userId: string,
    s: ReturnType<typeof suggestFromAnalysis>[number],
    opts: { subject: string | null; decidedBy: string | null },
  ) =>
    createSuggestion(ctx, {
      userId,
      kind: s.kind,
      title: s.title,
      rationale: s.rationale,
      confidence: s.confidence,
      payload: {
        dueHasTime: Boolean(analysisDateHasTime(analysis, s.dueText)),
        ...(opts.decidedBy ? { decidedBy: opts.decidedBy } : {}),
      },
      subjectUserId: opts.subject,
      conversationId: conversation.id,
      messageId: message.id,
      dueAt: s.dueAt,
      dueText: s.dueText,
      fingerprint: `msg:${message.id}:${s.kind}`,
    });

  if (sender.id === customerId) {
    // What they promised or decided themselves.
    for (const s of suggestFromAnalysis(analysis, {
      senderIsMe: true,
      senderName: sender.display_name,
    }))
      if (s.kind !== 'waiting') await file(customerId, s, { subject: null, decidedBy: sender.id });
    // What they asked of the team, or promised it: for whoever has the thread.
    if (thread.assignee_id) {
      const shown = await identityShownTo(ctx, customerId, thread.assignee_id);
      for (const s of suggestFromAnalysis(analysis, {
        senderIsMe: false,
        senderName: firstName(shown?.displayName ?? sender.display_name),
      }))
        await file(thread.assignee_id, s, { subject: customerId, decidedBy: customerId });
    }
    return;
  }
  // Someone on the team (or its app's bot) wrote: their own promises and questions to the customer.
  if (senderKind === 'human')
    for (const s of suggestFromAnalysis(analysis, {
      senderIsMe: true,
      senderName: sender.display_name,
    }))
      await file(sender.id, s, {
        subject: s.kind === 'waiting' ? customerId : null,
        decidedBy: sender.id,
      });
  // And what the organization asked of the customer, in its name.
  for (const s of suggestFromAnalysis(analysis, { senderIsMe: false, senderName: thread.org_name }))
    if (s.kind !== 'waiting') await file(customerId, s, { subject: null, decidedBy: null });
}

function analysisDateHasTime(a: Analysis, dueText: string | null): boolean {
  if (!dueText) return false;
  return a.dates.some((d) => d.text === dueText && d.time !== null);
}

async function detectTopic(
  ctx: AppContext,
  conversation: Conversation,
  message: Message,
): Promise<void> {
  // Where a subject can become a topic: a one-to-one, a space's General, or a group that isn't
  // one itself (PRD §58).
  const plainGroup =
    conversation.kind === 'group' && !conversation.space_id && !conversation.parent_id;
  if (!conversation.is_general && !plainGroup) return;
  const topics = (message.entities as { topics?: string[] }).topics ?? [];
  if (topics.length === 0) return;
  const recent = await ctx.db
    .selectFrom('messages')
    .select(['entities'])
    .where('conversation_id', '=', conversation.id)
    .where('deleted_at', 'is', null)
    .orderBy('seq', 'desc')
    .limit(10)
    .execute();
  const topic = detectEmergingTopic(
    recent.map((m) => ({ topics: ((m.entities ?? {}) as { topics?: string[] }).topics ?? [] })),
  );
  if (!topic) return;
  const already = await ctx.db
    .selectFrom('conversations')
    .select('id')
    .where('parent_id', '=', conversation.id)
    .where(sql`lower(title)`, '=', topic.toLowerCase())
    .executeTakeFirst();
  if (already) return;
  const members = await ctx.db
    .selectFrom('participants')
    .select('user_id')
    .where('conversation_id', '=', conversation.id)
    .where('left_at', 'is', null)
    .execute();
  for (const m of members) {
    await createSuggestion(ctx, {
      userId: m.user_id,
      kind: 'topic',
      title: topic,
      rationale: `“${topic}” keeps coming up here. A separate topic keeps it together.`,
      confidence: 0.7,
      payload: { parentId: conversation.id },
      conversationId: conversation.id,
      fingerprint: `topic:${conversation.id}:${topic.toLowerCase()}`,
    });
  }
}

async function scheduleFollowUp(
  ctx: AppContext,
  conversation: Conversation,
  message: Message,
  recipients: Array<{ user_id: string }>,
): Promise<void> {
  if (
    conversation.kind !== 'direct' ||
    !(message.is_question || message.is_request) ||
    !message.sender_id
  )
    return;
  const other = recipients[0]?.user_id;
  if (!other) return;
  const [policies, rels] = await Promise.all([
    loadPolicies(ctx.db, message.sender_id),
    activeRelationships(ctx.db, message.sender_id, [other]),
  ]);
  const policy = resolvePolicy(policies, policyTargetFor(rels[0], conversation.connection_id));
  if (!policy.followUpHours) return;
  await enqueue(
    ctx,
    'follow_up_check',
    {
      conversationId: conversation.id,
      messageId: message.id,
      senderId: message.sender_id,
      otherId: other,
      seq: String(message.seq),
    },
    {
      runAt: new Date(ctx.now().getTime() + policy.followUpHours * 3_600_000),
      dedupeKey: `follow_up:${message.id}`,
    },
  );
}
