/**
 * Natural-language dates and times in chat text ("tomorrow at 3pm", "by Friday", "Oct 15",
 * "بكرة الساعة 5"). Built for the phrases people actually use in messages, in English and in
 * Egyptian and Modern Standard Arabic. Deterministic and dependency-free so the server and every
 * client extract the same thing (docs/ARCHITECTURE.md ADR-3).
 *
 * Avoids regex lookbehind so it runs on every JavaScript engine the app targets.
 */
import { asciiDigits } from './digits';
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
}

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
  const lower = text.toLowerCase();
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
    });
  }

  for (const m of scan(/\bthis\s+(morning|afternoon|evening)\b/i, lower)) {
    add({
      index: m.index,
      end: m.index + m[0].length,
      date: today,
      time: { hour: DAY_PARTS[m[1]!]!, minute: 0 },
    });
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
    /\b(?:(next|this|coming|on|by|until|till|before)\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tues?|wed|thu(?:rs?)?|fri|sat|sun)\b/i,
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
    // A bare "at 3" in conversation is afternoon; "at 9" is morning.
    if (hour <= 7) hour += 12;
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
  for (const m of scan(
    /(?:الساعة|الساعه)\s*(\d{1,2})(?::(\d{2}))?\s*(ص|م|الصبح|صباحا|صباحاً|مساء|مساءً|بالليل|العصر|الضهر|الظهر)?/u,
    text,
  )) {
    let hour = Number(m[1]);
    const minute = m[2] ? Number(m[2]) : 0;
    const part = m[3] ?? '';
    if (hour > 23) continue;
    if (/^(م|مساء|مساءً|بالليل|العصر)$/.test(part) && hour < 12) hour += 12;
    else if (/^(الضهر|الظهر)$/.test(part) && hour < 12 && hour <= 4) hour += 12;
    else if (!part && hour >= 1 && hour <= 7) hour += 12;
    add({ index: m.index, end: m.index + m[0].length, time: { hour, minute } });
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
      ((last.date && !last.time && p.time && !p.date) ||
        (last.time && !last.date && p.date && !p.time))
    ) {
      last.end = p.end;
      last.date = last.date ?? p.date;
      last.time = last.time ?? p.time;
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
