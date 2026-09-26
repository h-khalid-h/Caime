/**
 * Time-zone aware calendar helpers with no dependencies (Intl only), so the same code runs in
 * Node, browsers and Hermes. Weekdays are 0 = Sunday … 6 = Saturday.
 */

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number; // 0 = Sunday
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatterCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
    });
    formatterCache.set(timeZone, f);
  }
  return f;
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function isValidTimeZone(timeZone: string): boolean {
  try {
    formatter(timeZone);
    return true;
  } catch {
    return false;
  }
}

/** Wall-clock parts of `date` in `timeZone`. */
export function zonedParts(date: Date, timeZone: string): ZonedParts {
  const parts: Record<string, string> = {};
  for (const p of formatter(timeZone).formatToParts(date)) parts[p.type] = p.value;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: WEEKDAYS[parts.weekday ?? 'Sun'] ?? 0,
  };
}

/** Offset of `timeZone` from UTC at `date`, in minutes (Cairo in winter: +120). */
export function timeZoneOffsetMinutes(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

/**
 * The instant at which the wall clock in `timeZone` reads the given local time. Non-existent
 * local times (spring-forward gaps) resolve to the instant just after the gap.
 */
export function zonedTimeToUtc(
  local: { year: number; month: number; day: number; hour?: number; minute?: number },
  timeZone: string,
): Date {
  const guess = Date.UTC(local.year, local.month - 1, local.day, local.hour ?? 0, local.minute ?? 0);
  let offset = timeZoneOffsetMinutes(new Date(guess), timeZone);
  let result = guess - offset * 60000;
  const second = timeZoneOffsetMinutes(new Date(result), timeZone);
  if (second !== offset) {
    offset = second;
    result = guess - offset * 60000;
  }
  return new Date(result);
}

/** Calendar arithmetic on a local date (no time-zone involvement). */
export function addDays(
  d: { year: number; month: number; day: number },
  days: number,
): { year: number; month: number; day: number; weekday: number } {
  const t = new Date(Date.UTC(d.year, d.month - 1, d.day + days));
  return {
    year: t.getUTCFullYear(),
    month: t.getUTCMonth() + 1,
    day: t.getUTCDate(),
    weekday: t.getUTCDay(),
  };
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

// ---------------------------------------------------------------------------------------------
// Workweeks (PRODUCT-REVIEW R31). Work-hour defaults follow the local workweek.

const SUN_THU = [0, 1, 2, 3, 4];
const SAT_WED = [6, 0, 1, 2, 3];
const MON_FRI = [1, 2, 3, 4, 5];
const SUN_FRI = [0, 1, 2, 3, 4, 5];

const WORKWEEK_BY_REGION: Record<string, number[]> = {
  EG: SUN_THU,
  SA: SUN_THU,
  KW: SUN_THU,
  QA: SUN_THU,
  BH: SUN_THU,
  OM: SUN_THU,
  JO: SUN_THU,
  IQ: SUN_THU,
  IL: SUN_THU,
  DZ: SUN_THU,
  LY: SUN_THU,
  SY: SUN_THU,
  YE: SUN_THU,
  SD: SUN_THU,
  AF: SAT_WED,
  IR: SAT_WED,
  NP: SUN_FRI,
};

/** Workdays for a region (ISO 3166-1 alpha-2) or a locale such as `ar-EG`. Default Mon–Fri. */
export function defaultWorkweek(regionOrLocale?: string | null): number[] {
  if (!regionOrLocale) return [...MON_FRI];
  const region = regionOrLocale.includes('-')
    ? regionOrLocale.split('-').pop()!.toUpperCase()
    : regionOrLocale.toUpperCase();
  return [...(WORKWEEK_BY_REGION[region] ?? MON_FRI)];
}

/** First day of the local week: the first workday of the workweek (Sunday in Egypt, Monday in France). */
export function weekStart(workweek: number[]): number {
  if (workweek.includes(1) && workweek.includes(5) && !workweek.includes(0)) return 1;
  return workweek[0] ?? 1;
}

// ---------------------------------------------------------------------------------------------
// Schedules: "08:00–20:00 on workdays". Overnight ranges (22:00–06:00) are supported.

export interface Schedule {
  days: number[];
  /** "HH:MM" local time. */
  start: string;
  end: string;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map((x) => Number(x));
  return (h ?? 0) * 60 + (m ?? 0);
}

export function isWithinSchedule(schedule: Schedule, now: Date, timeZone: string): boolean {
  const p = zonedParts(now, timeZone);
  const minute = p.hour * 60 + p.minute;
  const start = toMinutes(schedule.start);
  const end = toMinutes(schedule.end);
  if (start === end) return schedule.days.includes(p.weekday);
  if (start < end) return schedule.days.includes(p.weekday) && minute >= start && minute < end;
  // Overnight: the part after midnight belongs to the previous day's window.
  if (minute >= start) return schedule.days.includes(p.weekday);
  const previous = (p.weekday + 6) % 7;
  return minute < end && schedule.days.includes(previous);
}

/** The next instant at or after `now` when `schedule` is active (search up to 8 days). */
export function nextScheduleStart(schedule: Schedule, now: Date, timeZone: string): Date | null {
  if (isWithinSchedule(schedule, now, timeZone)) return now;
  const p = zonedParts(now, timeZone);
  const start = toMinutes(schedule.start);
  for (let offset = 0; offset <= 8; offset++) {
    const d = addDays(p, offset);
    if (!schedule.days.includes(d.weekday)) continue;
    const candidate = zonedTimeToUtc(
      { year: d.year, month: d.month, day: d.day, hour: Math.floor(start / 60), minute: start % 60 },
      timeZone,
    );
    if (candidate.getTime() > now.getTime()) return candidate;
  }
  return null;
}

export function workHours(workweek: number[]): Schedule {
  return { days: workweek, start: '09:00', end: '18:00' };
}
