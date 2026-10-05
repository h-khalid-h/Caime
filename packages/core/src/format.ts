/**
 * Formatting shared by every client and by notifications. Locale-aware through Intl; names are
 * treated as opaque strings in any script (PRODUCT-REVIEW R28).
 */

import type { Rhythm } from './api';
import { type CallKind, type CallOutcome, callText } from './calls';
import { msg, tr } from './i18n';
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

/**
 * A group at a glance (PRD §57): instead of only how many messages, "6 people · 3 decisions ·
 * 4 open · 8 files · Friday". Only what it has; `next` is the soonest date already said.
 */
export function contextLine(c: {
  people: number;
  decisions: number;
  openItems: number;
  files: number;
  next: string | null;
}): string {
  const n = (count: number, one: string, many: string) =>
    count > 0 ? `${count} ${count === 1 ? one : many}` : null;
  return [
    n(c.people, 'person', 'people'),
    n(c.decisions, 'decision', 'decisions'),
    c.openItems > 0 ? `${c.openItems} open` : null,
    n(c.files, 'file', 'files'),
    c.next,
  ]
    .filter(Boolean)
    .join(' · ');
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
        : tr('{join} and {names}', {
            join: names.slice(0, -1).join(', '),
            names: names[names.length - 1],
          });
    }
  }
  const rest = names.length - (max - 1);
  return tr('{join} and {rest} others', { join: names.slice(0, max - 1).join(', '), rest });
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
  if (diff < 60_000 && diff > -60_000) return tr('now');
  if (diff > 0 && diff < 3_600_000) return tr('{n}m', { n: Math.floor(diff / 60_000) });
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
    return tr('Yesterday');
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
  if (diff < 60_000 && diff > -60_000) return tr('just now');
  if (diff > 0 && diff < 3_600_000)
    return tr('{floor} min ago', { floor: Math.floor(diff / 60_000) });
  const p = zonedParts(t, timeZone);
  const n = zonedParts(now, timeZone);
  if (sameDay(p, n)) return tr('at {clock}', { clock: formatClock(iso, timeZone, locale) });
  const y = new Date(Date.UTC(n.year, n.month - 1, n.day - 1));
  if (sameDay(p, { year: y.getUTCFullYear(), month: y.getUTCMonth() + 1, day: y.getUTCDate() }))
    return tr('yesterday');
  if (diff > 0 && diff < 6 * 86_400_000)
    return tr('on {date}', { date: dateFormat(locale, { weekday: 'short', timeZone }).format(t) });
  return tr('on {date}', {
    date: dateFormat(locale, {
      month: 'short',
      day: 'numeric',
      year: p.year === n.year ? undefined : 'numeric',
      timeZone,
    }).format(t),
  });
}

/** Day separators in a conversation: "Today", "Yesterday", "Tuesday", "12 September 2025". */
export function formatDayHeading(iso: string, now: Date, timeZone: string, locale = 'en'): string {
  const t = new Date(iso);
  const p = zonedParts(t, timeZone);
  const n = zonedParts(now, timeZone);
  if (sameDay(p, n)) return tr('Today');
  const y = new Date(Date.UTC(n.year, n.month - 1, n.day - 1));
  if (sameDay(p, { year: y.getUTCFullYear(), month: y.getUTCMonth() + 1, day: y.getUTCDate() }))
    return tr('Yesterday');
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
  return tr('{value}at {formatClock}', {
    value: today ? '' : 'tomorrow ',
    formatClock: formatClock(iso, timeZone, locale),
  });
}

/**
 * How long a day with no time stays due: it's kept at 09:00 of that day (when.ts), and it's due
 * all day, so it's overdue only once the day is over, fifteen hours on (an hour either way on the
 * day clocks change).
 */
export const DAY_DUE_MS = 15 * 3_600_000;

/** When an action is overdue: at its time, or once its day is over when it has none. */
export function overdueAt(dueAt: string | Date, hasTime: boolean): number {
  return new Date(dueAt).getTime() + (hasTime ? 0 : DAY_DUE_MS);
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
  if (days === 0) return tr('Today{clock}', { clock });
  if (days === 1) return tr('Tomorrow{clock}', { clock });
  if (days === -1) return 'Yesterday';
  if (days < -1) return tr('{days} days ago', { days: -days });
  if (days < 7) return `${dateFormat(locale, { weekday: 'short', timeZone }).format(t)}${clock}`;
  return dateFormat(locale, { month: 'short', day: 'numeric', timeZone }).format(t);
}

/** When something is, as its reader says it: "Tomorrow 3:00 PM", "Sat 12 Oct, 11:00". */
export function formatWhenAt(
  at: string,
  hasTime: boolean,
  now: Date,
  timeZone: string,
  locale = 'en',
): string {
  const days = Math.abs(Date.parse(at) - now.getTime()) / 86_400_000;
  if (days < 6) return formatDue(at, now, timeZone, locale, hasTime);
  // Another year says which ("Fri, 12 Mar 2027"); this one needn't.
  const otherYear =
    Number.isFinite(Date.parse(at)) &&
    zonedParts(new Date(at), timeZone).year !== zonedParts(now, timeZone).year;
  const date = dateFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(otherYear ? { year: 'numeric' as const } : {}),
    timeZone,
  }).format(new Date(at));
  return hasTime ? `${date}, ${formatClock(at, timeZone, locale)}` : date;
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

/**
 * How many places after the point a currency's amounts have (ISO 4217): 3 for the Kuwaiti dinar,
 * 0 for the yen, 2 for most, and for an amount in no currency.
 */
const EXPONENTS: Readonly<Record<string, number>> = {
  BHD: 3,
  IQD: 3,
  JOD: 3,
  KWD: 3,
  LYD: 3,
  OMR: 3,
  TND: 3,
  BIF: 0,
  CLP: 0,
  DJF: 0,
  GNF: 0,
  ISK: 0,
  JPY: 0,
  KMF: 0,
  KRW: 0,
  PYG: 0,
  RWF: 0,
  UGX: 0,
  VND: 0,
  VUV: 0,
  XAF: 0,
  XOF: 0,
  XPF: 0,
};

export function minorUnits(currency: string | null): number {
  return currency && Object.hasOwn(EXPONENTS, currency) ? (EXPONENTS[currency] as number) : 2;
}

/** An amount as its currency keeps it: to the dinar's thousandth, the yen, most to the cent. */
export function roundAmount(value: number, currency: string | null): number {
  const scale = 10 ** minorUnits(currency);
  return Math.round(value * scale) / scale;
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
    purpose?: string | null;
    source?: string;
  };
  const by = p.byId && p.byId === viewerId ? 'You' : (p.by ?? 'Someone');
  const them = p.userId && p.userId === viewerId ? 'you' : (p.name ?? 'someone');
  switch (p.event) {
    // An organization erased a customer's conversation at their request (R54): the customer
    // reads the organization's name (the business mask), the team who did it.
    case 'erased':
      return them === 'you'
        ? tr('{by} erased this conversation’s messages at your request.', { by })
        : tr('{by} erased this conversation’s messages at {them}’s request.', { by, them });
    case 'group_created':
      return p.title
        ? tr('{by} created “{title}”', { by, title: p.title })
        : tr('{by} created the group', { by });
    case 'topic_created':
      return p.title
        ? tr('{by} started this topic in “{title}”', { by, title: p.title })
        : tr('{by} started this topic', { by });
    case 'topic_started':
      return p.title
        ? tr('{by} started a topic: {title}', { by, title: p.title })
        : tr('{by} started a topic', { by });
    case 'space_created':
      return p.title
        ? tr('{by} started the space “{title}”', { by, title: p.title })
        : tr('{by} started the space', { by });
    case 'space_renamed':
      return p.title
        ? tr('{by} renamed the space “{title}”', { by, title: p.title })
        : tr('{by} renamed the space', { by });
    case 'renamed':
      return p.title
        ? tr('{by} renamed the conversation “{title}”', { by, title: p.title })
        : tr('{by} renamed the conversation', { by });
    case 'message_pinned':
      return tr('{by} pinned a message', { by });
    case 'purpose_changed':
      return p.purpose
        ? tr('{by} changed what it’s for: {purpose}', { by, purpose: p.purpose })
        : tr('{by} took away what it’s for', { by });
    case 'member_joined':
      return `${p.name ?? by} joined`;
    case 'members_added':
      return p.names?.length
        ? tr('{by} added {joinNames}', { by, joinNames: joinNames(p.names) })
        : tr('{by} added people', { by });
    case 'member_left':
      return `${p.name ?? by} left`;
    case 'member_removed':
      return tr('{by} removed {them}', { by, them });
    case 'owner_changed':
      return them === 'you'
        ? tr('You own the group now')
        : tr('{name} owns the group now', { name: p.name ?? tr('Someone') });
    case 'admin_added':
      return tr('{by} made {them} an admin', { by, them });
    case 'admin_removed':
      return them === 'you'
        ? tr('You’re no longer an admin')
        : tr('{name} is no longer an admin', { name: p.name ?? tr('Someone') });
    case 'imported': {
      const from = p.source === 'whatsapp' ? 'WhatsApp' : 'another app';
      return tr('{by} brought this chat over from {from}. What’s above was written there.', {
        by,
        from,
      });
    }
    case 'decision_recorded':
      return p.title
        ? tr('{by} recorded a decision: {title}', { by, title: p.title })
        : tr('{by} recorded a decision', { by });
    case 'retention_changed':
      return typeof p.days === 'number'
        ? tr('{by} set new messages to disappear after {retentionText}', {
            by,
            retentionText: retentionText(p.days),
          })
        : tr('{by} turned off disappearing messages', { by });
    case 'call': {
      const c = payload as {
        kind?: CallKind;
        outcome?: CallOutcome;
        seconds?: number;
        group?: boolean;
      };
      return callText(
        c.kind ?? 'voice',
        c.outcome ?? 'missed',
        c.seconds ?? 0,
        Boolean(viewerId && p.byId === viewerId),
        c.group === true,
      );
    }
    default:
      return tr('Conversation updated');
  }
}

/**
 * How a conversation is named in a list: a topic (PRD §58) with who, or which group, it's of:
 * "Sarah · Project Alpha", "Book club · Middlemarch".
 */
export function listTitle(c: {
  title: string;
  topic: string | null;
  other?: { displayName: string } | null;
}): string {
  return c.topic ? `${c.other?.displayName ?? c.title} · ${c.topic}` : c.title;
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
  /** A private conversation's (R18): nothing in it to preview. */
  sealed?: unknown;
}): string {
  if (m.deleted) return tr('Message deleted');
  if (m.sealed) return tr('Encrypted message');
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
      return m.body ? `📷 ${previewText(m.body, 80)}` : `📷 ${tr('Photo')}`;
    case 'file':
      return m.body ? `📎 ${previewText(m.body, 80)}` : `📎 ${tr('File')}`;
    case 'voice':
      return `🎙 ${tr('Voice message')}`;
    case 'location':
      return payload.live ? `📍 ${tr('Live location')}` : `📍 ${tr('Location')}`;
    case 'contact':
      return `👤 ${tr('Contact')}`;
    case 'poll':
      return `📊 ${previewText(String(payload.question ?? tr('Poll')), 80)}`;
    case 'sticker':
      return tr('Sticker');
    case 'system':
      return previewText(systemText(m.payload), 80);
    case 'kit':
      // Kit cards carry their kit's name ("Meeting: Venue walkthrough"); request cards don't.
      return previewText(
        payload.label
          ? `${String(payload.label)}: ${String(payload.title ?? '')}`
          : String(payload.title ?? tr('Card')),
        80,
      );
    default:
      return previewText(m.body ?? '');
  }
}

/**
 * How often two people have talked lately (PRD §67, §71), from the weeks of the last twelve they
 * wrote in: a word for the person, never a count to compare people by.
 */
export function rhythmOf(weeks: number, everTalked: boolean): Rhythm | null {
  if (weeks >= 8) return 'most_weeks';
  if (weeks >= 3) return 'now_and_then';
  if (weeks >= 1) return 'rarely';
  return everTalked ? 'not_lately' : null;
}

export const RHYTHM_TEXT: Record<Rhythm, string> = {
  most_weeks: msg('Most weeks'),
  now_and_then: msg('Now and then'),
  rarely: msg('Once in a while'),
  not_lately: msg('Not lately'),
};
