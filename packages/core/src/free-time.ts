/**
 * When someone is free on a day (M17 I7): the gaps their busy times leave in the hours that count
 * as their day. Pure, so Cai's answer, a prepared meeting's clash and their tests read one rule;
 * the server gathers the busy times (`lib/free-time.ts`).
 */
import { zonedParts, zonedTimeToUtc } from './time';

/** A stretch of time, in milliseconds since the epoch, its end not in it. */
export interface Span {
  start: number;
  end: number;
}

/** The shortest stretch worth calling free: half an hour, as a meeting's shortest card is. */
export const FREE_MIN_MS = 30 * 60_000;

/** The busy spans inside the window, overlapping ones joined, earliest first. */
export function mergeBusy(window: Span, busy: readonly Span[]): Span[] {
  const inside = busy
    .map((b) => ({ start: Math.max(b.start, window.start), end: Math.min(b.end, window.end) }))
    .filter((b) => b.end > b.start)
    .sort((a, b) => a.start - b.start);
  const out: Span[] = [];
  for (const b of inside) {
    const last = out.at(-1);
    if (last && b.start <= last.end) last.end = Math.max(last.end, b.end);
    else out.push({ ...b });
  }
  return out;
}

/** The free stretches of at least `minMs` the busy spans leave in the window. */
export function freeGaps(window: Span, busy: readonly Span[], minMs = FREE_MIN_MS): Span[] {
  const gaps: Span[] = [];
  let at = window.start;
  for (const b of mergeBusy(window, busy)) {
    if (b.start - at >= minMs) gaps.push({ start: at, end: b.start });
    at = Math.max(at, b.end);
  }
  if (window.end - at >= minMs) gaps.push({ start: at, end: window.end });
  return gaps;
}

/** Whether a span meets any of the busy ones. */
export function clashes(span: Span, busy: readonly Span[]): boolean {
  return busy.some((b) => b.start < span.end && span.start < b.end);
}

/**
 * The first start at or after `from` where `ms` fits free inside the window, on the half hour
 * (a meeting card's own step), or null when none does.
 */
export function nextFree(
  window: Span,
  busy: readonly Span[],
  from: number,
  ms: number,
): number | null {
  const step = FREE_MIN_MS;
  const first = Math.max(window.start, Math.ceil(from / step) * step);
  for (const gap of freeGaps(window, busy, ms)) {
    const start = Math.max(gap.start, Math.ceil(Math.max(first, gap.start) / step) * step);
    if (start + ms <= gap.end) return start;
  }
  return null;
}

/** "HH:MM" as minutes past midnight. */
const minutesOf = (hhmm: string) => {
  const [h = 0, m = 0] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/**
 * The hours that count as someone's day on the date `day` falls on in their zone: `start` and
 * `end` ("HH:MM") on their clock, or null for a day that isn't theirs to plan (a day off).
 */
export function dayWindow(
  day: Date,
  timeZone: string,
  hours: ReadonlyArray<{ weekday: number; start: string; end: string }>,
): (Span & { weekday: number }) | null {
  const p = zonedParts(day, timeZone);
  const weekday = p.weekday;
  const today = hours.filter((h) => h.weekday === weekday);
  if (today.length === 0) return null;
  const from = Math.min(...today.map((h) => minutesOf(h.start)));
  const to = Math.max(...today.map((h) => minutesOf(h.end)));
  const at = (minutes: number) =>
    zonedTimeToUtc(
      {
        year: p.year,
        month: p.month,
        day: p.day,
        hour: Math.floor(minutes / 60),
        minute: minutes % 60,
      },
      timeZone,
    ).getTime();
  return { start: at(from), end: at(to), weekday };
}
