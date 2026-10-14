/**
 * A meeting that repeats (R58): agreed once, held every workday, every week, every two weeks or
 * every month, each time as a card of its own (its brief, its Join, its guests, its own cancel),
 * until the day its proposer said, if they said one. A series is anchored to its first time on
 * the wall clock of whoever proposed it, so a weekly meeting at 10:00 stays at 10:00 when the
 * clocks change, a monthly one on the 31st is held on each month's last day when the month is
 * shorter and on the 31st again when it isn't, and a workday one follows the week its proposer
 * works (R76: Sunday to Thursday in Cairo, Monday to Friday in Paris). Pure: the server posts
 * each time from it and the calendar looks ahead with it.
 */
import { AGREED_STATES } from './kit-states';
import type { Repeat } from './repeat';
import { addDays, daysInMonth, zonedParts, zonedTimeToUtc } from './time';

/**
 * Which series a card is a time of: the first card's id, which time it is (the first is 0), when
 * the first was, and the zone its wall clock is read in. Written by the server alone.
 */
export interface MeetingSeries {
  id: string;
  n: number;
  firstAt: string;
  zone: string;
  /** A workday series' days (0 Sunday … 6 Saturday): its proposer's week when it began. */
  days?: number[];
}

/** A week someone works when theirs isn't known: Monday to Friday. */
const WORKDAYS = [1, 2, 3, 4, 5];

/** The days a workday series is held on: its own, else Monday to Friday. */
function workdaysOf(days: number[] | undefined): number[] {
  return days?.length ? days : WORKDAYS;
}

function isWeek(days: unknown): days is number[] {
  return (
    Array.isArray(days) &&
    days.length > 0 &&
    days.length <= 7 &&
    days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6) &&
    new Set(days).size === days.length
  );
}

/** A day as the date fields keep it (`YYYY-MM-DD`). */
export function isDay(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(`${value}T00:00:00Z`))
  );
}

/** The series a card's payload says it's in, if it says one properly. */
export function seriesOf(payload: unknown): MeetingSeries | null {
  const s = (payload as { series?: unknown } | null)?.series as Partial<MeetingSeries> | undefined;
  if (!s || typeof s !== 'object') return null;
  if (typeof s.id !== 'string' || typeof s.firstAt !== 'string' || typeof s.zone !== 'string')
    return null;
  if (!Number.isInteger(s.n) || (s.n as number) < 0) return null;
  if (!Number.isFinite(Date.parse(s.firstAt))) return null;
  return {
    id: s.id,
    n: s.n as number,
    firstAt: s.firstAt,
    zone: s.zone,
    ...(isWeek(s.days) ? { days: s.days } : {}),
  };
}

/**
 * Whether a series was agreed, read from one of its cards: this time is agreed (a meeting
 * accepted, an appointment confirmed), or was before it was cancelled (that time alone). A later
 * time and a meeting space's copy are only ever made once it was, so their cancel is never the
 * proposal's.
 */
export function seriesAgreed(payload: unknown): boolean {
  const p = (payload ?? {}) as {
    kit?: unknown;
    state?: unknown;
    spaceOf?: unknown;
    history?: Array<{ state?: unknown }>;
  };
  const agreed = p.kit === 'appointment' ? AGREED_STATES.appointment : AGREED_STATES.meeting;
  if (p.state === agreed) return true;
  if (p.state !== 'cancelled') return false;
  return (
    (seriesOf(payload)?.n ?? 0) > 0 ||
    Boolean(p.spaceOf) ||
    (p.history ?? []).some((h) => h.state === agreed)
  );
}

/**
 * The `n`th workday after a day: every seven days after it hold each workday once, so the whole
 * weeks are skipped at once and the rest walked a day at a time.
 */
function nthWorkday(
  first: { year: number; month: number; day: number },
  n: number,
  days: number[],
): { year: number; month: number; day: number } {
  if (n <= 0) return first;
  const weeks = Math.floor((n - 1) / days.length);
  let left = n - weeks * days.length;
  let day = addDays(first, weeks * 7);
  while (left > 0) {
    day = addDays(day, 1);
    if (days.includes(day.weekday)) left--;
  }
  return day;
}

/** When the `n`th time of a series is (the first is 0). */
export function occurrenceAt(
  series: Pick<MeetingSeries, 'firstAt' | 'zone' | 'days'>,
  repeat: Repeat,
  n: number,
): Date {
  const first = zonedParts(new Date(series.firstAt), series.zone);
  let day: { year: number; month: number; day: number };
  if (repeat === 'workday') day = nthWorkday(first, n, workdaysOf(series.days));
  else if (repeat === 'month') {
    const months = first.month - 1 + n;
    const year = first.year + Math.floor(months / 12);
    const month = (((months % 12) + 12) % 12) + 1;
    day = { year, month, day: Math.min(first.day, daysInMonth(year, month)) };
  } else day = addDays(first, n * (repeat === 'week' ? 7 : 14));
  return zonedTimeToUtc({ ...day, hour: first.hour, minute: first.minute }, series.zone);
}

/** The longest a series looks for its next time: a weekly one missed for ten years. */
const LOOK_MAX = 520;

/** The day a moment falls on somewhere, as the date fields keep it (`YYYY-MM-DD`). */
export function dayIn(at: Date, zone: string): string {
  const p = zonedParts(at, zone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** Whether a time falls after a series' last day (`until`, on its own wall clock). */
function pastLastDay(at: Date, zone: string, until: string | null | undefined): boolean {
  return Boolean(until) && dayIn(at, zone) > (until as string);
}

/**
 * The next time after the `series.n`th that starts after `now`: the one to post once a time
 * ends, skipping any missed while nothing could post (the server away, a job held up); none
 * after its last day.
 */
export function nextOccurrence(
  series: MeetingSeries,
  repeat: Repeat,
  now: Date,
  until?: string | null,
): { n: number; at: Date } | null {
  for (let n = series.n + 1; n <= series.n + LOOK_MAX; n++) {
    const at = occurrenceAt(series, repeat, n);
    if (pastLastDay(at, series.zone, until)) return null;
    if (at > now) return { n, at };
  }
  return null;
}

/**
 * The times after the `series.n`th that start within a window, at most `max` of them: what a
 * calendar shows ahead of the card that's been posted, before each is posted in its turn.
 */
export function occurrencesBetween(
  series: MeetingSeries,
  repeat: Repeat,
  from: Date,
  until: Date,
  max: number,
  lastDay?: string | null,
): Array<{ n: number; at: Date }> {
  const out: Array<{ n: number; at: Date }> = [];
  for (let n = series.n + 1; n <= series.n + LOOK_MAX && out.length < max; n++) {
    const at = occurrenceAt(series, repeat, n);
    if (at > until || pastLastDay(at, series.zone, lastDay)) break;
    if (at >= from) out.push({ n, at });
  }
  return out;
}

/** How many times a year a series holds: what a calendar looks ahead for at most. */
export function timesAYear(repeat: Repeat, days?: number[]): number {
  if (repeat === 'workday') return 53 * workdaysOf(days).length;
  return repeat === 'week' ? 53 : repeat === 'fortnight' ? 27 : 13;
}
