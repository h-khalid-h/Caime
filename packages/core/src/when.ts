/**
 * Natural-language dates and times in chat text ("tomorrow at 3pm", "by Friday", "Oct 15",
 * "بكرة الساعة 5"). Built for the phrases people actually use in messages, in English and in
 * Egyptian and Modern Standard Arabic. Deterministic and dependency-free so the server and every
 * client extract the same thing (docs/ARCHITECTURE.md ADR-3).
 *
 * Avoids regex lookbehind so it runs on every JavaScript engine the app targets.
 */
import { asciiDigits } from './digits';
import { latinScores } from './latin-language';
import {
  addDays,
  daysInMonth,
  defaultWorkweek,
  weekStart,
  zonedParts,
  zonedTimeToUtc,
} from './time';

export interface WhenOptions {
  now: Date;
  timeZone: string;
  /** BCP 47 locale; decides whether 10/11 means October 11th (en-US) or 10 November. */
  locale?: string;
  workweek?: number[];
}

export interface WhenMatch {
  /** The matched text as written. */
  text: string;
  index: number;
  /** Local calendar date, YYYY-MM-DD. */
  date: string;
  /** Local time HH:MM, when the text names one. */
  time: string | null;
  /** The instant: the named time, or 09:00 local on the date when no time is named. */
  at: string;
  /** Before `now`. Suggestions only use future dates. */
  past: boolean;
}

interface LocalDate {
  year: number;
  month: number;
  day: number;
}

interface Piece {
  index: number;
  end: number;
  date?: LocalDate;
  time?: { hour: number; minute: number };
  /** Time words that also imply the date is today when no date is given ("tonight"). */
  impliesToday?: boolean;
  /**
   * A time the words only suggest ("tonight" is around 20:00, "tomorrow evening" 19:00): a
   * time written beside it wins, read as that part of the day ("tonight at 8" is 20:00).
   */
  softTime?: boolean;
}

/** Words before a bare "at 8" that make it an evening (dinner, drinks, tonight…). */
const EVENING_BEFORE =
  /(?:dinner|supper|drinks|party|movie|tonight|evening|night|العشا|العشاء|مساء|بالليل|الليلة|الليله)\s*(?:\S+\s+){0,3}$/i;

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

const WEEKDAY_NAMES: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sun: 0,
  mon: 1,
  tue: 2,
  tues: 2,
  wed: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  fri: 5,
  sat: 6,
};

const ARABIC_WEEKDAYS: Array<[RegExp, number]> = [
  [/الأحد|الاحد|الحد/, 0],
  [/الإثنين|الاثنين|الاتنين|الإتنين/, 1],
  [/الثلاثاء|الثلاثا|التلات|التلاتاء/, 2],
  [/الأربعاء|الاربعاء|الأربع|الاربع/, 3],
  [/الخميس/, 4],
  [/الجمعة|الجمعه/, 5],
  [/السبت/, 6],
];

const NUMBER_WORDS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  couple: 2,
  few: 3,
};

const DAY_PARTS: Record<string, number> = { morning: 9, afternoon: 15, evening: 19, night: 21 };

/** Locales that write month before day. */
const MONTH_FIRST = /^(en-US|en-PH|en-CA|en-FM|en-MH|en-GU|es-US|en-AS|en-UM|en-PR|en-VI)$/i;

// French and Turkish. \b stops at "é" and "ı", so a word's edges are any non-letter (or the
// text's edge), the "before" part captured as group 1.
const L_BEFORE = '(^|[^\\p{L}\\p{N}_])';
const L_AFTER = '(?=$|[^\\p{L}\\p{N}_])';

const FR_MONTHS: Record<string, number> = {
  janvier: 1,
  janv: 1,
  février: 2,
  fevrier: 2,
  févr: 2,
  fév: 2,
  fev: 2,
  mars: 3,
  avril: 4,
  avr: 4,
  mai: 5,
  juin: 6,
  juillet: 7,
  juil: 7,
  août: 8,
  aout: 8,
  septembre: 9,
  sept: 9,
  octobre: 10,
  oct: 10,
  novembre: 11,
  nov: 11,
  décembre: 12,
  decembre: 12,
  déc: 12,
  dec: 12,
};
const FR_MONTH_NAMES = Object.keys(FR_MONTHS)
  .sort((a, b) => b.length - a.length)
  .join('|');
const FR_WEEKDAYS: Record<string, number> = {
  dimanche: 0,
  lundi: 1,
  mardi: 2,
  mercredi: 3,
  jeudi: 4,
  vendredi: 5,
  samedi: 6,
};
const FR_PARTS: Record<string, number> = { matin: 9, midi: 12, soir: 19 };
const FR_PART_WORDS = 'matin|midi|apr[eè]s[- ]midi|apr[eè]m|soir';
const FR_NUMBER_WORDS: Record<string, number> = {
  un: 1,
  une: 1,
  deux: 2,
  trois: 3,
  quatre: 4,
  cinq: 5,
  six: 6,
  sept: 7,
  // "dans huit jours" is a week and "dans quinze jours" two, as French counts them.
  huit: 7,
  dix: 10,
  quinze: 14,
  quelques: 3,
};
/** A meal or an evening before "à 8h" makes it the evening's. */
const FR_EVENING_BEFORE =
  /(?:dîner|diner|dîne|apéro|apero|soirée|soiree|ciné|cine|resto|verre|fête|fete)\s*(?:\S+\s+){0,3}$/u;

const TR_MONTHS: Record<string, number> = {
  ocak: 1,
  şubat: 2,
  mart: 3,
  nisan: 4,
  mayıs: 5,
  haziran: 6,
  temmuz: 7,
  ağustos: 8,
  eylül: 9,
  ekim: 10,
  kasım: 11,
  aralık: 12,
};
const TR_WEEKDAYS: Record<string, number> = {
  pazartesi: 1,
  salı: 2,
  sali: 2,
  çarşamba: 3,
  carsamba: 3,
  perşembe: 4,
  persembe: 4,
  cumartesi: 6,
  cuma: 5,
  pazar: 0,
};
const TR_PARTS: Record<string, number> = {
  sabah: 9,
  öğlen: 12,
  'öğleden sonra': 15,
  akşam: 19,
  gece: 21,
};
const TR_PART_WORDS = 'sabah|öğleden\\s+sonra|öğlen|akşam|gece';
const TR_NUMBER_WORDS: Record<string, number> = {
  bir: 1,
  iki: 2,
  üç: 3,
  dört: 4,
  beş: 5,
  altı: 6,
  yedi: 7,
  sekiz: 8,
  dokuz: 9,
  on: 10,
  birkaç: 3,
};
const TR_EVENING_BEFORE = /(?:akşam|yemeğ|yemek|parti|sinema|maç|içki)\S*\s*(?:\S+\s+){0,3}$/u;

function normaliseDigits(text: string): string {
  return asciiDigits(text);
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function isValidDate(d: LocalDate): boolean {
  return d.month >= 1 && d.month <= 12 && d.day >= 1 && d.day <= daysInMonth(d.year, d.month);
}

function compare(a: LocalDate, b: LocalDate): number {
  return (a.year - b.year) * 10000 + (a.month - b.month) * 100 + (a.day - b.day);
}

/** Global regex over the text, yielding match + its absolute index. */
function* scan(re: RegExp, text: string): Generator<RegExpExecArray> {
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
  let m: RegExpExecArray | null = g.exec(text);
  while (m) {
    yield m;
    if (m[0].length === 0) g.lastIndex++;
    m = g.exec(text);
  }
}

/**
 * Arabic has no \b: require a non-letter (or the edge) before and after, the "before" part
 * captured as group 1. Arabic letters and diacritics only — the Arabic comma, semicolon and
 * question mark (U+060C, U+061B, U+061F) live in the same Unicode block but are punctuation.
 */
export const ARABIC_LETTERS = '\\u0621-\\u065F\\u066E-\\u06D3\\u06D5-\\u06DC\\u06FA-\\u06FF';
const AR_EDGE_BEFORE = `(^|[^${ARABIC_LETTERS}A-Za-z0-9_])`;
const AR_EDGE_AFTER = `(?=$|[^${ARABIC_LETTERS}A-Za-z0-9_])`;

export function parseWhen(input: string, options: WhenOptions): WhenMatch[] {
  const text = normaliseDigits(input);
  // "İ" lowercases to two characters, which would move every index after it.
  const lower = text.replace(/İ/g, 'i').toLowerCase();
  const tz = options.timeZone;
  const nowParts = zonedParts(options.now, tz);
  const today: LocalDate = { year: nowParts.year, month: nowParts.month, day: nowParts.day };
  const workweek = options.workweek ?? defaultWorkweek(options.locale);
  const firstDay = weekStart(workweek);
  const monthFirst = MONTH_FIRST.test(options.locale ?? '');
  const pieces: Piece[] = [];

  const plusDays = (n: number): LocalDate => {
    const d = addDays(today, n);
    return { year: d.year, month: d.month, day: d.day };
  };
  const daysUntil = (weekday: number): number => (weekday - nowParts.weekday + 7) % 7;
  const endOfWeekOffset = (): number => {
    // Last workday of the current local week.
    const lastWork = workweek[workweek.length - 1] ?? 5;
    const d = daysUntil(lastWork);
    return d;
  };
  const add = (p: Piece) => pieces.push(p);
  // What French and Turkish share with English, said once for both.
  const weekdayIn = (weekday: number, cue?: 'this' | 'next' | 'last'): number => {
    let d = daysUntil(weekday);
    if (d === 0 && cue !== 'this') d = 7;
    if (cue === 'last') d = d === 7 ? -7 : d - 7;
    if (cue === 'next') {
      const daysToWeekEnd = (firstDay - nowParts.weekday + 7) % 7 || 7;
      if (d < daysToWeekEnd) d += 7;
    }
    return d;
  };
  const nextWeek = (): LocalDate => plusDays(daysUntil(firstDay) || 7);
  const monthsAhead = (n: number, day: number): LocalDate => {
    const total = today.month - 1 + n;
    const year = today.year + Math.floor(total / 12);
    const month = (total % 12) + 1;
    return { year, month, day: Math.min(day, daysInMonth(year, month)) };
  };
  const endOfMonth = (): LocalDate => ({
    year: today.year,
    month: today.month,
    day: daysInMonth(today.year, today.month),
  });
  const weekend = (next: boolean): LocalDate => {
    let d = 0;
    while (d < 7 && workweek.includes((nowParts.weekday + d) % 7)) d++;
    if (next && d === 0) d = 7;
    return plusDays(d);
  };
  /** A day of the month: this month while it's ahead, else next month's. */
  const dayOfMonth = (day: number): LocalDate | null => {
    if (day < 1 || day > 31) return null;
    const date = day < today.day ? monthsAhead(1, day) : { ...today, day };
    return date.day === day && isValidDate(date) ? date : null;
  };
  const later = (ms: number): LocalDate & { hour: number; minute: number } => {
    const t = zonedParts(new Date(options.now.getTime() + ms), tz);
    return { year: t.year, month: t.month, day: t.day, hour: t.hour, minute: t.minute };
  };

  // --- English relative days --------------------------------------------------------------
  for (const m of scan(
    /\b(the day after tomorrow|day after tomorrow|today|tonight|tomorrow|tomorow|tmrw|tmr|2morrow)\b(?:\s+(morning|afternoon|evening|night))?/i,
    lower,
  )) {
    const word = m[1]!;
    const part = m[2];
    const offset = word.includes('after') ? 2 : word === 'today' || word === 'tonight' ? 0 : 1;
    const hour = part ? DAY_PARTS[part] : word === 'tonight' ? 20 : undefined;
    add({
      index: m.index,
      end: m.index + m[0].length,
      date: plusDays(offset),
      time: hour !== undefined ? { hour, minute: 0 } : undefined,
      softTime: hour !== undefined,
    });
  }

  for (const m of scan(/\bthis\s+(morning|afternoon|evening)\b/i, lower)) {
    add({
      index: m.index,
      end: m.index + m[0].length,
      date: today,
      time: { hour: DAY_PARTS[m[1]!]!, minute: 0 },
      softTime: true,
    });
  }

  // --- The recent past: said of what was, never a due date ---------------------------------
  for (const m of scan(
    /\b(the day before yesterday|day before yesterday|yesterday|last night|last week)\b(?:\s+(morning|afternoon|evening))?/i,
    lower,
  )) {
    const word = m[1]!;
    const offset = word.includes('before') ? -2 : word === 'last week' ? -7 : -1;
    const part = m[2] ?? (word === 'last night' ? 'night' : undefined);
    add({
      index: m.index,
      end: m.index + m[0].length,
      date: plusDays(offset),
      time: part ? { hour: DAY_PARTS[part]!, minute: 0 } : undefined,
      softTime: Boolean(part),
    });
  }

  // --- A day of the month: "on the 12th", "by the 3rd" (this month if still ahead, else next) ----
  for (const m of scan(
    /\b(?:on|by|until|till|before|the)\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)\b(?!\s+(?:time|place|floor|year|edition|round|half|quarter|of\b|birthday|anniversary))/i,
    lower,
  )) {
    const day = Number(m[1]);
    if (day < 1 || day > 31) continue;
    let date: LocalDate = { year: today.year, month: today.month, day };
    if (day < today.day) {
      const month = today.month === 12 ? 1 : today.month + 1;
      date = { year: today.month === 12 ? today.year + 1 : today.year, month, day };
    }
    if (isValidDate(date)) add({ index: m.index, end: m.index + m[0].length, date });
  }

  // --- End of day / week / month, next week / month, weekend ------------------------------
  for (const m of scan(
    /\b(eod|cob|close of business|end of (?:the )?day|eow|end of (?:the )?week|eom|end of (?:the )?month)\b/i,
    lower,
  )) {
    const w = m[1]!;
    let date: LocalDate = today;
    if (/eow|week/.test(w)) date = plusDays(endOfWeekOffset());
    else if (/eom|month/.test(w)) {
      date = { year: today.year, month: today.month, day: daysInMonth(today.year, today.month) };
    }
    add({ index: m.index, end: m.index + m[0].length, date, time: { hour: 17, minute: 0 } });
  }

  for (const m of scan(
    /\b(next|this|coming)\s+(week|month|weekend)\b|\b(?:the\s+)?weekend\b/i,
    lower,
  )) {
    const which = m[1];
    const unit = m[2] ?? 'weekend';
    let date: LocalDate;
    if (unit === 'week') {
      if (which === 'this') date = plusDays(endOfWeekOffset());
      else {
        let d = daysUntil(firstDay);
        if (d === 0) d = 7;
        date = plusDays(d);
      }
    } else if (unit === 'month') {
      if (which === 'this') {
        date = { year: today.year, month: today.month, day: daysInMonth(today.year, today.month) };
      } else {
        const month = today.month === 12 ? 1 : today.month + 1;
        date = { year: today.month === 12 ? today.year + 1 : today.year, month, day: 1 };
      }
    } else {
      // First non-workday from today (today counts when it already is the weekend).
      let d = 0;
      while (d < 7 && workweek.includes((nowParts.weekday + d) % 7)) d++;
      if (which === 'next' && d === 0) d = 7;
      date = plusDays(d);
    }
    add({ index: m.index, end: m.index + m[0].length, date });
  }

  // --- In N units ----------------------------------------------------------------------------
  for (const m of scan(
    /\bin\s+(?:a\s+)?(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|couple of|few)\s+(minutes?|mins?|hours?|hrs?|days?|weeks?|months?)\b/i,
    lower,
  )) {
    const raw = m[1]!.replace(' of', '');
    const n = /^\d+$/.test(raw) ? Number(raw) : (NUMBER_WORDS[raw] ?? 1);
    const unit = m[2]!;
    if (/^(min|hour|hr)/.test(unit)) {
      const ms = /^min/.test(unit) ? n * 60000 : n * 3600000;
      const target = zonedParts(new Date(options.now.getTime() + ms), tz);
      add({
        index: m.index,
        end: m.index + m[0].length,
        date: { year: target.year, month: target.month, day: target.day },
        time: { hour: target.hour, minute: target.minute },
      });
    } else if (/^day/.test(unit)) {
      add({ index: m.index, end: m.index + m[0].length, date: plusDays(n) });
    } else if (/^week/.test(unit)) {
      add({ index: m.index, end: m.index + m[0].length, date: plusDays(n * 7) });
    } else {
      const total = today.month - 1 + n;
      const year = today.year + Math.floor(total / 12);
      const month = (total % 12) + 1;
      add({
        index: m.index,
        end: m.index + m[0].length,
        date: { year, month, day: Math.min(today.day, daysInMonth(year, month)) },
      });
    }
  }

  // --- Weekdays ------------------------------------------------------------------------------
  for (const m of scan(
    /\b(?:(next|this|coming|last|on|by|until|till|before)\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tues?|wed|thu(?:rs?)?|fri|sat|sun)\b/i,
    lower,
  )) {
    const cue = m[1];
    const name = m[2]!;
    const isAbbrev = name.length <= 5 && !/day$/.test(name);
    // "sat", "sun", "wed" are also ordinary words: accept abbreviations only with a cue.
    if (isAbbrev && !cue) continue;
    const weekday = WEEKDAY_NAMES[name];
    if (weekday === undefined) continue;
    let d = daysUntil(weekday);
    if (d === 0 && cue !== 'this') d = 7;
    // "last Friday" is the one just gone, never the one ahead.
    if (cue === 'last') d = d === 7 ? -7 : d - 7;
    if (cue === 'next') {
      // "next Friday" is the Friday of next week when this week's Friday is still ahead.
      const daysToWeekEnd = (firstDay - nowParts.weekday + 7) % 7 || 7;
      if (d < daysToWeekEnd) d += 7;
    }
    add({ index: m.index, end: m.index + m[0].length, date: plusDays(d) });
  }

  // --- Month-name dates: "Oct 15", "October 15th, 2026", "15 Oct", "15th of October" ------------
  const monthNames =
    'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
  const resolveYear = (month: number, day: number, year?: number): LocalDate => {
    if (year) return { year, month, day };
    const candidate = { year: today.year, month, day };
    const diffDays =
      (Date.UTC(candidate.year, month - 1, day) -
        Date.UTC(today.year, today.month - 1, today.day)) /
      86400000;
    // A date up to a week ago is a reference to the recent past; older ones mean next year.
    if (diffDays < -7) return { year: today.year + 1, month, day };
    return candidate;
  };
  for (const m of scan(
    new RegExp(`\\b(${monthNames})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`, 'i'),
    lower,
  )) {
    const month = MONTHS[m[1]!.replace('.', '')] ?? MONTHS[m[1]!.slice(0, 3)];
    const day = Number(m[2]);
    if (!month) continue;
    const date = resolveYear(month, day, m[3] ? Number(m[3]) : undefined);
    if (isValidDate(date)) add({ index: m.index, end: m.index + m[0].length, date });
  }
  for (const m of scan(
    new RegExp(
      `\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${monthNames})\\b\\.?(?:,?\\s+(\\d{4}))?`,
      'i',
    ),
    lower,
  )) {
    const day = Number(m[1]);
    const month = MONTHS[m[2]!] ?? MONTHS[m[2]!.slice(0, 3)];
    if (!month) continue;
    const date = resolveYear(month, day, m[3] ? Number(m[3]) : undefined);
    if (isValidDate(date)) add({ index: m.index, end: m.index + m[0].length, date });
  }

  // --- Numeric dates: ISO, 15/10, 10/15/2026, 15.10.2026 -------------------------------------
  for (const m of scan(/\b(\d{4})-(\d{2})-(\d{2})\b/, lower)) {
    const date = { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
    if (isValidDate(date)) add({ index: m.index, end: m.index + m[0].length, date });
  }
  for (const m of scan(
    /(^|[^\d/.:-])(\d{1,2})([/.-])(\d{1,2})(?:\3(\d{4}|\d{2}))?(?![\d/:]|\.\d)/,
    lower,
  )) {
    const sep = m[3];
    const hasYear = m[5] !== undefined;
    if (sep === '.' && !hasYear) continue; // "10.30" is a time or a number
    if (sep === '-' && !hasYear) continue; // "3-5" is a range
    const a = Number(m[2]);
    const b = Number(m[4]);
    const [month, day] = monthFirst ? [a, b] : [b, a];
    let year = hasYear ? Number(m[5]) : undefined;
    if (year !== undefined && year < 100) year += 2000;
    const date = resolveYear(month, day, year);
    const start = m.index + m[1]!.length;
    if (isValidDate(date)) add({ index: start, end: m.index + m[0].length, date });
  }

  // --- Times -----------------------------------------------------------------------------------
  for (const m of scan(
    /\b(?:at\s+|@\s*)?(\d{1,2})(?::([0-5]\d))?\s*(a\.?m\.?|p\.?m\.?)(?![a-z])/i,
    lower,
  )) {
    let hour = Number(m[1]);
    const minute = m[2] ? Number(m[2]) : 0;
    if (hour < 1 || hour > 12) continue;
    const pm = m[3]!.startsWith('p');
    if (pm && hour < 12) hour += 12;
    if (!pm && hour === 12) hour = 0;
    add({ index: m.index, end: m.index + m[0].length, time: { hour, minute } });
  }
  for (const m of scan(
    /\b(?:at\s+|@\s*)?([01]?\d|2[0-3]):([0-5]\d)\b(?!\s*(?:a\.?m|p\.?m))/i,
    lower,
  )) {
    add({
      index: m.index,
      end: m.index + m[0].length,
      time: { hour: Number(m[1]), minute: Number(m[2]) },
    });
  }
  for (const m of scan(
    /\bat\s+(\d{1,2})\b(?![:\d]|\s*(?:a\.?m|p\.?m|%|kg|km|min|hour|people|pcs|usd|egp|eur))/i,
    lower,
  )) {
    let hour = Number(m[1]);
    if (hour < 1 || hour > 12) continue;
    // A bare "at 3" in conversation is afternoon; "at 9" is morning; "dinner at 8" is evening.
    if (hour <= 7 || (hour < 12 && EVENING_BEFORE.test(lower.slice(0, m.index)))) hour += 12;
    add({ index: m.index, end: m.index + m[0].length, time: { hour, minute: 0 } });
  }
  for (const m of scan(/\b(?:at\s+)?(noon|midday|midnight)\b/i, lower)) {
    add({
      index: m.index,
      end: m.index + m[0].length,
      time: { hour: m[1] === 'midnight' ? 0 : 12, minute: 0 },
    });
  }

  // --- Arabic ------------------------------------------------------------------------------------
  const arabicDays: Array<[RegExp, number]> = [
    [/بعد\s+(?:بكرة|بكره|بكرا|غد|غدا|غداً|غدًا)/, 2],
    [/اليوم|النهارده|النهاردة|النهاردا/, 0],
    [/بكرة|بكره|بكرا|غدا|غداً|غدًا/, 1],
  ];
  const taken: Array<[number, number]> = [];
  for (const [re, offset] of arabicDays) {
    for (const m of scan(
      new RegExp(`${AR_EDGE_BEFORE}(${re.source})${AR_EDGE_AFTER}`, 'u'),
      text,
    )) {
      const start = m.index + m[1]!.length;
      const end = start + m[2]!.length;
      if (taken.some(([s, e]) => start < e && end > s)) continue;
      taken.push([start, end]);
      add({ index: start, end, date: plusDays(offset) });
    }
  }
  for (const m of scan(
    new RegExp(
      `${AR_EDGE_BEFORE}((?:الأسبوع|الاسبوع)\\s+(?:الجاي|الجاى|القادم|المقبل|اللي جاي))${AR_EDGE_AFTER}`,
      'u',
    ),
    text,
  )) {
    let d = daysUntil(firstDay);
    if (d === 0) d = 7;
    const start = m.index + m[1]!.length;
    add({ index: start, end: start + m[2]!.length, date: plusDays(d) });
  }
  for (const [re, weekday] of ARABIC_WEEKDAYS) {
    for (const m of scan(
      new RegExp(`${AR_EDGE_BEFORE}((?:يوم\\s+)?(?:${re.source}))${AR_EDGE_AFTER}`, 'u'),
      text,
    )) {
      let d = daysUntil(weekday);
      if (d === 0) d = 7;
      const start = m.index + m[1]!.length;
      add({ index: start, end: start + m[2]!.length, date: plusDays(d) });
    }
  }
  // "بعد أسبوعين" (in two weeks), "خلال 3 أيام" (within three days): counted from today.
  for (const m of scan(
    new RegExp(
      `${AR_EDGE_BEFORE}((?:بعد|خلال|في خلال)\\s+(?:(\\d+)\\s*)?(يومين|يوم|أيام|ايام|أسبوعين|اسبوعين|أسبوع|اسبوع|أسابيع|اسابيع|شهرين|شهر|شهور|أشهر|ساعتين|ساعة|ساعه|ساعات))${AR_EDGE_AFTER}`,
      'u',
    ),
    text,
  )) {
    const unit = m[4]!;
    const n = m[3] ? Number(m[3]) : /ين$/.test(unit) ? 2 : 1;
    const start = m.index + m[1]!.length;
    const end = start + m[2]!.length;
    if (/^ساع/.test(unit)) {
      const target = zonedParts(new Date(options.now.getTime() + n * 3600000), tz);
      add({
        index: start,
        end,
        date: { year: target.year, month: target.month, day: target.day },
        time: { hour: target.hour, minute: target.minute },
      });
    } else if (/^(يوم|أيام|ايام)/.test(unit)) add({ index: start, end, date: plusDays(n) });
    else if (/^(أسبوع|اسبوع|أسابيع|اسابيع)/.test(unit))
      add({ index: start, end, date: plusDays(n * 7) });
    else {
      const total = today.month - 1 + n;
      const year = today.year + Math.floor(total / 12);
      const month = (total % 12) + 1;
      add({
        index: start,
        end,
        date: { year, month, day: Math.min(today.day, daysInMonth(year, month)) },
      });
    }
  }
  for (const m of scan(
    /(?:الساعة|الساعه)\s*(\d{1,2})(?::(\d{2}))?(?:\s*(ونص|ونصف|وربع|وثلث|وعشرة|إلا ربع|الا ربع|إلا ثلث|الا ثلث))?\s*(ص|م|الصبح|صباحا|صباحاً|مساء|مساءً|بالليل|العصر|الضهر|الظهر)?/u,
    text,
  )) {
    let hour = Number(m[1]);
    let minute = m[2] ? Number(m[2]) : 0;
    // "5 ونص" is half past five; "إلا ربع" a quarter to.
    const words = m[3] ?? '';
    if (/^ونص/.test(words)) minute = 30;
    else if (words === 'وربع') minute = 15;
    else if (words === 'وثلث') minute = 20;
    else if (words === 'وعشرة') minute = 10;
    else if (/ربع$/.test(words) && words !== 'وربع') {
      minute = 45;
      hour -= 1;
    } else if (/ثلث$/.test(words) && words !== 'وثلث') {
      minute = 40;
      hour -= 1;
    }
    const part = m[4] ?? '';
    if (hour > 23 || hour < 0) continue;
    if (/^(م|مساء|مساءً|بالليل|العصر)$/.test(part) && hour < 12) hour += 12;
    else if (/^(الضهر|الظهر)$/.test(part) && hour < 12 && hour <= 4) hour += 12;
    else if (!part && hour >= 1 && hour <= 7) hour += 12;
    add({ index: m.index, end: m.index + m[0].length, time: { hour, minute } });
  }

  // --- French ----------------------------------------------------------------------------------
  const edged = (source: string) => new RegExp(`${L_BEFORE}(${source})${L_AFTER}`, 'u');
  /** The piece a French or Turkish match makes, past its edge character. */
  const at = (m: RegExpExecArray) => {
    const index = m.index + m[1]!.length;
    return { index, end: index + m[2]!.length };
  };
  const partHour = (part: string | undefined): number | undefined =>
    part ? (/^apr/.test(part) ? 15 : FR_PARTS[part]) : undefined;
  // A bare "15h" or "midi" could be English's ("2h", a MIDI file): only in French words.
  const scores = latinScores(text);
  const french = scores.fr > scores.en;
  for (const m of scan(
    edged(
      `(apr[eè]s[- ]demain|aujourd['’]hui|demain|ce\\s+soir|ce\\s+matin|cet\\s+apr[eè]s[- ]midi|cet\\s+apr[eè]m)(?:\\s+(${FR_PART_WORDS}))?`,
    ),
    lower,
  )) {
    const word = m[3]!;
    const offset = /^apr/.test(word) ? 2 : /^demain/.test(word) ? 1 : 0;
    // "ce soir" is around eight, "demain soir" seven, as in English.
    const hour = m[4]
      ? partHour(m[4])
      : /^ce\s+soir/.test(word)
        ? 20
        : /^ce\s+matin/.test(word)
          ? 9
          : /^cet\s/.test(word)
            ? 15
            : undefined;
    add({
      ...at(m),
      date: plusDays(offset),
      time: hour !== undefined ? { hour, minute: 0 } : undefined,
      // "demain midi" is noon; a morning or an evening only suggests an hour.
      softTime: hour !== undefined && hour !== 12,
    });
  }
  // The recent past: said of what was, never a due date.
  for (const m of scan(
    edged(
      `(avant[- ]hier|hier|la\\s+semaine\\s+derni[eè]re|le\\s+mois\\s+dernier)(?:\\s+(${FR_PART_WORDS}))?`,
    ),
    lower,
  )) {
    const word = m[3]!;
    const date = /^avant/.test(word)
      ? plusDays(-2)
      : /semaine/.test(word)
        ? plusDays(-7)
        : /mois/.test(word)
          ? monthsAhead(-1, today.day)
          : plusDays(-1);
    const hour = partHour(m[4]);
    add({
      ...at(m),
      date,
      time: hour !== undefined ? { hour, minute: 0 } : undefined,
      softTime: hour !== undefined,
    });
  }
  // "lundi", "ce jeudi", "vendredi prochain", "d'ici mardi", "lundi dernier"
  for (const m of scan(
    edged(
      `(?:(ce|d['’]ici|avant|pour|jusqu['’][aà]|d[eè]s)\\s+)?(dimanche|lundi|mardi|mercredi|jeudi|vendredi|samedi)(?:\\s+(prochain|dernier|pass[eé]))?(?:\\s+(${FR_PART_WORDS}))?`,
    ),
    lower,
  )) {
    const cue = m[3] === 'ce' ? 'this' : m[5] === 'prochain' ? 'next' : m[5] ? 'last' : undefined;
    const hour = partHour(m[6]);
    add({
      ...at(m),
      date: plusDays(weekdayIn(FR_WEEKDAYS[m[4]!]!, cue)),
      time: hour !== undefined ? { hour, minute: 0 } : undefined,
      softTime: hour !== undefined && hour !== 12,
    });
  }
  // Weeks, months, weekends and their ends
  for (const m of scan(
    edged(
      `(?:(?:d['’]ici|avant)\\s+)?(?:(?:la|le)\\s+)?((?:(?:en|[aà]\\s+la|d['’]ici\\s+la|avant\\s+la)\\s+)?fin\\s+(?:de\\s+la\\s+|du\\s+|de\\s+)(?:semaine|mois|journ[eé]e)|semaine\\s+(?:prochaine|pro)|cette\\s+semaine|mois\\s+prochain|ce\\s+mois[- ]ci|(?:ce|le)\\s+(?:week-?end|we)(?:\\s+prochain)?)`,
    ),
    lower,
  )) {
    const w = m[3]!;
    let date: LocalDate;
    let time: Piece['time'];
    if (/fin\s/.test(w)) {
      time = { hour: 17, minute: 0 };
      date = /semaine/.test(w)
        ? plusDays(endOfWeekOffset())
        : /mois/.test(w)
          ? endOfMonth()
          : today;
    } else if (/semaine\s+pro/.test(w)) date = nextWeek();
    else if (/semaine/.test(w)) date = plusDays(endOfWeekOffset());
    else if (/mois\s+prochain/.test(w)) date = monthsAhead(1, 1);
    else if (/mois/.test(w)) date = endOfMonth();
    else date = weekend(/prochain/.test(w));
    add({ ...at(m), date, time });
  }
  // "dans 3 jours", "dans deux semaines", "dans 2h", "dans quinze jours"
  for (const m of scan(
    edged(
      `dans\\s+(?:(\\d+)|(une|un|deux|trois|quatre|cinq|six|sept|huit|dix|quinze|quelques))\\s*(minutes?|mins?|heures?|h|jours?|semaines?|mois)`,
    ),
    lower,
  )) {
    const n = m[3] ? Number(m[3]) : (FR_NUMBER_WORDS[m[4]!] ?? 1);
    const unit = m[5]!;
    if (/^(min|h)/.test(unit)) {
      const t = later(/^min/.test(unit) ? n * 60000 : n * 3600000);
      add({ ...at(m), date: t, time: { hour: t.hour, minute: t.minute } });
    } else if (/^jour/.test(unit)) add({ ...at(m), date: plusDays(n) });
    else if (/^semaine/.test(unit)) add({ ...at(m), date: plusDays(n * 7) });
    else add({ ...at(m), date: monthsAhead(n, today.day) });
  }
  // "le 12 mars", "12 mars 2027", "1er avril", "jusqu'au 3 juin"
  for (const m of scan(
    edged(
      `(?:(?:le|au|du|d['’]ici\\s+le|avant\\s+le|jusqu['’]au)\\s+)?(1er|\\d{1,2})\\s+(${FR_MONTH_NAMES})\\.?(?:\\s+(\\d{4}))?`,
    ),
    lower,
  )) {
    const month = FR_MONTHS[m[4]!];
    if (!month) continue;
    const date = resolveYear(
      month,
      m[3] === '1er' ? 1 : Number(m[3]),
      m[5] ? Number(m[5]) : undefined,
    );
    if (isValidDate(date)) add({ ...at(m), date });
  }
  // "le 12" alone: this month while it's ahead, when nothing after it makes it a count.
  for (const m of scan(
    edged(
      `(?:le|au|jusqu['’]au|d['’]ici\\s+le|avant\\s+le)\\s+(1er|\\d{1,2})(?=\\s*(?:$|[,.;!?)]|(?:[aà]|vers|d[eè]s|avant|apr[eè]s|et|ou|pour|au|chez|si|stp|svp|merci)(?:\\s|$)))`,
    ),
    lower,
  )) {
    const date = dayOfMonth(m[3] === '1er' ? 1 : Number(m[3]));
    if (date) add({ ...at(m), date });
  }
  // "à 15h", "15h30", "vers 9 h", "8h du soir". French writes the day's hours, so a written hour
  // is the one it says, unless an evening says otherwise or it's 1 to 5, when nobody meets.
  for (const m of scan(
    edged(
      `(?:([aà]|vers|d[eè]s|avant|apr[eè]s)\\s+)?(\\d{1,2})\\s?(?:h|heures?)(?:\\s?([0-5]\\d))?(?:\\s+(du\\s+matin|du\\s+soir|de\\s+l['’]apr[eè]s[- ]midi|de\\s+l['’]apr[eè]m))?`,
    ),
    lower,
  )) {
    const cue = m[3];
    const start = m.index + m[1]!.length;
    // "pendant 2h", "il y a 3h", "ça prend 1h": a length of time, not an hour of the day.
    if (
      (!cue && !m[5] && !french) ||
      (!cue &&
        /(?:^|[^\p{L}])(?:pendant|en|in|sous|depuis|prend|prends|prendre|dure|durée|faut|reste|environ|y\s+a|de|d['’]|plus|moins|toutes\s+les|tous\s+les)\s*$/u.test(
          lower.slice(0, start),
        ))
    )
      continue;
    let hour = Number(m[4]);
    const minute = m[5] ? Number(m[5]) : 0;
    if (hour > 23) continue;
    const said = m[6];
    if (said && !/matin/.test(said) && hour < 12) hour += 12;
    else if (
      !said &&
      hour < 12 &&
      (FR_EVENING_BEFORE.test(lower.slice(0, start)) || (hour >= 1 && hour <= 5))
    )
      hour += 12;
    add({ ...at(m), time: { hour, minute } });
  }
  for (const m of scan(edged(`(?:([aà]|vers|avant|d[eè]s)\\s+)?(midi|minuit)`), lower)) {
    // "l'après-midi" is an afternoon, not noon; a bare "midi" only among French words.
    if (m[1] === '-' || /apr[eè]s\s$/.test(lower.slice(0, m.index + m[1]!.length))) continue;
    if (!m[3] && !french) continue;
    add({ ...at(m), time: { hour: m[4] === 'minuit' ? 0 : 12, minute: 0 } });
  }

  // --- Turkish ---------------------------------------------------------------------------------
  const trHour = (part: string | undefined) =>
    part ? TR_PARTS[part.replace(/\s+/g, ' ')] : undefined;
  for (const m of scan(
    edged(
      `(yarından\\s+sonra|öbür\\s+gün|bugün|yarın(?:a|dan)?|bu\\s+akşam|bu\\s+sabah|bu\\s+öğleden\\s+sonra|bu\\s+öğlen|bu\\s+gece)(?:\\s+(${TR_PART_WORDS})(?:[ıi]n[ae]?|[ıi])?)?(?:\\s+kadar)?`,
    ),
    lower,
  )) {
    const word = m[3]!;
    const tonight = /^bu\s+(.+)$/.exec(word)?.[1];
    const offset = tonight || /^bugün/.test(word) ? 0 : /sonra$|^öbür/.test(word) ? 2 : 1;
    // "bu akşam" is around eight, "yarın akşam" seven, as in English.
    const hour = m[4] ? trHour(m[4]) : tonight === 'akşam' ? 20 : trHour(tonight);
    add({
      ...at(m),
      date: plusDays(offset),
      time: hour !== undefined ? { hour, minute: 0 } : undefined,
      softTime: hour !== undefined && hour !== 12,
    });
  }
  for (const m of scan(
    edged(
      `(evvelsi\\s+gün|önceki\\s+gün|dün(?:kü)?|geçen\\s+hafta(?:ki)?)(?:\\s+(${TR_PART_WORDS})(?:[ıi])?)?`,
    ),
    lower,
  )) {
    const word = m[3]!;
    const hour = trHour(m[4]);
    add({
      ...at(m),
      date: plusDays(/^dün/.test(word) ? -1 : /hafta/.test(word) ? -7 : -2),
      time: hour !== undefined ? { hour, minute: 0 } : undefined,
      softTime: hour !== undefined,
    });
  }
  // "cuma", "haftaya salı", "pazartesiye kadar", "perşembe günü", "geçen cuma". "Pazar" is also
  // a market: it's Sunday only with a cue, "günü" or a part of the day.
  for (const m of scan(
    edged(
      `(?:(bu|gelecek|önümüzdeki|haftaya|geçen|geçtiğimiz)\\s+)?(pazartesi|salı|sali|çarşamba|carsamba|perşembe|persembe|cumartesi|cuma|pazar)(?:['’]?(?:y[ae]|y[ıi]|[ae]|[ıi]|d[ae]n|d[ae]))?(\\s+günü(?:ne)?)?(?:\\s+(${TR_PART_WORDS})(?:[ıi])?)?(?:\\s+(?:kadar|önce))?`,
    ),
    lower,
  )) {
    const cueWord = m[3];
    const name = m[4]!;
    if (name === 'pazar' && !cueWord && !m[5] && !m[6]) continue;
    // "haftaya salı" is next week's; "gelecek salı" is the coming one.
    const cue =
      cueWord === 'bu'
        ? 'this'
        : cueWord === 'haftaya'
          ? 'next'
          : cueWord === 'geçen' || cueWord === 'geçtiğimiz'
            ? 'last'
            : undefined;
    const hour = trHour(m[6]);
    add({
      ...at(m),
      date: plusDays(weekdayIn(TR_WEEKDAYS[name]!, cue)),
      time: hour !== undefined ? { hour, minute: 0 } : undefined,
      softTime: hour !== undefined && hour !== 12,
    });
  }
  for (const m of scan(
    edged(
      `((?:bu\\s+)?hafta\\s*sonu(?:na|nda)?|(?:bu\\s+)?ay\\s+sonu(?:na|nda)?|gün\\s+sonu(?:na|nda)?|mesai\\s+bitimine|(?:gelecek|önümüzdeki)\\s+(?:hafta|ay)(?:ya|ye|ki)?|haftaya|bu\\s+hafta(?:\\s+içinde)?|bu\\s+ay(?:\\s+içinde)?)(?:\\s+kadar)?`,
    ),
    lower,
  )) {
    const w = m[3]!;
    let date: LocalDate;
    let time: Piece['time'];
    if (/hafta\s*sonu/.test(w)) date = weekend(false);
    else if (/sonu|mesai/.test(w)) {
      time = { hour: 17, minute: 0 };
      date = /ay\s/.test(w) ? endOfMonth() : today;
    } else if (/^(?:gelecek|önümüzdeki)\s+ay/.test(w)) date = monthsAhead(1, 1);
    else if (/^(?:gelecek|önümüzdeki)\s+hafta|^haftaya/.test(w)) date = nextWeek();
    else if (/^bu\s+hafta/.test(w)) date = plusDays(endOfWeekOffset());
    else date = endOfMonth();
    add({ ...at(m), date, time });
  }
  // "3 gün sonra", "iki hafta içinde", "yarım saat sonra"
  for (const m of scan(
    edged(
      `(?:(\\d+)|(birkaç|bir|iki|üç|dört|beş|altı|yedi|sekiz|dokuz|on|yarım))\\s+(dakika|dk|saat|gün|hafta|ay)\\s+(?:sonra|içinde|içerisinde)`,
    ),
    lower,
  )) {
    const n = m[3] ? Number(m[3]) : m[4] === 'yarım' ? 0.5 : (TR_NUMBER_WORDS[m[4]!] ?? 1);
    const unit = m[5]!;
    if (unit === 'dakika' || unit === 'dk' || unit === 'saat') {
      const t = later(unit === 'saat' ? n * 3600000 : n * 60000);
      add({ ...at(m), date: t, time: { hour: t.hour, minute: t.minute } });
    } else if (unit === 'gün') add({ ...at(m), date: plusDays(Math.round(n)) });
    else if (unit === 'hafta') add({ ...at(m), date: plusDays(Math.round(n * 7)) });
    else add({ ...at(m), date: monthsAhead(Math.max(1, Math.round(n)), today.day) });
  }
  // "12 Mart", "12 Mart 2027", "3 Kasım'a kadar"
  for (const m of scan(
    edged(
      `(\\d{1,2})\\s+(ocak|şubat|mart|nisan|mayıs|haziran|temmuz|ağustos|eylül|ekim|kasım|aralık)(?:\\s+(\\d{4}))?(?:['’]\\p{L}{1,4})?(?:\\s+kadar)?`,
    ),
    lower,
  )) {
    const month = TR_MONTHS[m[4]!];
    if (!month) continue;
    const date = resolveYear(month, Number(m[3]), m[5] ? Number(m[5]) : undefined);
    if (isValidDate(date)) add({ ...at(m), date });
  }
  // "saat 3'te", "saat 15:00'te", "15.30'da", "akşam 8'de": an hour needs "saat", its ending or
  // a part of the day beside it, or it's only a number ("3'te 1" is a third).
  for (const m of scan(
    edged(
      `(?:(${TR_PART_WORDS})\\s+)?(saat\\s+)?(\\d{1,2})(?:[:.]([0-5]\\d))?(['’]?(?:d[ae]|t[ae]))?(?!\\s*(?:\\d|bir(?:\\s|$)))`,
    ),
    lower,
  )) {
    const part = m[3]?.replace(/\s+/g, ' ');
    if (!part && !m[4] && !m[7]) continue;
    let hour = Number(m[5]);
    const minute = m[6] ? Number(m[6]) : 0;
    if (hour > 23) continue;
    const before = lower.slice(0, m.index + m[1]!.length);
    if (part === 'gece' && hour === 12) hour = 0;
    else if (part && part !== 'sabah' && hour < 12 && (part !== 'öğlen' || hour <= 5)) hour += 12;
    else if (!part && hour < 12 && ((hour >= 1 && hour <= 7) || TR_EVENING_BEFORE.test(before)))
      hour += 12;
    add({ ...at(m), time: { hour, minute } });
  }
  for (const m of scan(edged(`(öğlen(?:de)?|öğleyin|gece\\s+yarısı(?:nda)?)`), lower)) {
    add({ ...at(m), time: { hour: /^öğle/.test(m[3]!) ? 12 : 0, minute: 0 } });
  }

  // --- Combine date and time pieces that sit next to each other ------------------------------
  pieces.sort((a, b) => a.index - b.index || b.end - b.index - (a.end - a.index));
  // Drop pieces contained in a longer earlier piece ("the day after tomorrow" vs "tomorrow").
  const distinct: Piece[] = [];
  for (const p of pieces) {
    const container = distinct.find((q) => p.index >= q.index && p.end <= q.end);
    if (container) {
      if (!container.time && p.time) container.time = p.time;
      if (!container.date && p.date) container.date = p.date;
      continue;
    }
    distinct.push(p);
  }

  const merged: Piece[] = [];
  for (const p of distinct) {
    const last = merged[merged.length - 1];
    const gap = last ? lower.slice(last.end, p.index) : '';
    const adjacent =
      last && /^[\s,]*(?:at|@|on|by|around|ab|,|-|في|الساعة|الساعه)?[\s,]*$/i.test(gap);
    if (
      last &&
      adjacent &&
      ((last.date && (!last.time || last.softTime) && p.time && !p.date) ||
        (last.time && !last.date && p.date && !p.time))
    ) {
      last.end = p.end;
      last.date = last.date ?? p.date;
      if (p.time && last.softTime && last.time) {
        // "tonight at 8": the eight is the evening's.
        const hour =
          last.time.hour >= 17 && p.time.hour >= 1 && p.time.hour < 12
            ? p.time.hour + 12
            : p.time.hour;
        last.time = { hour, minute: p.time.minute };
        last.softTime = false;
      } else last.time = last.time ?? p.time;
      continue;
    }
    merged.push({ ...p });
  }

  const results: WhenMatch[] = [];
  for (const p of merged) {
    let date = p.date;
    if (!date && p.time) {
      // A time with no date: today if still ahead, otherwise tomorrow.
      const minutesNow = nowParts.hour * 60 + nowParts.minute;
      const minutesAt = p.time.hour * 60 + p.time.minute;
      date = minutesAt > minutesNow ? today : plusDays(1);
    }
    if (!date) continue;
    const hour = p.time?.hour ?? 9;
    const minute = p.time?.minute ?? 0;
    const at = zonedTimeToUtc({ ...date, hour, minute }, tz);
    const past = p.time ? at.getTime() < options.now.getTime() : compare(date, today) < 0;
    results.push({
      text: input.slice(p.index, p.end),
      index: p.index,
      date: `${date.year}-${pad(date.month)}-${pad(date.day)}`,
      time: p.time ? `${pad(p.time.hour)}:${pad(p.time.minute)}` : null,
      at: at.toISOString(),
      past,
    });
  }
  return results;
}

/** The first future date in the text, if any. */
export function firstFutureWhen(input: string, options: WhenOptions): WhenMatch | undefined {
  return parseWhen(input, options).find((m) => !m.past);
}
