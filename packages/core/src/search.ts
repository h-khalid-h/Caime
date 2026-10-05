/**
 * Search query understanding (PRD §25). Turns what people type into a structured query the server
 * executes across people, relationships, organizations, messages, assets, actions and contexts.
 * Deterministic patterns cover the common shapes; with AI enabled, a model can fill the same
 * structure for anything else (R17).
 */

import { tr } from './i18n';
import { findRole, relationshipFromWord, SPHERES, type Sphere } from './taxonomy';

export const SEARCH_SCOPES = [
  'all',
  'people',
  'messages',
  'files',
  'links',
  'tasks',
  'waiting',
  'decisions',
  'contexts',
] as const;
export type SearchScope = (typeof SEARCH_SCOPES)[number];

export const FILE_KINDS = ['image', 'video', 'audio', 'document', 'pdf'] as const;
export type FileKind = (typeof FILE_KINDS)[number];

export interface ParsedQuery {
  raw: string;
  scope: SearchScope;
  /** Free text to match. */
  text: string;
  /** A person named in the query ("from Sarah", "Sarah said"). */
  person: string | null;
  relationship: { sphere: Sphere; role?: string } | null;
  fileKind: FileKind | null;
  /** For tasks: who asked whom. */
  direction: 'asked_me' | 'i_asked' | null;
  /**
   * When ("photos from last week", "decisions in March"): the days to search, as YYYY-MM-DD
   * from `since` up to but not including `until`, and the words as written.
   */
  period: { since: string; until: string; label: string } | null;
  /** How the query was understood, shown under the search box. */
  interpretation: string;
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTH_NAMES = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];
const PERIOD_WORDS =
  /(?:^|\s)(?:(?:from|in|during|since|on|of)\s+)?((?:last|this|past)\s+(?:week|month|year)|yesterday|today|last\s+(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)|(?:in\s+)?(?:january|february|march|april|may|june|july|august|september|october|november|december)(?:\s+(\d{4}))?|(\d{4}))$/i;

const iso = (d: Date) => d.toISOString().slice(0, 10);
const utcDay = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));

/**
 * The days a phrase at the end of a query names, by the calendar ("last week" is Monday to
 * Sunday before this week's; "March" is the last March), and the query without it. Days, not
 * instants: the search is by day, in UTC, which is near enough for "last week".
 */
export function splitPeriod(q: string, now: Date): { rest: string; period: ParsedQuery['period'] } {
  const m = PERIOD_WORDS.exec(q);
  if (!m) return { rest: q, period: null };
  const words = m[1]!
    .toLowerCase()
    .replace(/^in\s+/, '')
    .replace(/\s+/g, ' ');
  const y = now.getUTCFullYear();
  const mo = now.getUTCMonth();
  const d = now.getUTCDate();
  const today = utcDay(y, mo, d);
  // Weeks start on Monday here; a reader's own week is the inbox's affair, not a search's.
  const sinceMonday = (now.getUTCDay() + 6) % 7;
  let since: Date;
  let until: Date;
  if (words === 'yesterday') {
    since = utcDay(y, mo, d - 1);
    until = today;
  } else if (words === 'today') {
    since = today;
    until = utcDay(y, mo, d + 1);
  } else if (/^(last|past) week$/.test(words)) {
    until = utcDay(y, mo, d - sinceMonday);
    since = utcDay(y, mo, d - sinceMonday - 7);
  } else if (words === 'this week') {
    since = utcDay(y, mo, d - sinceMonday);
    until = utcDay(y, mo, d + 1);
  } else if (/^(last|past) month$/.test(words)) {
    since = utcDay(y, mo - 1, 1);
    until = utcDay(y, mo, 1);
  } else if (words === 'this month') {
    since = utcDay(y, mo, 1);
    until = utcDay(y, mo, d + 1);
  } else if (/^(last|past) year$/.test(words)) {
    since = utcDay(y - 1, 0, 1);
    until = utcDay(y, 0, 1);
  } else if (words === 'this year') {
    since = utcDay(y, 0, 1);
    until = utcDay(y, mo, d + 1);
  } else if (words.startsWith('last ')) {
    const weekday = WEEKDAYS.indexOf(words.slice(5));
    let back = (now.getUTCDay() - weekday + 7) % 7;
    if (back === 0) back = 7;
    since = utcDay(y, mo, d - back);
    until = utcDay(y, mo, d - back + 1);
  } else if (/^\d{4}$/.test(words)) {
    const year = Number(words);
    since = utcDay(year, 0, 1);
    until = utcDay(year + 1, 0, 1);
  } else {
    const [name, yearWord] = words.split(' ');
    const month = MONTH_NAMES.indexOf(name ?? '');
    if (month < 0) return { rest: q, period: null };
    const year = yearWord ? Number(yearWord) : month <= mo ? y : y - 1;
    since = utcDay(year, month, 1);
    until = utcDay(year, month + 1, 1);
  }
  const rest = q
    .slice(0, m.index)
    .trim()
    .replace(/\s+(?:from|in|during|since|on|of)$/i, '')
    .trim();
  return { rest, period: { since: iso(since), until: iso(until), label: m[1]!.trim() } };
}

const FILE_WORDS: Array<[RegExp, FileKind | null, SearchScope]> = [
  [/^pdfs?$/i, 'pdf', 'files'],
  [/^(documents?|docs?)$/i, 'document', 'files'],
  [/^(photos?|pictures?|pics?|images?)$/i, 'image', 'files'],
  [/^videos?$/i, 'video', 'files'],
  [/^(voice notes?|voice messages?|audio|recordings?)$/i, 'audio', 'files'],
  [/^(files?|attachments?)$/i, null, 'files'],
  [/^links?$/i, null, 'links'],
];

function clean(s: string): string {
  return s
    .trim()
    .replace(/[?.!]+$/, '')
    .trim();
}

function base(raw: string): ParsedQuery {
  return {
    raw,
    scope: 'all',
    text: clean(raw),
    person: null,
    relationship: null,
    fileKind: null,
    direction: null,
    period: null,
    interpretation: '',
  };
}

export function parseSearchQuery(raw: string, opts: { now?: Date } = {}): ParsedQuery {
  const q0 = clean(raw);
  const out = base(raw);
  if (!q0) return out;
  // When, first: "photos from last week" is photos, in those days, from nobody in particular.
  const { rest, period } = splitPeriod(q0, opts.now ?? new Date());
  if (!period) return parseWords(q0, out);
  if (!rest) return { ...out, text: '', period, interpretation: period.label };
  const parsed = parseWords(rest, { ...out, text: rest, period });
  return { ...parsed, interpretation: `${parsed.interpretation} · ${period.label}` };
}

function parseWords(q: string, out: ParsedQuery): ParsedQuery {
  // "PDFs from Sarah", "photos with Ahmed", "links from DATA C"
  let m = /^(.+?)\s+(?:from|by|with|of)\s+(.+)$/i.exec(q);
  if (m) {
    const file = FILE_WORDS.find(([re]) => re.test(m![1]!.trim()));
    if (file) {
      return {
        ...out,
        scope: file[2],
        fileKind: file[1],
        person: m[2]!.trim(),
        text: '',
        interpretation: `${file[2] === 'links' ? 'Links' : file[1] ? `${m[1]!.trim()}` : 'Files'} from ${m[2]!.trim()}`,
      };
    }
  }
  const fileOnly = FILE_WORDS.find(([re]) => re.test(q));
  if (fileOnly) {
    return {
      ...out,
      scope: fileOnly[2],
      fileKind: fileOnly[1],
      text: '',
      interpretation: tr('All {toLowerCase}', { toLowerCase: q.toLowerCase() }),
    };
  }

  // "things Sarah asked me to do", "what did Sarah ask me", "what I asked Sarah"
  m =
    /^(?:things|what|stuff)\s+(.+?)\s+asked\s+me(?:\s+to\s+do|\s+for)?$/i.exec(q) ??
    /^what\s+did\s+(.+?)\s+ask\s+(?:me|me\s+to\s+do|me\s+for)$/i.exec(q);
  if (m) {
    return {
      ...out,
      scope: 'tasks',
      person: m[1]!.trim(),
      direction: 'asked_me',
      text: '',
      interpretation: tr('What {trim} asked you to do', { trim: m[1]!.trim() }),
    };
  }
  m = /^(?:things|what)\s+i\s+asked\s+(.+?)(?:\s+to\s+do|\s+for)?$/i.exec(q);
  if (m) {
    return {
      ...out,
      scope: 'tasks',
      person: m[1]!.trim(),
      direction: 'i_asked',
      text: '',
      interpretation: tr('What you asked {trim} to do', { trim: m[1]!.trim() }),
    };
  }

  // "waiting on Sarah", "what am I waiting for"
  m = /^(?:waiting\s+(?:on|for)|what\s+am\s+i\s+waiting\s+(?:on|for)\s+from)\s+(.+)$/i.exec(q);
  if (m)
    return {
      ...out,
      scope: 'waiting',
      person: m[1]!.trim(),
      text: '',
      interpretation: tr("What you're waiting for from {trim}", { trim: m[1]!.trim() }),
    };
  if (/^(?:what\s+am\s+i\s+waiting\s+(?:on|for)|waiting)$/i.test(q)) {
    return {
      ...out,
      scope: 'waiting',
      text: '',
      interpretation: tr("Everything you're waiting for"),
    };
  }

  // "what did Sarah say about the migration"
  m = /^what\s+did\s+(.+?)\s+(?:say|write|mention|send)\s+(?:about|on|regarding)\s+(.+)$/i.exec(q);
  if (m) {
    return {
      ...out,
      scope: 'messages',
      person: m[1]!.trim(),
      text: m[2]!.trim(),
      interpretation: `${m[1]!.trim()} on “${m[2]!.trim()}”`,
    };
  }

  // "decisions about pricing", "decisions"
  m = /^decisions?(?:\s+(?:about|on|for|in|with)\s+(.+))?$/i.exec(q);
  if (m) {
    return {
      ...out,
      scope: 'decisions',
      text: m[1]?.trim() ?? '',
      interpretation: m[1]
        ? tr('Decisions about “{trim}”', { trim: m[1].trim() })
        : tr('All decisions'),
    };
  }

  // "tasks", "my tasks", "tasks from Sarah"
  m = /^(?:my\s+)?(?:tasks?|to-?dos?|actions?)(?:\s+(?:from|with|for)\s+(.+))?$/i.exec(q);
  if (m) {
    return {
      ...out,
      scope: 'tasks',
      person: m[1]?.trim() ?? null,
      text: '',
      interpretation: m[1] ? tr('Tasks with {trim}', { trim: m[1].trim() }) : tr('Your tasks'),
    };
  }

  // "Project Alpha conversations"
  m = /^(.+?)\s+(?:conversations?|chats?|threads?|context)$/i.exec(q);
  if (m)
    return {
      ...out,
      scope: 'contexts',
      text: m[1]!.trim(),
      interpretation: tr('Conversations about “{trim}”', { trim: m[1]!.trim() }),
    };

  // "managers", "my customers", "family"
  const rel = relationshipFromWord(q.replace(/^(?:my|all(?:\s+my)?)\s+/i, ''));
  if (rel) {
    return {
      ...out,
      scope: 'people',
      relationship: rel,
      text: '',
      interpretation: tr('People you classified as {toLowerCase}', {
        toLowerCase: q.replace(/^(?:my|all(?:\s+my)?)\s+/i, '').toLowerCase(),
      }),
    };
  }

  // "from Sarah: proposal", "proposal from Sarah"
  m = /^(.+?)\s+from\s+(.+)$/i.exec(q);
  if (m) {
    return {
      ...out,
      scope: 'messages',
      person: m[2]!.trim(),
      text: m[1]!.trim(),
      interpretation: `“${m[1]!.trim()}” from ${m[2]!.trim()}`,
    };
  }

  return { ...out, interpretation: tr('Everything matching “{q}”', { q }) };
}

/** The rules recognised nothing in it: a plain text match across everything. */
export function isPlainText(parsed: ParsedQuery): boolean {
  return (
    parsed.scope === 'all' &&
    !parsed.person &&
    !parsed.relationship &&
    !parsed.fileKind &&
    !parsed.direction &&
    !parsed.period
  );
}

const QUESTION_START =
  /^(what|when|who|whom|which|where|did|does|do|has|have|had|is|are|was|were|show|find|list|anything|everything|all|any)\b/i;
const ARABIC_QUESTION = /^(ماذا|متى|من|هل|أين|اين|ما|كل|اي|أي|وريني|ابحث)\b/u;

/**
 * Reads like a question or a sentence rather than a term: three words or more, or a question
 * word first. Only these are worth a model's reading when the rules understood nothing (R17);
 * a name or a word is a text match and stays one.
 */
export function looksLikeSentence(raw: string): boolean {
  const q = clean(raw);
  if (!q) return false;
  const words = q.split(/\s+/).filter(Boolean);
  return words.length >= 3 || QUESTION_START.test(q) || ARABIC_QUESTION.test(q);
}

/** What a model may say a search means: the same fields the rules fill, as plain values. */
export interface SearchUnderstanding {
  scope: SearchScope;
  text: string;
  person: string | null;
  sphere: string | null;
  role: string | null;
  fileKind: FileKind | null;
  direction: 'asked_me' | 'i_asked' | null;
  interpretation: string;
}

const clip = (s: string, max: number) => {
  const one = s.replace(/\s+/g, ' ').trim();
  return one.length > max ? `${one.slice(0, max - 1).trimEnd()}…` : one;
};

/**
 * A model's understanding as a query the server runs: every value checked against what Caime
 * knows (a sphere and role from the taxonomy, a scope and file kind from the lists), anything
 * else dropped, so the model can widen what's understood but never what's searched.
 */
export function fromUnderstanding(raw: string, u: SearchUnderstanding): ParsedQuery {
  const sphere = (SPHERES as readonly string[]).includes(u.sphere ?? '')
    ? (u.sphere as Sphere)
    : null;
  const role = sphere && u.role && findRole(sphere, u.role) ? u.role : undefined;
  const scope = (SEARCH_SCOPES as readonly string[]).includes(u.scope) ? u.scope : 'all';
  const fileKind = (FILE_KINDS as readonly string[]).includes(u.fileKind ?? '') ? u.fileKind : null;
  const interpretation =
    clip(u.interpretation, 120) || tr('Everything matching “{q}”', { q: clean(raw) });
  return {
    raw,
    scope,
    text: clip(u.text, 200),
    person: u.person ? clip(u.person, 80) : null,
    relationship: sphere ? (role ? { sphere, role } : { sphere }) : null,
    fileKind,
    period: null,
    direction: u.direction === 'asked_me' || u.direction === 'i_asked' ? u.direction : null,
    interpretation,
  };
}
