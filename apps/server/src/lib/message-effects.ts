/**
 * What happens after a message is stored: relationship-aware notifications with burst
 * consolidation (PRD §31–§33), suggestions for each side (PRD §23, §29, §30; R12), emerging
 * topic detection (PRD §58) and follow-up checks (PRD §69).
 */
import {
  type Analysis,
  decideNotification,
  detectEmergingTopic,
  firstName,
  type NotificationKind,
  resolvePolicy,
  suggestFromAnalysis,
} from '@caishy/core';
import { sql } from 'kysely';
import type { AppContext } from '../context';
import type { Conversation, Message } from '../db/schema';
import { enqueue } from './jobs';
import { messagePreview } from './messages';
import { notify } from './notify';
import { activeRelationships, loadPolicies, policyTargetFor, relationshipView } from './relations';
import { createSuggestion } from './suggest';

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
  ]);
}

async function notifyRecipient(
  ctx: AppContext,
  conversation: Conversation,
  message: Message,
  sender: { id: string; display_name: string },
  recipient: {
    user_id: string;
    request_state: string | null;
    muted_until: Date | null;
    attention: string;
  },
  addressed: boolean,
  isReplyToThem: boolean,
): Promise<void> {
  const user = await ctx.db
    .selectFrom('users')
    .select(['time_zone', 'quiet_hours'])
    .where('id', '=', recipient.user_id)
    .executeTakeFirstOrThrow();
  const [policies, rels] = await Promise.all([
    loadPolicies(ctx.db, recipient.user_id),
    activeRelationships(ctx.db, recipient.user_id, [sender.id]),
  ]);
  const connectionId = conversation.kind === 'direct' ? conversation.connection_id : null;
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
  const pendingRequest = recipient.request_state === 'pending';
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
        },
      );

  const isGroup = conversation.kind !== 'direct';
  const groupTitle = conversation.title ?? 'Group';
  const preview =
    conversation.privacy_class === 'private' ? 'New message' : messagePreview(message);
  const groupKey = `conv:${conversation.id}`;
  const existing = await ctx.db
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
    const title = isGroup
      ? `${count} new messages in ${groupTitle}`
      : `${sender.display_name} sent ${count} messages`;
    await ctx.db
      .updateTable('notifications')
      .set({
        count,
        level,
        title,
        body: salient ? preview : existing.body,
        data: JSON.stringify({ ...data, salient: salient && kind !== 'message' }),
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
    title: isGroup ? `${sender.display_name} · ${groupTitle}` : sender.display_name,
    body: preview,
    data: { ...data, salient: kind !== 'message' },
    groupKey,
    delivery: decision.deliver,
    holdUntil: decision.holdUntil ? new Date(decision.holdUntil) : null,
    reason: decision.reason,
  });
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
  const theirs = suggestFromAnalysis(analysis, {
    senderIsMe: false,
    senderName: firstName(sender.display_name),
  });
  for (const r of recipients) {
    // Strangers' messages (pending requests) don't create work for you (R14).
    if (r.request_state === 'pending' || !addressed(r.user_id)) continue;
    for (const s of theirs) {
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

function analysisDateHasTime(a: Analysis, dueText: string | null): boolean {
  if (!dueText) return false;
  return a.dates.some((d) => d.text === dueText && d.time !== null);
}

async function detectTopic(
  ctx: AppContext,
  conversation: Conversation,
  message: Message,
): Promise<void> {
  if (!conversation.is_general) return;
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
