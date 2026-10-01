/**
 * Bookings (R51): an organization's bookable hours, and the open slots in them. Pure: the
 * server works out the slots (taking out what's booked) and the app shows them; nothing here
 * touches a clock or a store. Times are the organization's own, in its time zone; a slot is
 * an instant, so a customer anywhere sees it in theirs.
 */
import { addDays, zonedParts, zonedTimeToUtc } from './time';

export const SLOT_MINUTES = [15, 20, 30, 45, 60, 90, 120] as const;
export type SlotMinutes = (typeof SLOT_MINUTES)[number];

/** How far ahead a customer may book, at most, and how soon. */
export const BOOKING_HORIZON_DAYS_MAX = 90;
export const BOOKING_LEAD_MINUTES_MAX = 7 * 24 * 60;

export interface BookingDay {
  /** 0 is Sunday, as JavaScript counts. */
  weekday: number;
  /** "HH:MM", the organization's local time; `end` after `start`, on the same day. */
  start: string;
  end: string;
}

export interface BookingHours {
  /** An IANA time zone: the organization's own. */
  timeZone: string;
  slotMinutes: SlotMinutes;
  days: BookingDay[];
  /** Nothing sooner than this from now may be booked. */
  leadMinutes: number;
  /** Nothing further ahead than this many days may be booked. */
  horizonDays: number;
}

export interface Busy {
  start: Date;
  end: Date;
}

const minutesOf = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map((x) => Number(x));
  return (h ?? 0) * 60 + (m ?? 0);
};

/**
 * The slots open between `from` and `to`: each day's hours cut into slots of the length
 * chosen, from the first that starts at or after `from` and at least the lead time after
 * `now`, to the last that ends by the day's end, within the horizon, and not overlapping
 * anything busy. Soonest first, at most `limit`.
 */
export function openSlots(
  hours: BookingHours,
  opts: { from: Date; to: Date; now: Date; busy: Busy[]; limit?: number },
): Date[] {
  const limit = opts.limit ?? 200;
  const earliest = Math.max(opts.from.getTime(), opts.now.getTime() + hours.leadMinutes * 60_000);
  const latest = Math.min(opts.to.getTime(), opts.now.getTime() + hours.horizonDays * 86_400_000);
  if (latest <= earliest || hours.days.length === 0) return [];
  const slotMs = hours.slotMinutes * 60_000;
  const busy = opts.busy.map((b) => ({ start: b.start.getTime(), end: b.end.getTime() }));
  const out: Date[] = [];
  // Walk the days in the organization's zone, from the day `earliest` falls on.
  const first = zonedParts(new Date(earliest), hours.timeZone);
  for (let offset = 0; offset <= hours.horizonDays + 1 && out.length < limit; offset++) {
    const d = addDays(first, offset);
    for (const day of hours.days) {
      if (day.weekday !== d.weekday) continue;
      const open = minutesOf(day.start);
      const close = minutesOf(day.end);
      for (let m = open; m + hours.slotMinutes <= close; m += hours.slotMinutes) {
        const start = zonedTimeToUtc(
          { year: d.year, month: d.month, day: d.day, hour: Math.floor(m / 60), minute: m % 60 },
          hours.timeZone,
        ).getTime();
        const end = start + slotMs;
        if (start < earliest) continue;
        if (end > latest) {
          if (start >= latest) break;
          continue;
        }
        if (busy.some((b) => b.start < end && b.end > start)) continue;
        out.push(new Date(start));
        if (out.length >= limit) break;
      }
      if (out.length >= limit) break;
    }
  }
  return out.sort((a, b) => a.getTime() - b.getTime());
}

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "Sun–Thu 9:00–17:00, Sat 9:00–13:00 · 30 min": how a page says the hours. */
export function describeHours(hours: BookingHours): string {
  const byRange = new Map<string, number[]>();
  for (const d of [...hours.days].sort((a, b) => a.weekday - b.weekday)) {
    const key = `${d.start}–${d.end}`;
    byRange.set(key, [...(byRange.get(key) ?? []), d.weekday]);
  }
  const runs = (days: number[]): string => {
    const parts: string[] = [];
    let i = 0;
    while (i < days.length) {
      let j = i;
      while (j + 1 < days.length && days[j + 1] === (days[j] ?? 0) + 1) j++;
      parts.push(
        j - i >= 2
          ? `${DAY_SHORT[days[i] ?? 0]}–${DAY_SHORT[days[j] ?? 0]}`
          : days
              .slice(i, j + 1)
              .map((x) => DAY_SHORT[x])
              .join(', '),
      );
      i = j + 1;
    }
    return parts.join(', ');
  };
  const trim = (hhmm: string) => hhmm.replace(/^0/, '');
  const ranges = [...byRange].map(
    ([range, days]) => `${runs(days)} ${range.split('–').map(trim).join('–')}`,
  );
  return `${ranges.join(', ')} · ${hours.slotMinutes} min`;
}
