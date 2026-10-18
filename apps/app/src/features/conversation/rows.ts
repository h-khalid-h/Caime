import type { ConversationView, MessageView } from '@caime/core/api';
import { formatDayHeading } from '@caime/core/format';
import { isLargeGroup } from '@caime/core/large-group';
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

/**
 * The name a group's line was written under on WhatsApp, where whoever brought it over took that
 * name as nobody here (M16 C3g): the line is drawn as that name's, never as theirs.
 */
export const importedAuthor = (m: MessageView): string | null => {
  const imported = (m.payload as { imported?: { author?: unknown } } | null)?.imported;
  return typeof imported?.author === 'string' ? imported.author : null;
};

/** Who a line reads as: someone here, or a name a WhatsApp group brought (never mixed up). */
const writer = (m: MessageView) => {
  const author = importedAuthor(m);
  return author ? `imported:${author}` : m.senderId;
};

/** An outbox item drawn as a message: it's on screen the moment it's written (ADR-8). */
export function pendingAsMessage(item: OutboxItem, me: string): MessageView {
  return {
    id: item.clientId,
    conversationId: item.conversationId,
    seq: Number.MAX_SAFE_INTEGER,
    clientId: item.clientId,
    senderId: me,
    automated: false,
    aiAgent: false,
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
    album: null,
    sentVia: null,
    channel: null,
    mail: null,
    // Still on this device: its words are the ones written here, sealed when it's sent.
    sealed: null,
    pinnedAt: null,
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
  // A group of many shows no ticks (M16 D2b): nothing tells the sender who has it.
  if (conversation && isLargeGroup(conversation.kind, conversation.participants.length))
    return 'sent';
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
    const author = importedAuthor(m);
    const mine = m.senderId === me && !author;
    if (
      !markedUnread &&
      unreadFrom !== null &&
      m.seq >= unreadFrom &&
      !mine &&
      m.seq !== Number.MAX_SAFE_INTEGER
    ) {
      rows.push({ type: 'unread', key: 'unread' });
      markedUnread = true;
    }
    const sameAsPrev =
      prev &&
      writer(prev) === writer(m) &&
      prev.kind !== 'system' &&
      Date.parse(m.createdAt) - Date.parse(prev.createdAt) < GROUP_MS &&
      formatDayHeading(prev.createdAt, now, timeZone, locale) === day;
    const sameAsNext =
      next &&
      writer(next) === writer(m) &&
      next.kind !== 'system' &&
      Date.parse(next.createdAt) - Date.parse(m.createdAt) < GROUP_MS &&
      formatDayHeading(next.createdAt, now, timeZone, locale) === day;
    rows.push({
      type: 'message',
      key: m.clientId ?? m.id,
      m,
      mine,
      first: !sameAsPrev,
      last: !sameAsNext,
      delivery: mine ? delivery : undefined,
      senderName: author ?? (isGroup && m.senderId ? (names.get(m.senderId) ?? null) : null),
    });
  }
  return rows.reverse();
}
