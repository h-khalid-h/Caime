/**
 * A meeting's or an appointment's start on the clock it was set on (R119, M17 I19c). Its instant
 * (`at`) is kept with the zone it was set in and its wall-clock time there (`local`), so when a
 * zone's rules change before the day (Egypt brought summer time back in 2023 with weeks of notice),
 * the meeting stays at 10:00 where it was set and its instant is derived again. Written by the
 * server alone; a device's own `zone` or `local` is never kept.
 */
import { isTimeZone } from './ics';
import { zonedParts, zonedTimeToUtc } from './time';

const pad = (n: number) => String(n).padStart(2, '0');

const LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** A start kept with its clock: the zone given and the wall-clock minute `at` reads there. */
export function onClock<T extends { at: string }>(
  start: T,
  zone: string,
): T & { zone: string; local: string } {
  const p = zonedParts(new Date(start.at), zone);
  return {
    ...start,
    zone,
    local: `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`,
  };
}

/**
 * The instant a start kept on a clock falls at, under the zone's rules as this runtime knows them;
 * null for a start kept without one (an invitation by mail, whose organizer's calendar sends its
 * own updates, and every card from before).
 */
export function instantOnClock(start: { zone?: unknown; local?: unknown }): Date | null {
  if (typeof start.zone !== 'string' || typeof start.local !== 'string') return null;
  // An unknown zone reads as UTC to the formatter: a zone no runtime knows is no clock.
  if (!isTimeZone(start.zone)) return null;
  const m = LOCAL.exec(start.local);
  if (!m) return null;
  try {
    const at = zonedTimeToUtc(
      { year: +m[1]!, month: +m[2]!, day: +m[3]!, hour: +m[4]!, minute: +m[5]! },
      start.zone,
    );
    return Number.isNaN(at.getTime()) ? null : at;
  } catch {
    return null;
  }
}

/**
 * Where a start kept on a clock now falls, when that's another minute than the instant kept (its
 * zone's rules changed since): null when it's where it was, or kept without a clock.
 */
export function movedByItsClock(start: {
  at?: unknown;
  zone?: unknown;
  local?: unknown;
}): Date | null {
  const now = instantOnClock(start);
  if (!now || typeof start.at !== 'string') return null;
  const kept = Date.parse(start.at);
  if (Number.isNaN(kept)) return null;
  return Math.abs(now.getTime() - kept) >= 60_000 ? now : null;
}
