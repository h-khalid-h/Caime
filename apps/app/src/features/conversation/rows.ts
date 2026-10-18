import type { ConversationView, MessageView } from '@caime/core/api';
import { formatDayHeading } from '@caime/core/format';
import { tr } from '@caime/core/i18n';
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
      /** Who wrote the message this one answers, as the reader knows them ("You" for their own). */
      replyName: string | null;
      /** Its day, as its separator says it: what the date pill shows over it (M16 E3). */
      day: string;
      /** Who wrote the group's message this answers privately (M16 E3b), as the reader knows them. */
      privateReplyName: string | null;
    }
  | { type: 'day'; key: string; label: string }
  /** Where the unread start, and how many there are (M16 E3). */
  | { type: 'unread'; key: string; count: number };

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
    privateReply: item.privateReply ?? null,
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
 * Who's who here, by the names the viewer knows (M16 E2): its people, and to a customer the
 * organization, whose team reads to them as one (R15).
 */
export function namesIn(conversation: ConversationView | undefined): Map<string, string> {
  const names = new Map(
    conversation?.participants.map((p) => [p.userId, p.person.displayName]) ?? [],
  );
  const business = conversation?.business;
  if (business && !business.thread) names.set(business.org.id, business.org.name);
  return names;
}

export interface MessageInfo {
  read: string[];
  delivered: string[];
  waiting: string[];
}

/**
 * Who has a message of mine in a group (M16 E2): read, arrived, or not yet, by name, as the
 * ticks count it. Someone whose reading is withheld (R25) is said to have it once it arrived,
 * never to have read it; someone reached by mail is left to the bubble's mail line. Null where
 * nothing more is to be said: a chat (its ticks say it), an organization's conversation, a
 * group of many (nobody's devices say), or a message still on this device.
 */
export function messageInfo(
  m: MessageView,
  conversation: ConversationView | undefined,
  me: string,
): MessageInfo | null {
  if (!conversation || m.senderId !== me || m.seq === Number.MAX_SAFE_INTEGER) return null;
  if (conversation.kind === 'direct' || conversation.business || m.kind === 'system') return null;
  if (isLargeGroup(conversation.kind, conversation.participants.length)) return null;
  const info: MessageInfo = { read: [], delivered: [], waiting: [] };
  for (const p of conversation.participants) {
    if (p.userId === me || p.person.kind !== 'human') continue;
    const name = p.person.displayName;
    if (p.readSeq !== null && p.readSeq >= m.seq) info.read.push(name);
    else if (p.deliveredSeq >= m.seq) info.delivered.push(name);
    else info.waiting.push(name);
  }
  return info;
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
  const names = namesIn(conversation);
  const rows: Row[] = [];
  let lastDay = '';
  let markedUnread = false;
  // What the unread line counts: others' messages from it on, never one's own or a line about it.
  const unreadCount =
    unreadFrom === null
      ? 0
      : messages.filter(
          (m) =>
            m.seq >= unreadFrom &&
            m.senderId !== me &&
            m.kind !== 'system' &&
            !importedAuthor(m) &&
            m.seq !== Number.MAX_SAFE_INTEGER,
        ).length;
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
      rows.push({ type: 'unread', key: 'unread', count: unreadCount });
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
      replyName: !m.replyTo?.senderId
        ? null
        : m.replyTo.senderId === me
          ? tr('You')
          : (names.get(m.replyTo.senderId) ?? null),
      day,
      privateReplyName: !m.privateReply?.senderId
        ? null
        : m.privateReply.senderId === me
          ? tr('You')
          : (names.get(m.privateReply.senderId) ?? null),
    });
  }
  return rows.reverse();
}
