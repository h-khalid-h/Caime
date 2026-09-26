/**
 * Formatting shared by every client and by notifications. Locale-aware through Intl; names are
 * treated as opaque strings in any script (PRODUCT-REVIEW R28).
 */
import { dateFormat, numberFormat, safeLocale } from './locale';
import { zonedParts } from './time';

/** One or two letters for an avatar: "Sarah Smith" → "SS", "سارة" → "س", "李明" → "李". */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const first = [...words[0]!][0] ?? '?';
  if (words.length === 1) return first.toUpperCase();
  const last = [...words[words.length - 1]!][0] ?? '';
  // Scripts without case or with joined letters read better with one letter.
  if (/[؀-ۿ֐-׿一-鿿぀-ヿ가-힯]/.test(first)) return first;
  return (first + last).toUpperCase();
}

/** First name for friendly copy, falling back to the whole name for single names. */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/** "Sarah", "Sarah and Ahmed", "Sarah, Ahmed and Lina", "Sarah, Ahmed and 3 others". */
export function joinNames(names: string[], max = 3, locale = 'en'): string {
  if (names.length === 0) return '';
  if (names.length <= max) {
    try {
      return new Intl.ListFormat(safeLocale(locale), { style: 'long', type: 'conjunction' }).format(
        names,
      );
    } catch {
      return names.length === 1
        ? names[0]!
        : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
    }
  }
  const rest = names.length - (max - 1);
  return `${names.slice(0, max - 1).join(', ')} and ${rest} others`;
}

const RTL = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
const LTR = /[A-Za-zÀ-ɏͰ-ϿЀ-ӿ]/;

/** Direction of a message from its first strong character (R21). */
export function textDirection(text: string): 'rtl' | 'ltr' {
  for (const ch of text) {
    if (RTL.test(ch)) return 'rtl';
    if (LTR.test(ch)) return 'ltr';
  }
  return 'ltr';
}

function sameDay(
  a: { year: number; month: number; day: number },
  b: { year: number; month: number; day: number },
) {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

/**
 * Inbox timestamps: "now", "5m", "3:42 PM", "Yesterday", "Tue", "Sep 12", "12/09/2025".
 * Always the viewer's time zone and locale.
 */
export function formatListTime(iso: string, now: Date, timeZone: string, locale = 'en'): string {
  const t = new Date(iso);
  const diff = now.getTime() - t.getTime();
  if (diff < 60_000 && diff > -60_000) return 'now';
  if (diff > 0 && diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  const p = zonedParts(t, timeZone);
  const n = zonedParts(now, timeZone);
  if (sameDay(p, n)) {
    return dateFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone }).format(t);
  }
  const yesterday = new Date(Date.UTC(n.year, n.month - 1, n.day - 1));
  if (
    sameDay(p, {
      year: yesterday.getUTCFullYear(),
      month: yesterday.getUTCMonth() + 1,
      day: yesterday.getUTCDate(),
    })
  ) {
    return 'Yesterday';
  }
  if (diff > 0 && diff < 6 * 86_400_000) {
    return dateFormat(locale, { weekday: 'short', timeZone }).format(t);
  }
  if (p.year === n.year)
    return dateFormat(locale, { month: 'short', day: 'numeric', timeZone }).format(t);
  return dateFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone,
  }).format(t);
}

/**
 * When something happened, as a sentence goes on ("used …", "allowed …"): "just now",
 * "15 min ago", "at 7:00 AM", "yesterday", "on Sat", "on Aug 1", "on Aug 1, 2025".
 */
export function formatWhen(iso: string, now: Date, timeZone: string, locale = 'en'): string {
  const t = new Date(iso);
  const diff = now.getTime() - t.getTime();
  if (diff < 60_000 && diff > -60_000) return 'just now';
  if (diff > 0 && diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
  const p = zonedParts(t, timeZone);
  const n = zonedParts(now, timeZone);
  if (sameDay(p, n)) return `at ${formatClock(iso, timeZone, locale)}`;
  const y = new Date(Date.UTC(n.year, n.month - 1, n.day - 1));
  if (sameDay(p, { year: y.getUTCFullYear(), month: y.getUTCMonth() + 1, day: y.getUTCDate() }))
    return 'yesterday';
  if (diff > 0 && diff < 6 * 86_400_000)
    return `on ${dateFormat(locale, { weekday: 'short', timeZone }).format(t)}`;
  return `on ${dateFormat(locale, {
    month: 'short',
    day: 'numeric',
    year: p.year === n.year ? undefined : 'numeric',
    timeZone,
  }).format(t)}`;
}

/** Day separators in a conversation: "Today", "Yesterday", "Tuesday", "12 September 2025". */
export function formatDayHeading(iso: string, now: Date, timeZone: string, locale = 'en'): string {
  const t = new Date(iso);
  const p = zonedParts(t, timeZone);
  const n = zonedParts(now, timeZone);
  if (sameDay(p, n)) return 'Today';
  const y = new Date(Date.UTC(n.year, n.month - 1, n.day - 1));
  if (sameDay(p, { year: y.getUTCFullYear(), month: y.getUTCMonth() + 1, day: y.getUTCDate() }))
    return 'Yesterday';
  const diff = now.getTime() - t.getTime();
  if (diff > 0 && diff < 6 * 86_400_000)
    return dateFormat(locale, { weekday: 'long', timeZone }).format(t);
  return dateFormat(locale, {
    day: 'numeric',
    month: 'long',
    year: p.year === n.year ? undefined : 'numeric',
    timeZone,
  }).format(t);
}

/** Message time inside a bubble: "3:42 PM". */
export function formatClock(iso: string, timeZone: string, locale = 'en'): string {
  return dateFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone }).format(new Date(iso));
}

/**
 * A time within the next day, as a sentence ends it: "at 3:32 PM", or "tomorrow at 9:00 AM"
 * when it's already tomorrow where the reader is.
 */
export function formatSoon(iso: string, now: Date, timeZone: string, locale = 'en'): string {
  const a = zonedParts(new Date(iso), timeZone);
  const n = zonedParts(now, timeZone);
  const today = a.year === n.year && a.month === n.month && a.day === n.day;
  return `${today ? '' : 'tomorrow '}at ${formatClock(iso, timeZone, locale)}`;
}

/** Due dates: "Today", "Tomorrow 3:00 PM", "Fri", "Oct 15", "2 days ago". */
export function formatDue(
  iso: string,
  now: Date,
  timeZone: string,
  locale = 'en',
  hasTime = false,
): string {
  const t = new Date(iso);
  const p = zonedParts(t, timeZone);
  const n = zonedParts(now, timeZone);
  const dayMs = Date.UTC(p.year, p.month - 1, p.day) - Date.UTC(n.year, n.month - 1, n.day);
  const days = Math.round(dayMs / 86_400_000);
  const clock = hasTime ? ` ${formatClock(iso, timeZone, locale)}` : '';
  if (days === 0) return `Today${clock}`;
  if (days === 1) return `Tomorrow${clock}`;
  if (days === -1) return 'Yesterday';
  if (days < -1) return `${-days} days ago`;
  if (days < 7) return `${dateFormat(locale, { weekday: 'short', timeZone }).format(t)}${clock}`;
  return dateFormat(locale, { month: 'short', day: 'numeric', timeZone }).format(t);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = bytes / 1024;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  // "5 GB", not "5.0 GB"; "1.5 MB" keeps its tenth.
  return `${(v < 10 ? v.toFixed(1) : String(Math.round(v))).replace(/\.0$/, '')} ${units[u]}`;
}

export function formatAmount(value: number, currency: string | null, locale = 'en'): string {
  if (!currency) return numberFormat(locale).format(value);
  try {
    return numberFormat(locale, { style: 'currency', currency }).format(value);
  } catch {
    return `${numberFormat(locale).format(value)} ${currency}`;
  }
}

export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export function truncate(text: string, max: number): string {
  const chars = [...text];
  return chars.length <= max
    ? text
    : `${chars
        .slice(0, max - 1)
        .join('')
        .trimEnd()}…`;
}

/**
 * Search snippets mark the matched words with two private-use characters (the server removes
 * them from the text first, so a typed «quote» is never mistaken for a match).
 */
export const MATCH_START = '\uE000';
export const MATCH_END = '\uE001';

/** A snippet as plain and matched runs, for emphasis; the joined text is the plain snippet. */
export function snippetParts(snippet: string): Array<{ text: string; match: boolean }> {
  const parts: Array<{ text: string; match: boolean }> = [];
  let match = false;
  let run = '';
  for (const ch of snippet) {
    if (ch !== MATCH_START && ch !== MATCH_END) {
      run += ch;
      continue;
    }
    if (run) parts.push({ text: run, match });
    run = '';
    match = ch === MATCH_START;
  }
  if (run) parts.push({ text: run, match });
  return parts;
}

/** How long messages last: "24 hours", "7 days", "1 year". */
export function retentionText(days: number): string {
  if (days === 1) return '24 hours';
  if (days === 365) return '1 year';
  return `${days} days`;
}

/**
 * What a system message says ("You added Lina and Omar"). The server records names when it
 * writes the event, so the line reads the same later, even after someone leaves.
 */
export function systemText(payload: unknown, viewerId?: string | null): string {
  const p = (payload ?? {}) as {
    event?: string;
    byId?: string;
    by?: string;
    title?: string;
    names?: string[];
    name?: string;
    userId?: string;
    days?: number | null;
  };
  const by = p.byId && p.byId === viewerId ? 'You' : (p.by ?? 'Someone');
  const them = p.userId && p.userId === viewerId ? 'you' : (p.name ?? 'someone');
  switch (p.event) {
    case 'group_created':
      return p.title ? `${by} created “${p.title}”` : `${by} created the group`;
    case 'space_created':
      return p.title ? `${by} started the space “${p.title}”` : `${by} started the space`;
    case 'space_renamed':
      return p.title ? `${by} renamed the space “${p.title}”` : `${by} renamed the space`;
    case 'member_joined':
      return `${p.name ?? by} joined`;
    case 'members_added':
      return p.names?.length ? `${by} added ${joinNames(p.names)}` : `${by} added people`;
    case 'member_left':
      return `${p.name ?? by} left`;
    case 'member_removed':
      return `${by} removed ${them}`;
    case 'decision_recorded':
      return p.title ? `${by} recorded a decision: ${p.title}` : `${by} recorded a decision`;
    case 'retention_changed':
      return typeof p.days === 'number'
        ? `${by} set messages to disappear after ${retentionText(p.days)}`
        : `${by} turned off disappearing messages`;
    default:
      return 'Conversation updated';
  }
}

/** A message preview for lists and notifications: first line, trimmed. */
export function previewText(text: string, max = 90): string {
  return truncate(text.replace(/\s+/g, ' ').trim(), max);
}

/**
 * The one-line preview of a message for inbox rows, notifications and replies. Shared so the
 * server's inbox and the client's live update always read the same.
 */
export function messagePreview(m: {
  kind: string;
  body: string | null;
  payload: unknown;
  deleted: boolean;
}): string {
  if (m.deleted) return 'Message deleted';
  const payload = (m.payload ?? {}) as {
    question?: unknown;
    title?: unknown;
    label?: unknown;
    live?: unknown;
  };
  switch (m.kind) {
    case 'text':
      return previewText(m.body ?? '');
    case 'media':
      return m.body ? `📷 ${previewText(m.body, 80)}` : '📷 Photo';
    case 'file':
      return m.body ? `📎 ${previewText(m.body, 80)}` : '📎 File';
    case 'voice':
      return '🎙 Voice message';
    case 'location':
      return payload.live ? '📍 Live location' : '📍 Location';
    case 'contact':
      return '👤 Contact';
    case 'poll':
      return `📊 ${previewText(String(payload.question ?? 'Poll'), 80)}`;
    case 'sticker':
      return 'Sticker';
    case 'system':
      return previewText(systemText(m.payload), 80);
    case 'kit':
      // Kit cards carry their kit's name ("Meeting: Venue walkthrough"); request cards don't.
      return previewText(
        payload.label
          ? `${String(payload.label)}: ${String(payload.title ?? '')}`
          : String(payload.title ?? 'Card'),
        80,
      );
    default:
      return previewText(m.body ?? '');
  }
}
