import type { ConversationView, MessageView } from '@caishy/core/api';
import { formatDayHeading } from '@caishy/core/format';
import type { OutboxItem } from '@/state/outbox';
import type { Delivery } from './MessageBubble';

export type Row =
  | {
      type: 'message';
      key: string;
      m: MessageView;
      mine: boolean;
      first: boolean;
      last: boolean;
      delivery?: Delivery;
      senderName: string | null;
    }
  | { type: 'day'; key: string; label: string }
  | { type: 'unread'; key: string };

const GROUP_MS = 4 * 60_000;

/** An outbox item drawn as a message: it's on screen the moment it's written (ADR-8). */
export function pendingAsMessage(item: OutboxItem, me: string): MessageView {
  return {
    id: item.clientId,
    conversationId: item.conversationId,
    seq: Number.MAX_SAFE_INTEGER,
    clientId: item.clientId,
    senderId: me,
    kind: item.body.kind ?? 'text',
    body: item.body.body ?? null,
    payload: (item.body.payload as Record<string, unknown>) ?? {},
    mode: 'talk',
    entities: {},
    mentions: item.body.mentions ?? [],
    replyTo: item.replyTo,
    forwarded: false,
    urgent: Boolean(item.body.urgent),
    isQuestion: false,
    isRequest: false,
    reactions: [],
    files: [],
    poll: null,
    editedAt: null,
    deletedAt: null,
    createdAt: item.createdAt,
  };
}

function deliveryOf(
  m: MessageView,
  conversation: ConversationView | undefined,
  me: string,
): Delivery {
  const business = conversation?.business;
  // A customer's messages reach the organization; someone on its team reading is "read" (R15).
  if (business && !business.thread) {
    if (business.readSeq !== null && business.readSeq >= m.seq) return 'read';
    return business.deliveredSeq >= m.seq ? 'delivered' : 'sent';
  }
  // For the team, only the customer's side counts, not each other's.
  const others =
    conversation?.participants.filter(
      (p) => p.userId !== me && !(business && p.role === 'agent'),
    ) ?? [];
  if (others.length === 0) return 'sent';
  const read = others.every((p) => p.readSeq !== null && p.readSeq >= m.seq);
  if (read) return 'read';
  const delivered = others.some((p) => p.deliveredSeq >= m.seq || (p.readSeq ?? 0) >= m.seq);
  return delivered ? 'delivered' : 'sent';
}

/**
 * Build the rows, newest first (the list is inverted): day separators, a "new messages" marker
 * at the first unread message, and runs of messages from the same sender grouped.
 */
export function buildRows(opts: {
  messages: MessageView[];
  pending: OutboxItem[];
  conversation: ConversationView | undefined;
  me: string;
  unreadFrom: number | null;
  now: Date;
  timeZone: string;
  locale: string;
}): Row[] {
  const { messages, pending, conversation, me, unreadFrom, now, timeZone, locale } = opts;
  const known = new Set(messages.map((m) => m.clientId).filter(Boolean));
  const all: Array<{ m: MessageView; delivery?: Delivery }> = [
    ...messages.map((m) => ({
      m,
      delivery: m.senderId === me ? deliveryOf(m, conversation, me) : undefined,
    })),
    ...pending
      .filter((p) => !known.has(p.clientId))
      .map((p) => ({ m: pendingAsMessage(p, me), delivery: p.status as Delivery })),
  ];
  // A customer talks one-to-one with an organization; its team sees who wrote what.
  const isGroup =
    conversation?.kind !== 'direct' && !(conversation?.business && !conversation.business.thread);
  const names = new Map(
    conversation?.participants.map((p) => [p.userId, p.person.displayName]) ?? [],
  );
  const rows: Row[] = [];
  let lastDay = '';
  let markedUnread = false;
  for (let i = 0; i < all.length; i++) {
    const { m, delivery } = all[i]!;
    const prev = all[i - 1]?.m;
    const next = all[i + 1]?.m;
    const day = formatDayHeading(m.createdAt, now, timeZone, locale);
    if (day !== lastDay) {
      rows.push({ type: 'day', key: `day-${m.id}`, label: day });
      lastDay = day;
    }
    if (
      !markedUnread &&
      unreadFrom !== null &&
      m.seq >= unreadFrom &&
      m.senderId !== me &&
      m.seq !== Number.MAX_SAFE_INTEGER
    ) {
      rows.push({ type: 'unread', key: 'unread' });
      markedUnread = true;
    }
    const sameAsPrev =
      prev &&
      prev.senderId === m.senderId &&
      prev.kind !== 'system' &&
      Date.parse(m.createdAt) - Date.parse(prev.createdAt) < GROUP_MS &&
      formatDayHeading(prev.createdAt, now, timeZone, locale) === day;
    const sameAsNext =
      next &&
      next.senderId === m.senderId &&
      next.kind !== 'system' &&
      Date.parse(next.createdAt) - Date.parse(m.createdAt) < GROUP_MS &&
      formatDayHeading(next.createdAt, now, timeZone, locale) === day;
    rows.push({
      type: 'message',
      key: m.clientId ?? m.id,
      m,
      mine: m.senderId === me,
      first: !sameAsPrev,
      last: !sameAsNext,
      delivery,
      senderName: isGroup && m.senderId ? (names.get(m.senderId) ?? null) : null,
    });
  }
  return rows.reverse();
}
