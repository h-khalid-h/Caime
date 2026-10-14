/**
 * A meeting that repeats (R58): agreed once, held every week, every two weeks or every month,
 * each time as a card of its own (its brief, its Join, its guests, its own cancel). A series is
 * anchored to its first time on the wall clock of whoever proposed it, so a weekly meeting at
 * 10:00 stays at 10:00 when the clocks change, and a monthly one on the 31st is held on each
 * month's last day when the month is shorter and on the 31st again when it isn't. Pure: the
 * server posts each time from it and the calendar looks ahead with it.
 */
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
}

/** The series a card's payload says it's in, if it says one properly. */
export function seriesOf(payload: unknown): MeetingSeries | null {
  const s = (payload as { series?: unknown } | null)?.series as Partial<MeetingSeries> | undefined;
  if (!s || typeof s !== 'object') return null;
  if (typeof s.id !== 'string' || typeof s.firstAt !== 'string' || typeof s.zone !== 'string')
    return null;
  if (!Number.isInteger(s.n) || (s.n as number) < 0) return null;
  if (!Number.isFinite(Date.parse(s.firstAt))) return null;
  return { id: s.id, n: s.n as number, firstAt: s.firstAt, zone: s.zone };
}

/**
 * Whether a series was agreed, read from one of its cards: this time is accepted, or was before
 * it was cancelled (that time alone). A later time and a meeting space's copy are only ever made
 * once it was, so their cancel is never the proposal's.
 */
export function seriesAgreed(payload: unknown): boolean {
  const p = (payload ?? {}) as {
    state?: unknown;
    spaceOf?: unknown;
    history?: Array<{ state?: unknown }>;
  };
  if (p.state === 'accepted') return true;
  if (p.state !== 'cancelled') return false;
  return (
    (seriesOf(payload)?.n ?? 0) > 0 ||
    Boolean(p.spaceOf) ||
    (p.history ?? []).some((h) => h.state === 'accepted')
  );
}

/** When the `n`th time of a series is (the first is 0). */
export function occurrenceAt(
  series: Pick<MeetingSeries, 'firstAt' | 'zone'>,
  repeat: Repeat,
  n: number,
): Date {
  const first = zonedParts(new Date(series.firstAt), series.zone);
  let day: { year: number; month: number; day: number };
  if (repeat === 'month') {
    const months = first.month - 1 + n;
    const year = first.year + Math.floor(months / 12);
    const month = (((months % 12) + 12) % 12) + 1;
    day = { year, month, day: Math.min(first.day, daysInMonth(year, month)) };
  } else day = addDays(first, n * (repeat === 'week' ? 7 : 14));
  return zonedTimeToUtc({ ...day, hour: first.hour, minute: first.minute }, series.zone);
}

/** The longest a series looks for its next time: a weekly one missed for ten years. */
const LOOK_MAX = 520;

/**
 * The next time after the `series.n`th that starts after `now`: the one to post once a time
 * ends, skipping any missed while nothing could post (the server away, a job held up).
 */
export function nextOccurrence(
  series: MeetingSeries,
  repeat: Repeat,
  now: Date,
): { n: number; at: Date } | null {
  for (let n = series.n + 1; n <= series.n + LOOK_MAX; n++) {
    const at = occurrenceAt(series, repeat, n);
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
): Array<{ n: number; at: Date }> {
  const out: Array<{ n: number; at: Date }> = [];
  for (let n = series.n + 1; n <= series.n + LOOK_MAX && out.length < max; n++) {
    const at = occurrenceAt(series, repeat, n);
    if (at > until) break;
    if (at >= from) out.push({ n, at });
  }
  return out;
}
