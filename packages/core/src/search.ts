/**
 * Search query understanding (PRD §25). Turns what people type into a structured query the server
 * executes across people, relationships, organizations, messages, assets, actions and contexts.
 * Deterministic patterns cover the common shapes in every interface language (English, Arabic as
 * it's typed, French, Turkish: convention 17); with AI enabled, a model can fill the same structure
 * for anything else (R17).
 */

import { asciiDigits } from './digits';
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

/** A period, whatever language named it. */
type Period =
  | { kind: 'yesterday' | 'today' }
  | { kind: 'last' | 'this'; unit: 'week' | 'month' | 'year' }
  | { kind: 'weekday'; day: number }
  | { kind: 'month'; month: number; year: number | null }
  | { kind: 'year'; year: number };

/** Each language's names for the weekdays and months, Sunday and January first. */
const DAY_NAMES: string[][] = [
  WEEKDAYS,
  ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'],
  ['pazar', 'pazartesi', 'salı', 'çarşamba', 'perşembe', 'cuma', 'cumartesi'],
  ['الاحد', 'الاثنين', 'الثلاثاء', 'الاربعاء', 'الخميس', 'الجمعه', 'السبت'],
];
const MONTH_NAMES: string[][] = [
  [
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
  ],
  [
    'janvier',
    'février',
    'mars',
    'avril',
    'mai',
    'juin',
    'juillet',
    'août',
    'septembre',
    'octobre',
    'novembre',
    'décembre',
  ],
  [
    'ocak',
    'şubat',
    'mart',
    'nisan',
    'mayıs',
    'haziran',
    'temmuz',
    'ağustos',
    'eylül',
    'ekim',
    'kasım',
    'aralık',
  ],
  [
    'يناير',
    'فبراير',
    'مارس',
    'ابريل',
    'مايو',
    'يونيو',
    'يوليو',
    'اغسطس',
    'سبتمبر',
    'اكتوبر',
    'نوفمبر',
    'ديسمبر',
  ],
  // The Levant's months.
  [
    'كانون الثاني',
    'شباط',
    'اذار',
    'نيسان',
    'ايار',
    'حزيران',
    'تموز',
    'اب',
    'ايلول',
    'تشرين الاول',
    'تشرين الثاني',
    'كانون الاول',
  ],
];
const dayIn = (word: string) => {
  for (const names of DAY_NAMES) {
    const i = names.indexOf(word);
    if (i >= 0) return i;
  }
  return -1;
};
const monthIn = (word: string) => {
  for (const names of MONTH_NAMES) {
    const i = names.indexOf(word);
    if (i >= 0) return i;
  }
  return -1;
};
const alt = (names: string[][]) =>
  names
    .flat()
    .map((n) => n.replace(/\s+/g, '\\s+'))
    .join('|');
const DAY_ALT = alt(DAY_NAMES);
const MONTH_ALT = alt(MONTH_NAMES);
const P = '(?:^|\\s)';
/** The words that only introduce a time: "from last week", "en mars", "خلال الأسبوع الماضي". */
const INTRO = /^(?:(?:from|in|during|since|on|of|de|du|depuis|pendant|en|من|في|خلال)\s+|d['’])/iu;
const END = '$';

/**
 * Each language's ways to name a time at the end of a query, with the words before it that only
 * introduce it ("from", "en", "خلال"), read on the folded query (`foldSame`).
 */
const PERIOD_RULES: Array<[RegExp, (m: RegExpExecArray) => Period | null]> = [
  [
    new RegExp(`${P}(?:(?:from|in|during|since|on|of)\\s+)?(yesterday|today)${END}`, 'u'),
    (m) => ({ kind: m[1] as 'yesterday' | 'today' }),
  ],
  [
    new RegExp(
      `${P}(?:(?:from|in|during|since|of)\\s+)?(?:(last|past)|this)\\s+(week|month|year)${END}`,
      'u',
    ),
    (m) => ({ kind: m[1] ? 'last' : 'this', unit: m[2] as 'week' }),
  ],
  [
    new RegExp(`${P}(?:(?:from|on|since)\\s+)?last\\s+(${DAY_ALT})${END}`, 'u'),
    (m) => weekday(m[1]!),
  ],
  [
    new RegExp(`${P}(?:(?:d'|de\\s+|du\\s+|depuis\\s+|pendant\\s+))?(hier|aujourd'hui)${END}`, 'u'),
    (m) => ({ kind: m[1] === 'hier' ? 'yesterday' : 'today' }),
  ],
  [
    new RegExp(
      `${P}(?:(?:de\\s+|depuis\\s+|pendant\\s+))?(?:la\\s+|le\\s+|l')?(semaine|mois|année|an)\\s+(?:dernière|dernier|passée|passé)${END}`,
      'u',
    ),
    (m) => ({ kind: 'last', unit: frUnit(m[1]!) }),
  ],
  [
    new RegExp(`${P}(?:de\\s+)?(?:cette|ce)\\s+(semaine|mois|année)(?:-ci)?${END}`, 'u'),
    (m) => ({ kind: 'this', unit: frUnit(m[1]!) }),
  ],
  [new RegExp(`${P}(?:de\\s+|du\\s+)?(${DAY_ALT})\\s+dernier${END}`, 'u'), (m) => weekday(m[1]!)],
  [
    new RegExp(`${P}(dün|bugün)(?:kü|den|dan)?${END}`, 'u'),
    (m) => ({ kind: m[1] === 'dün' ? 'yesterday' : 'today' }),
  ],
  [
    new RegExp(
      `${P}(geçen|bu)\\s+(hafta|ay|yıl|sene)(?:ki|dan|den|ta|te|da|de|nın|nin)?${END}`,
      'u',
    ),
    (m) => ({ kind: m[1] === 'bu' ? 'this' : 'last', unit: trUnit(m[2]!) }),
  ],
  [new RegExp(`${P}geçen\\s+(${DAY_ALT})(?:ki|dan|den)?${END}`, 'u'), (m) => weekday(m[1]!)],
  [
    new RegExp(`${P}(?:(?:من|في|خلال)\\s+)?(امبارح|امس|البارحه|اليوم|النهارده)${END}`, 'u'),
    (m) => ({ kind: m[1] === 'اليوم' || m[1] === 'النهارده' ? 'today' : 'yesterday' }),
  ],
  [
    new RegExp(
      `${P}(?:(?:من|في|خلال)\\s+)?(الاسبوع|الشهر|السنه|العام)\\s+(?:الماضي|الماضيه|اللي\\s+فات|اللي\\s+فاتت)${END}`,
      'u',
    ),
    (m) => ({ kind: 'last', unit: arUnit(m[1]!) }),
  ],
  [
    new RegExp(
      `${P}(?:(?:من|في|خلال)\\s+)?(?:(?:هذا|هذه)\\s+(الاسبوع|الشهر|السنه|العام)|(الاسبوع|الشهر|السنه|العام)\\s+(?:ده|دي|هذا|هذه))${END}`,
      'u',
    ),
    (m) => ({ kind: 'this', unit: arUnit(m[1] ?? m[2]!) }),
  ],
  [
    new RegExp(
      `${P}(?:(?:من|في)\\s+)?(?:يوم\\s+)?(${DAY_ALT})\\s+(?:الماضي|اللي\\s+فات)${END}`,
      'u',
    ),
    (m) => weekday(m[1]!),
  ],
  [
    new RegExp(
      `${P}(?:(?:from|in|during|since|of|en|de|du|depuis|pendant|من|في|خلال)\\s+)?(${MONTH_ALT})(?:'?(?:ta|te|da|de|tan|ten|dan|den))?(?:\\s+(\\d{4}))?${END}`,
      'u',
    ),
    (m) => {
      const month = monthIn(m[1]!.replace(/\s+/g, ' '));
      return month < 0 ? null : { kind: 'month', month, year: m[2] ? Number(m[2]) : null };
    },
  ],
  [
    new RegExp(
      // A year as people write one (1900 to 2099): any other four digits are a number, a
      // reference's or an invoice's, searched as words.
      `${P}(?:(?:in|of|en|de|من|في)\\s+)?((?:19|20)\\d{2})(?:'?(?:te|de|ta|da|ten|den|tan|dan))?${END}`,
      'u',
    ),
    (m) => ({ kind: 'year', year: Number(m[1]) }),
  ],
];

function weekday(word: string): Period | null {
  const day = dayIn(word.replace(/\s+/g, ' '));
  return day < 0 ? null : { kind: 'weekday', day };
}
const frUnit = (w: string) => (w === 'semaine' ? 'week' : w === 'mois' ? 'month' : 'year');
const trUnit = (w: string) => (w === 'hafta' ? 'week' : w === 'ay' ? 'month' : 'year');
const arUnit = (w: string) => (w === 'الاسبوع' ? 'week' : w === 'الشهر' ? 'month' : 'year');

/**
 * The query folded for the rules, letter for letter (so a match's place is the query's): lower
 * case, digits of any script as ASCII, and Arabic's hamza and "ة"/"ى" forms as people type them.
 */
function foldSame(q: string): string {
  // "İ" lowercases to two letters in JavaScript; Turkish's own lowercase is one.
  return asciiDigits(q)
    .replace(/İ/g, 'i')
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه');
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const utcDay = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));

/**
 * The days a phrase at the end of a query names, by the calendar ("last week" is Monday to
 * Sunday before this week's; "March" is the nearest March, the one just passed or the one
 * ahead), and the query without it. Days, not
 * instants: the search is by day, in UTC, which is near enough for "last week". Every interface
 * language names them ("la semaine dernière", "geçen hafta", "الأسبوع الماضي").
 */
export function splitPeriod(q: string, now: Date): { rest: string; period: ParsedQuery['period'] } {
  const folded = foldSame(q);
  for (const [rule, read] of PERIOD_RULES) {
    const m = rule.exec(folded);
    if (!m) continue;
    const period = read(m);
    if (!period) continue;
    const days = daysOf(period, now);
    // The label is the time as written, without the word that introduced it ("from", "en", "خلال").
    const start = m.index + (m[0].length - m[0].trimStart().length);
    const label = q.slice(start).trim().replace(INTRO, '');
    return {
      rest: q.slice(0, m.index).trim(),
      period: { since: iso(days.since), until: iso(days.until), label },
    };
  }
  return { rest: q, period: null };
}

function daysOf(p: Period, now: Date): { since: Date; until: Date } {
  const y = now.getUTCFullYear();
  const mo = now.getUTCMonth();
  const d = now.getUTCDate();
  const today = utcDay(y, mo, d);
  // Weeks start on Monday here; a reader's own week is the inbox's affair, not a search's.
  const sinceMonday = (now.getUTCDay() + 6) % 7;
  switch (p.kind) {
    case 'yesterday':
      return { since: utcDay(y, mo, d - 1), until: today };
    case 'today':
      return { since: today, until: utcDay(y, mo, d + 1) };
    case 'last':
      if (p.unit === 'week')
        return { since: utcDay(y, mo, d - sinceMonday - 7), until: utcDay(y, mo, d - sinceMonday) };
      if (p.unit === 'month') return { since: utcDay(y, mo - 1, 1), until: utcDay(y, mo, 1) };
      return { since: utcDay(y - 1, 0, 1), until: utcDay(y, 0, 1) };
    case 'this':
      if (p.unit === 'week')
        return { since: utcDay(y, mo, d - sinceMonday), until: utcDay(y, mo, d + 1) };
      if (p.unit === 'month') return { since: utcDay(y, mo, 1), until: utcDay(y, mo, d + 1) };
      return { since: utcDay(y, 0, 1), until: utcDay(y, mo, d + 1) };
    case 'weekday': {
      let back = (now.getUTCDay() - p.day + 7) % 7;
      if (back === 0) back = 7;
      return { since: utcDay(y, mo, d - back), until: utcDay(y, mo, d - back + 1) };
    }
    case 'month': {
      const year = p.year ?? nearestYearOf(p.month, y, mo);
      return { since: utcDay(year, p.month, 1), until: utcDay(year, p.month + 1, 1) };
    }
    case 'year':
      return { since: utcDay(p.year, 0, 1), until: utcDay(p.year + 1, 0, 1) };
  }
}

/**
 * The year a bare month names: the nearest one, since a search finds cards by when they're for
 * (R51) as well as words by when they were written. "November" in September is the November
 * ahead, in December the one just passed; a month as far either way is the past one, where the
 * written record is. A year written beside it is exact.
 */
function nearestYearOf(month: number, y: number, mo: number): number {
  const back = (mo - month + 12) % 12;
  const ahead = (month - mo + 12) % 12;
  if (ahead < back) return month > mo ? y : y + 1;
  return month <= mo ? y : y - 1;
}

/** A rule's source, tolerant of how Arabic is typed: any alef, "ى" or "ي", "ة" or "ه". */
function tolerant(source: string): string {
  return source.replace(/ا/g, '[اأإآ]').replace(/ي/g, '[يى]').replace(/ه/g, '[هة]');
}
const rx = (source: string) => new RegExp(tolerant(source), 'iu');

/** Words for kinds of file, in every interface language, each as the whole of what's matched. */
const FILE_WORDS: Array<[RegExp, FileKind | null, SearchScope]> = [
  [rx("^(?:pdfs?|pdf'?(?:ler|leri)|ملفات\\s+pdf)$"), 'pdf', 'files'],
  [
    rx(
      '^(?:documents?|docs?|مستندات|المستندات|وثائق|الوثائق|belgeler|belgeleri|doküman(?:lar|ları)?)$',
    ),
    'document',
    'files',
  ],
  [
    rx(
      '^(?:photos?|pictures?|pics?|images?|صور|الصور|صوره|fotoğraf(?:lar|ları)?|foto(?:lar|ları)?|resim(?:ler|leri)?)$',
    ),
    'image',
    'files',
  ],
  [rx('^(?:videos?|vidéos?|فيديو(?:هات)?|الفيديوهات|video(?:lar|ları)?)$'), 'video', 'files'],
  [
    rx(
      '^(?:voice notes?|voice messages?|audio|recordings?|messages?\\s+vocaux|message\\s+vocal|vocaux|enregistrements?|رسائل\\s+صوتيه|الرسائل\\s+الصوتيه|فويسات|ريكوردات|تسجيلات|sesli\\s+mesaj(?:lar|ları)?|ses\\s+kayıt(?:lar|ları)?)$',
    ),
    'audio',
    'files',
  ],
  [
    rx(
      '^(?:files?|attachments?|fichiers?|pièces?\\s+jointes?|ملفات|الملفات|مرفقات|المرفقات|dosya(?:lar|ları)?|ekler|ekleri)$',
    ),
    null,
    'files',
  ],
  [
    rx('^(?:links?|liens?|روابط|الروابط|لينكات|bağlantı(?:lar|ları)?|link(?:ler|leri)?)$'),
    null,
    'links',
  ],
];

const fileWord = (word: string) => FILE_WORDS.find(([re]) => re.test(word.trim()));

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
  // Apostrophes as phones type them (’) read as the rules write them (').
  const q0 = clean(raw).replace(/[’‘]/g, "'");
  const out = base(raw);
  if (!q0) return out;
  // When, first: "photos from last week" is photos, in those days, from nobody in particular.
  const { rest, period } = splitPeriod(q0, opts.now ?? new Date());
  if (!period) return parseWords(q0, out);
  if (!rest) return { ...out, text: '', period, interpretation: period.label };
  const parsed = parseWords(rest, { ...out, text: rest, period });
  return { ...parsed, interpretation: `${parsed.interpretation} · ${period.label}` };
}

type Rule = [RegExp, (m: RegExpExecArray, out: ParsedQuery) => ParsedQuery | null];

const word = (m: RegExpExecArray, i: number) => m[i]?.trim() ?? '';

/** "PDFs from Sarah": a kind of file and whose. */
const filesFrom =
  (fileAt: number, personAt: number): Rule[1] =>
  (m, out) => {
    const file = fileWord(word(m, fileAt));
    if (!file) return null;
    const person = word(m, personAt);
    return {
      ...out,
      scope: file[2],
      fileKind: file[1],
      person,
      text: '',
      interpretation:
        file[2] === 'links'
          ? tr('Links from {person}', { person })
          : file[1]
            ? tr('{what} from {person}', { what: word(m, fileAt), person })
            : tr('Files from {person}', { person }),
    };
  };

const askedMe =
  (personAt = 1): Rule[1] =>
  (m, out) => ({
    ...out,
    scope: 'tasks',
    person: word(m, personAt),
    direction: 'asked_me',
    text: '',
    interpretation: tr('What {trim} asked you to do', { trim: word(m, personAt) }),
  });

const iAsked: Rule[1] = (m, out) => ({
  ...out,
  scope: 'tasks',
  person: word(m, 1),
  direction: 'i_asked',
  text: '',
  interpretation: tr('What you asked {trim} to do', { trim: word(m, 1) }),
});

const waitingOn: Rule[1] = (m, out) => ({
  ...out,
  scope: 'waiting',
  person: word(m, 1),
  text: '',
  interpretation: tr("What you're waiting for from {trim}", { trim: word(m, 1) }),
});

const waitingAll: Rule[1] = (_m, out) => ({
  ...out,
  scope: 'waiting',
  text: '',
  interpretation: tr("Everything you're waiting for"),
});

const said =
  (personAt: number, textAt: number): Rule[1] =>
  (m, out) => ({
    ...out,
    scope: 'messages',
    person: word(m, personAt),
    text: word(m, textAt),
    interpretation: tr('{person} on “{text}”', {
      person: word(m, personAt),
      text: word(m, textAt),
    }),
  });

const decisions: Rule[1] = (m, out) => {
  const about = word(m, 1);
  return {
    ...out,
    scope: 'decisions',
    text: about,
    interpretation: about ? tr('Decisions about “{trim}”', { trim: about }) : tr('All decisions'),
  };
};

const tasks: Rule[1] = (m, out) => {
  const person = word(m, 1) || null;
  return {
    ...out,
    scope: 'tasks',
    person,
    text: '',
    interpretation: person ? tr('Tasks with {trim}', { trim: person }) : tr('Your tasks'),
  };
};

const contexts: Rule[1] = (m, out) => ({
  ...out,
  scope: 'contexts',
  text: word(m, 1),
  interpretation: tr('Conversations about “{trim}”', { trim: word(m, 1) }),
});

const from =
  (textAt: number, personAt: number): Rule[1] =>
  (m, out) => ({
    ...out,
    scope: 'messages',
    person: word(m, personAt),
    text: word(m, textAt),
    interpretation: tr('“{text}” from {person}', {
      text: word(m, textAt),
      person: word(m, personAt),
    }),
  });

/** A name as French writes one after "de": capitalised as typed ("photos de Sarah", not "de vacances"). */
const FR_NAME = "(\\p{Lu}[\\p{L}'’-]*(?:\\s+\\p{Lu}[\\p{L}'’-]*)*)";
/** Turkish puts "from" and "'s" on the name: "Sarah'dan", "Ahmet'in". */
const TR_FROM = "'(?:dan|den|tan|ten)";
const TR_OF = "'(?:nın|nin|nun|nün|ın|in|un|ün)";

/**
 * The shapes a query takes, in every interface language, in order: the first that reads it wins.
 * English first, then Arabic as it's typed (Egyptian and the Levant's words too), French, Turkish.
 */
const RULES: Rule[] = [
  // "PDFs from Sarah", "photos with Ahmed", "links from DATA C"
  [rx('^(.+?)\\s+(?:from|by|with|of)\\s+(.+)$'), filesFrom(1, 2)],
  [rx('^(.+?)\\s+(?:من|مع|بتاع|بتاعه|بتاعت)\\s+(.+)$'), filesFrom(1, 2)],
  [
    rx(`^(.+?)\\s+(?:de\\s+la\\s+part\\s+de\\s+|envoyée?s?\\s+par\\s+|par\\s+|avec\\s+|d')(.+)$`),
    filesFrom(1, 2),
  ],
  // Case counts here: a name is capitalised as typed.
  [new RegExp(`^(.+?)\\s+[dD]e\\s+${FR_NAME}$`, 'u'), filesFrom(1, 2)],
  [rx(`^(.+?)(?:${TR_FROM}|${TR_OF})\\s+(?:gelen\\s+)?(.+)$`), filesFrom(2, 1)],
  // "things Sarah asked me to do", "what did Sarah ask me"
  [rx('^(?:things|what|stuff)\\s+(.+?)\\s+asked\\s+me(?:\\s+to\\s+do|\\s+for)?$'), askedMe()],
  [rx('^what\\s+did\\s+(.+?)\\s+ask\\s+(?:me|me\\s+to\\s+do|me\\s+for)$'), askedMe()],
  [rx('^(?:ماذا|ما\\s+الذي|ايه\\s+اللي|شو)\\s+طلب(?:ت|ه)?\\s+مني\\s+(.+)$'), askedMe()],
  [rx('^(?:ماذا|ما\\s+الذي|شو)\\s+طلب(?:ت)?\\s+(.+?)\\s+مني$'), askedMe()],
  [rx('^(?:ايه\\s+اللي|اللي|الذي)\\s+(.+?)\\s+طلب(?:ه|ته|تو|و)?\\s+مني$'), askedMe()],
  [
    rx(
      "^(?:ce\\s+que|qu'est-ce\\s+que|tout\\s+ce\\s+que)\\s+(.+?)\\s+m'a\\s+demandé(?:\\s+de\\s+faire)?$",
    ),
    askedMe(),
  ],
  [rx(`^(.+?)${TR_OF}\\s+benden\\s+istedik(?:leri|lerini)$`), askedMe()],
  [rx('^(.+?)\\s+benden\\s+ne\\s+istedi$'), askedMe()],
  // "what I asked Sarah"
  [rx('^(?:things|what)\\s+i\\s+asked\\s+(.+?)(?:\\s+to\\s+do|\\s+for)?$'), iAsked],
  [rx('^(?:ماذا|ما\\s+الذي|ايه\\s+اللي|اللي)\\s+طلبت(?:ه)?\\s+من\\s+(.+)$'), iAsked],
  [
    rx(
      "^(?:ce\\s+que|qu'est-ce\\s+que)\\s+j'ai\\s+demandé\\s+(?:à|a)\\s+(.+?)(?:\\s+de\\s+faire)?$",
    ),
    iAsked,
  ],
  [rx(`^(.+?)${TR_FROM}\\s+(?:istediklerim|ne\\s+istedim)$`), iAsked],
  // "waiting on Sarah", "what am I waiting for"
  [
    rx('^(?:waiting\\s+(?:on|for)|what\\s+am\\s+i\\s+waiting\\s+(?:on|for)\\s+from)\\s+(.+)$'),
    waitingOn,
  ],
  [
    rx(
      '^(?:ماذا\\s+انتظر\\s+من|ما\\s+انتظره\\s+من|مستني\\s+(?:ايه\\s+)?من|منتظر\\s+من|بانتظار)\\s+(.+)$',
    ),
    waitingOn,
  ],
  [
    rx("^(?:ce\\s+que\\s+j'attends\\s+de|j'attends\\s+quoi\\s+de|en\\s+attente\\s+de)\\s+(.+)$"),
    waitingOn,
  ],
  [rx(`^(.+?)${TR_FROM}\\s+(?:beklediklerim|ne\\s+bekliyorum)$`), waitingOn],
  [rx('^(?:what\\s+am\\s+i\\s+waiting\\s+(?:on|for)|waiting)$'), waitingAll],
  [rx('^(?:ماذا\\s+انتظر|ما\\s+الذي\\s+انتظره|مستني\\s+ايه|في\\s+الانتظار)$'), waitingAll],
  [rx("^(?:ce\\s+que\\s+j'attends|j'attends\\s+quoi|en\\s+attente)$"), waitingAll],
  [rx('^(?:beklediklerim|ne\\s+bekliyorum)$'), waitingAll],
  // "what did Sarah say about the migration"
  [
    rx('^what\\s+did\\s+(.+?)\\s+(?:say|write|mention|send)\\s+(?:about|on|regarding)\\s+(.+)$'),
    said(1, 2),
  ],
  [
    rx(
      '^(?:ماذا|ايه\\s+اللي|شو)\\s+(?:قال|قالت|كتب|كتبت|بعت|بعتت|ارسل|ارسلت)\\s+(.+?)\\s+(?:عن|بخصوص|حول)\\s+(.+)$',
    ),
    said(1, 2),
  ],
  [
    rx('^(?:ايه\\s+اللي|اللي)\\s+(.+?)\\s+(?:قاله|قالته|كتبه|كتبته)\\s+(?:عن|بخصوص|حول)\\s+(.+)$'),
    said(1, 2),
  ],
  [
    rx(
      "^(?:qu'a\\s+dit|qu'est-ce\\s+qu'a\\s+dit|ce\\s+qu'a\\s+dit)\\s+(.+?)\\s+(?:sur|à\\s+propos\\s+de|au\\s+sujet\\s+de|concernant)\\s+(.+)$",
    ),
    said(1, 2),
  ],
  [
    rx(
      "^(?:ce\\s+que|qu'est-ce\\s+que)\\s+(.+?)\\s+a\\s+(?:dit|écrit|envoyé)\\s+(?:sur|à\\s+propos\\s+de|au\\s+sujet\\s+de|concernant)\\s+(.+)$",
    ),
    said(1, 2),
  ],
  [rx('^(\\S+)\\s+(.+?)\\s+hakkında\\s+ne\\s+(?:dedi|yazdı|söyledi)$'), said(1, 2)],
  [rx(`^(.+?)${TR_OF}\\s+(.+?)\\s+hakkında\\s+(?:söyledikleri|dedikleri|yazdıkları)$`), said(1, 2)],
  // "decisions about pricing", "decisions"
  [rx('^decisions?(?:\\s+(?:about|on|for|in|with)\\s+(.+))?$'), decisions],
  [rx('^(?:ال)?قرارات?(?:\\s+(?:عن|بخصوص|حول|في)\\s+(.+))?$'), decisions],
  [
    rx(
      '^(?:ماذا|ايه\\s+اللي)\\s+(?:قررنا|قررناه|اتفقنا\\s+عليه)(?:\\s+(?:عن|بخصوص|في|حول)\\s+(.+))?$',
    ),
    decisions,
  ],
  [
    rx(
      '^(?:les\\s+)?décisions?(?:\\s+(?:sur|à\\s+propos\\s+de|au\\s+sujet\\s+de|concernant|pour)\\s+(.+))?$',
    ),
    decisions,
  ],
  [rx('^(?:(.+?)\\s+hakkında(?:ki)?\\s+)?kararlar(?:ı)?$'), decisions],
  // "tasks", "my tasks", "tasks from Sarah"
  [rx('^(?:my\\s+)?(?:tasks?|to-?dos?|actions?)(?:\\s+(?:from|with|for)\\s+(.+))?$'), tasks],
  [rx('^(?:مهامي|المهام|مهام|المهمات|مهماتي)(?:\\s+(?:مع|من)\\s+(.+))?$'), tasks],
  [
    rx(
      '^(?:mes\\s+|les\\s+)?(?:tâches|actions|choses\\s+à\\s+faire)(?:\\s+(?:de|avec|pour)\\s+(.+))?$',
    ),
    tasks,
  ],
  [rx('^(?:görevlerim|görevler|yapılacaklar)$'), tasks],
  [rx("^(.+?)(?:'(?:la|le|yla|yle)|\\s+ile)\\s+görevler(?:im)?$"), tasks],
  // "Project Alpha conversations"
  [rx('^(.+?)\\s+(?:conversations?|chats?|threads?|context)$'), contexts],
  [rx('^(?:محادثات|المحادثات|دردشات|نقاشات)\\s+(?:(?:عن|حول|بخصوص)\\s+)?(.+)$'), contexts],
  [
    rx(
      '^(?:conversations?|discussions?|échanges)\\s+(?:(?:sur|à\\s+propos\\s+de|au\\s+sujet\\s+de|concernant)\\s+)?(.+)$',
    ),
    contexts,
  ],
  [
    rx(
      '^(.+?)\\s+(?:hakkında(?:ki)?\\s+)?(?:konuşmaları|sohbetleri|yazışmaları|konuşmalar|sohbetler|yazışmalar)$',
    ),
    contexts,
  ],
];

/** "my", "all my" before a relationship word, in every language (Arabic and Turkish say it in the word). */
const MY = rx('^(?:my|all(?:\\s+my)?|mes|mon|ma|tous\\s+mes|toutes\\s+mes|les|كل|tüm|bütün)\\s+');

/** "proposal from Sarah": what someone sent, last, as it would also match a person's name. */
const FROM_RULES: Rule[] = [
  [rx('^(.+?)\\s+from\\s+(.+)$'), from(1, 2)],
  [rx('^(.+?)\\s+من\\s+(.+)$'), from(1, 2)],
  [rx(`^(.+?)\\s+(?:de\\s+la\\s+part\\s+de|envoyée?s?\\s+par)\\s+(.+)$`), from(1, 2)],
  [rx(`^(.+?)${TR_FROM}\\s+(?:gelen\\s+)?(.+)$`), from(2, 1)],
];

function parseWords(q: string, out: ParsedQuery): ParsedQuery {
  const fileOnly = fileWord(q);
  for (const [re, make] of RULES) {
    // A kind of file alone ("photos") is read below, before the shapes that need more words.
    if (fileOnly) break;
    const m = re.exec(q);
    const read = m && make(m, out);
    if (read) return read;
  }
  if (fileOnly) {
    return {
      ...out,
      scope: fileOnly[2],
      fileKind: fileOnly[1],
      text: '',
      interpretation: tr('All {toLowerCase}', { toLowerCase: q.toLowerCase() }),
    };
  }

  // "managers", "my customers", "family", "عملائي", "mes clients", "müşterilerim"
  const named = q.replace(MY, '');
  const rel = relationshipFromWord(named);
  if (rel) {
    return {
      ...out,
      scope: 'people',
      relationship: rel,
      text: '',
      interpretation: tr('People you classified as {toLowerCase}', {
        toLowerCase: named.toLowerCase(),
      }),
    };
  }

  for (const [re, make] of FROM_RULES) {
    const m = re.exec(q);
    const read = m && make(m, out);
    if (read) return read;
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
const ARABIC_QUESTION =
  /^(ماذا|متى|من|هل|أين|اين|ما|كل|اي|أي|وريني|ابحث|ايه|إيه|مين|فين|امتى|إمتى|ازاي|إزاي|شو|وين|ليش)(?=\s|$)/u;
const LATIN_QUESTION =
  /^(?:qu['’]est-ce|que|quoi|qui|quand|où|comment|quel(?:le)?s?|combien|tout|toutes?|montre|trouve|cherche|ne|neler|kim|kimin|nerede|hangi|kaç|göster|bul|tüm|bütün)(?![\p{L}])/iu;

/**
 * Reads like a question or a sentence rather than a term: three words or more, or a question
 * word first. Only these are worth a model's reading when the rules understood nothing (R17);
 * a name or a word is a text match and stays one.
 */
export function looksLikeSentence(raw: string): boolean {
  const q = clean(raw);
  if (!q) return false;
  const words = q.split(/\s+/).filter(Boolean);
  return (
    words.length >= 3 || QUESTION_START.test(q) || ARABIC_QUESTION.test(q) || LATIN_QUESTION.test(q)
  );
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
