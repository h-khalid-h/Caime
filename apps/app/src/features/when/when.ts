/**
 * A day, and a time on it if there is one, where the person is (their time zone, not the
 * device's): what an action's due date, a card's date and a mute's end are chosen as.
 */
import { addDays, zonedParts, zonedTimeToUtc } from '@caishy/core/time';

export interface Chosen {
  /** YYYY-MM-DD, where the person is. */
  date: string;
  /** HH:MM, 24-hour, or null for the day itself. */
  time: string | null;
}

const pad = (n: number) => String(n).padStart(2, '0');
const dayText = (d: { year: number; month: number; day: number }) =>
  `${d.year}-${pad(d.month)}-${pad(d.day)}`;

/** The instant it names: the time on the day, or 09:00 when it names none (core when.ts). */
export function instantOf(c: Chosen, timeZone: string): Date {
  const [year, month, day] = c.date.split('-').map(Number) as [number, number, number];
  const [hour, minute] = (c.time ?? '09:00').split(':').map(Number) as [number, number];
  return zonedTimeToUtc({ year, month, day, hour, minute }, timeZone);
}

/** What an instant is where the person is, as a day and a time. */
export function chosenOf(iso: string, timeZone: string, hasTime: boolean): Chosen {
  const p = zonedParts(new Date(iso), timeZone);
  return { date: dayText(p), time: hasTime ? `${pad(p.hour)}:${pad(p.minute)}` : null };
}

/** Today where the person is. */
export function todayWhere(timeZone: string, now = new Date()): string {
  return dayText(zonedParts(now, timeZone));
}

export interface QuickPick {
  label: string;
  chosen: Chosen;
}

/**
 * The days people most often mean: today, tomorrow, and the first day of their next work week
 * (Sunday in Egypt, Monday in most of Europe), from their own work week.
 */
export function quickPicks(timeZone: string, workweek: number[], now = new Date()): QuickPick[] {
  const today = zonedParts(now, timeZone);
  const picks: QuickPick[] = [
    { label: 'Today', chosen: { date: dayText(today), time: null } },
    { label: 'Tomorrow', chosen: { date: dayText(addDays(today, 1)), time: null } },
  ];
  // The next week's first working day: after the next day off, the first day worked.
  const works = new Set(workweek);
  let i = 1;
  while (i < 8 && works.has(addDays(today, i).weekday)) i++;
  while (i < 15 && !works.has(addDays(today, i).weekday)) i++;
  if (i > 1 && i < 15) {
    const d = addDays(today, i);
    picks.push({ label: 'Next week', chosen: { date: dayText(d), time: null } });
  }
  return picks;
}
