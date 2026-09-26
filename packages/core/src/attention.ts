/**
 * The attention engine (PRD §19–§20). Places every conversation in one inbox section and says
 * why. The user stays the authority: their overrides win, every placement carries reasons, and
 * Needs You only fires on explicit signals (PRODUCT-REVIEW R7, R8).
 *
 * Pure: the server computes the inputs with SQL, clients recompute locally after realtime events
 * and offline actions, and both get the same answer.
 */
import type { Priority } from './policy';

export const ATTENTION_SECTIONS = [
  'needs_you',
  'important',
  'waiting',
  'recent',
  'quiet',
  'requests',
  'archived',
] as const;
export type AttentionSection = (typeof ATTENTION_SECTIONS)[number];

export const SECTION_LABELS: Record<AttentionSection, string> = {
  needs_you: 'Needs you',
  important: 'Important',
  waiting: 'Waiting',
  recent: 'Recent',
  quiet: 'Quiet',
  requests: 'Requests',
  archived: 'Archived',
};

export type ReasonCode =
  | 'overdue'
  | 'due_soon'
  | 'request_to_you'
  | 'mentioned_you'
  | 'asked_you'
  | 'follow_up_due'
  | 'waiting_on_them'
  | 'awaiting_reply'
  | 'priority_relationship'
  | 'you_marked_priority'
  | 'you_marked_quiet'
  | 'muted'
  | 'quiet_relationship'
  | 'message_request'
  | 'unread'
  | 'pinned';

export interface AttentionReason {
  code: ReasonCode;
  label: string;
}

export interface AttentionInput {
  archived: boolean;
  pinned?: boolean;
  /** From someone who is not a connection, not yet accepted (R14). */
  isMessageRequest: boolean;
  mutedUntil: string | null;
  /** The user's own setting for this conversation. */
  override: Priority | 'auto';
  unreadCount: number;
  unreadMentions: number;
  lastActivityAt: string | null;
  /**
   * The latest message from someone else after my last message, if it is addressed to me: always
   * in a direct conversation; in a group only when it mentions me or replies to me.
   */
  pendingInbound: {
    isQuestion: boolean;
    isRequest: boolean;
    at: string;
    dismissed: boolean;
  } | null;
  /** My last message is the latest in the conversation and it asks something. */
  awaitingReply: { at: string } | null;
  /** The relationship's follow-up time has passed on `awaitingReply` (PRD §69). */
  followUpDue: boolean;
  /** Open requests assigned to me in this conversation (R13). */
  openRequestsToMe: number;
  overdueToMe: number;
  /** Due within the next 24 hours. */
  dueSoonToMe: number;
  /** My open waiting items on the other side of this conversation. */
  waitingOnThem: number;
  /** Direct conversations: the other person's relationship as it applies right now. */
  relationship: { priorityNow: Priority; label: string | null } | null;
}

export interface AttentionResult {
  section: AttentionSection;
  reasons: AttentionReason[];
  /** Sort key within the section, higher first. */
  rank: number;
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many.replace('{n}', String(n));
}

export function classifyAttention(input: AttentionInput, now: Date): AttentionResult {
  const reasons: AttentionReason[] = [];
  const at = input.lastActivityAt ? Date.parse(input.lastActivityAt) : 0;
  const muted = input.mutedUntil !== null && Date.parse(input.mutedUntil) > now.getTime();
  const pinnedBoost = input.pinned ? 1e14 : 0;

  // Explicit signals that something needs me, strongest first.
  const needs: Array<{ tier: number; reason: AttentionReason }> = [];
  if (input.overdueToMe > 0) {
    needs.push({
      tier: 6,
      reason: { code: 'overdue', label: plural(input.overdueToMe, 'Overdue', '{n} overdue') },
    });
  }
  if (input.dueSoonToMe > 0)
    needs.push({ tier: 5, reason: { code: 'due_soon', label: 'Due soon' } });
  if (input.openRequestsToMe > 0) {
    needs.push({
      tier: 4,
      reason: {
        code: 'request_to_you',
        label: plural(input.openRequestsToMe, 'Asked you to do something', '{n} requests for you'),
      },
    });
  }
  if (input.unreadMentions > 0)
    needs.push({ tier: 3, reason: { code: 'mentioned_you', label: 'Mentioned you' } });
  const inbound = input.pendingInbound;
  if (inbound && !inbound.dismissed && (inbound.isRequest || inbound.isQuestion)) {
    needs.push({
      tier: 2,
      reason: inbound.isRequest
        ? { code: 'request_to_you', label: 'Asked you to do something' }
        : { code: 'asked_you', label: 'Asked you a question' },
    });
  }
  if (input.followUpDue)
    needs.push({ tier: 1, reason: { code: 'follow_up_due', label: 'No reply yet — follow up?' } });

  // Only the strongest signals override the user's own "archive", "mute" and "quiet".
  const breaksThrough =
    input.overdueToMe > 0 || input.unreadMentions > 0 || input.openRequestsToMe > 0;

  if (input.archived && !breaksThrough) {
    return { section: 'archived', reasons: [], rank: at };
  }
  if (input.isMessageRequest) {
    return {
      section: 'requests',
      reasons: [{ code: 'message_request', label: 'Not connected yet' }],
      rank: at,
    };
  }
  if ((muted || input.override === 'quiet') && !breaksThrough) {
    reasons.push(
      input.override === 'quiet'
        ? { code: 'you_marked_quiet', label: 'You marked this quiet' }
        : { code: 'muted', label: 'Muted' },
    );
    return { section: 'quiet', reasons, rank: at };
  }

  if (needs.length > 0) {
    needs.sort((a, b) => b.tier - a.tier);
    const top = needs[0]!.tier;
    const seen = new Set<ReasonCode>();
    for (const n of needs) {
      if (seen.has(n.reason.code)) continue;
      seen.add(n.reason.code);
      reasons.push(n.reason);
    }
    if (input.relationship?.label)
      reasons.push({ code: 'priority_relationship', label: input.relationship.label });
    return { section: 'needs_you', reasons, rank: top * 1e13 + at + pinnedBoost };
  }

  const priority =
    input.override === 'priority' ? 'priority' : (input.relationship?.priorityNow ?? 'normal');
  const waiting = input.waitingOnThem > 0 || input.awaitingReply !== null;

  if (waiting && input.unreadCount === 0) {
    if (input.waitingOnThem > 0) {
      reasons.push({
        code: 'waiting_on_them',
        label: plural(input.waitingOnThem, 'You’re waiting on them', 'Waiting on {n} things'),
      });
    } else {
      reasons.push({ code: 'awaiting_reply', label: 'Waiting for a reply' });
    }
    return { section: 'waiting', reasons, rank: at + pinnedBoost };
  }

  if (input.unreadCount > 0) {
    reasons.push({ code: 'unread', label: plural(input.unreadCount, '1 new', '{n} new') });
  }
  if (waiting) reasons.push({ code: 'waiting_on_them', label: 'You’re waiting on them' });

  if (priority === 'priority' && input.unreadCount > 0) {
    reasons.unshift(
      input.override === 'priority'
        ? { code: 'you_marked_priority', label: 'You marked this priority' }
        : { code: 'priority_relationship', label: input.relationship?.label ?? 'Priority' },
    );
    return { section: 'important', reasons, rank: at + pinnedBoost };
  }

  if (priority === 'quiet' && input.override !== 'priority') {
    reasons.unshift({
      code: 'quiet_relationship',
      label: `${input.relationship?.label ?? 'This relationship'} · quiet`,
    });
    return { section: 'quiet', reasons, rank: at };
  }

  if (input.pinned) reasons.push({ code: 'pinned', label: 'Pinned' });
  return { section: 'recent', reasons, rank: at + pinnedBoost };
}

export interface Classified<T> {
  item: T;
  result: AttentionResult;
}

/** Group items into sections, each sorted by rank. Empty sections are omitted. */
export function groupBySection<T>(
  items: T[],
  classify: (item: T) => AttentionResult,
): Array<{ section: AttentionSection; label: string; items: Array<Classified<T>> }> {
  const buckets = new Map<AttentionSection, Array<Classified<T>>>();
  for (const item of items) {
    const result = classify(item);
    const list = buckets.get(result.section) ?? [];
    list.push({ item, result });
    buckets.set(result.section, list);
  }
  return ATTENTION_SECTIONS.filter((s) => buckets.has(s)).map((section) => ({
    section,
    label: SECTION_LABELS[section],
    items: buckets.get(section)!.sort((a, b) => b.result.rank - a.result.rank),
  }));
}

/** "3 need you" — the headline count the brand voice uses instead of unread totals. */
export function attentionHeadline(counts: Partial<Record<AttentionSection, number>>): string {
  const needs = counts.needs_you ?? 0;
  if (needs > 0) return needs === 1 ? '1 needs you' : `${needs} need you`;
  const important = counts.important ?? 0;
  if (important > 0) return important === 1 ? '1 important' : `${important} important`;
  return 'You’re all caught up';
}
