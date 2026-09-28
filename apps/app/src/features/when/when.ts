/**
 * A day, and a time on it if there is one, where the person is (their time zone, not the
 * device's): what an action's due date, a card's date and a mute's end are chosen as.
 */
import { addDays, weekStart, zonedParts, zonedTimeToUtc } from '@caishy/core/time';

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
 * The days people most often mean: today, tomorrow, and the first day of their next week (Sunday
 * in Egypt, Monday in most of Europe), from their own work week, as "next week" typed in a title
 * reads (core when.ts): the coming week's first day, a week on when that's today. Next week isn't
 * offered again when it's tomorrow.
 */
export function quickPicks(timeZone: string, workweek: number[], now = new Date()): QuickPick[] {
  const today = zonedParts(now, timeZone);
  const picks: QuickPick[] = [
    { label: 'Today', chosen: { date: dayText(today), time: null } },
    { label: 'Tomorrow', chosen: { date: dayText(addDays(today, 1)), time: null } },
  ];
  const ahead = (weekStart(workweek) - today.weekday + 7) % 7 || 7;
  if (ahead > 1)
    picks.push({
      label: 'Next week',
      chosen: { date: dayText(addDays(today, ahead)), time: null },
    });
  return picks;
}
