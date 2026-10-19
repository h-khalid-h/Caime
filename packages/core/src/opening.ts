/**
 * When a host is open (M16 H2), read from its bookable hours: what an organization's away message
 * answers. The server's alone: the app never asks, and booking.ts is in the first download.
 */
import { type BookingDay, type BookingHours, closedOn } from './booking';
import { addDays, zonedParts, zonedTimeToUtc } from './time';

const minutesOf = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};
const pad = (n: number) => String(n).padStart(2, '0');
const dayKey = (d: { year: number; month: number; day: number }) =>
  `${d.year}-${pad(d.month)}-${pad(d.day)}`;

/** Every week the host keeps: its own, and each branch's that has days of its own (R92). */
function weeks(hours: BookingHours): BookingDay[][] {
  return [hours.days, ...(hours.placeHours ?? []).map((p) => p.days)].filter((w) => w.length > 0);
}

/** Whether the host is open at a moment: a week of its holds it, on a day it isn't closed. */
export function openAt(hours: BookingHours, at: Date): boolean {
  const p = zonedParts(at, hours.timeZone);
  if (closedOn(hours, dayKey(p))) return false;
  const now = p.hour * 60 + p.minute;
  return weeks(hours).some((week) =>
    week.some(
      (d) => d.weekday === p.weekday && minutesOf(d.start) <= now && now < minutesOf(d.end),
    ),
  );
}

/** When the host next opens after a moment, within a fortnight of it; null when it doesn't. */
export function nextOpening(hours: BookingHours, from: Date): Date | null {
  const first = zonedParts(from, hours.timeZone);
  for (let offset = 0; offset <= 14; offset++) {
    const d = addDays(first, offset);
    if (closedOn(hours, dayKey(d))) continue;
    let soonest: number | null = null;
    for (const week of weeks(hours))
      for (const day of week) {
        if (day.weekday !== d.weekday) continue;
        const m = minutesOf(day.start);
        const start = zonedTimeToUtc(
          { year: d.year, month: d.month, day: d.day, hour: Math.floor(m / 60), minute: m % 60 },
          hours.timeZone,
        ).getTime();
        if (start > from.getTime() && (soonest === null || start < soonest)) soonest = start;
      }
    if (soonest !== null) return new Date(soonest);
  }
  return null;
}
