/**
 * Times of day as Caime keeps them (24-hour HH:MM, as a quiet hour's start or a schedule's end),
 * for the time fields (TimeField): shown as the person's language says times.
 */
import { asciiDigits } from '@caime/core/digits';

export interface TimeFieldProps {
  label: string;
  /** The time chosen, 24-hour HH:MM. */
  value: string;
  onChange: (time: string) => void;
  hint?: string;
  error?: string | null;
  testID?: string;
}

export const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * The time as a date for a picker to start on, on a day no clock changes on (1 January 2000,
 * where the device is): on a day clocks go forward, a time in the gap would open an hour later
 * and be saved so.
 */
export function timeDate(time: string): Date {
  const [h, m] = TIME_OF_DAY.test(time) ? time.split(':').map(Number) : [9, 0];
  return new Date(2000, 0, 1, h ?? 9, m ?? 0, 0, 0);
}

/** A picker's date as the time it shows. */
export function timeOf(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** How a time reads in the person's language: "8:30 PM", "20:30". */
export function formatTime(time: string, locale?: string): string {
  if (!TIME_OF_DAY.test(time)) return time;
  const [h, m] = time.split(':').map(Number) as [number, number];
  try {
    return new Intl.DateTimeFormat(locale, {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(2000, 0, 1, h, m)));
  } catch {
    return time;
  }
}

/** Whether the person's language counts the day's hours to 24 (for Android's clock). */
export function uses24Hours(locale?: string): boolean {
  try {
    const f = new Intl.DateTimeFormat(locale, { hour: 'numeric', timeZone: 'UTC' });
    const cycle = f.resolvedOptions().hourCycle;
    if (cycle) return cycle === 'h23' || cycle === 'h24';
    // One o'clock in the afternoon, as the language writes it in its own digits (۱۳ in Persian):
    // 13 on a 24-hour clock.
    return /13/.test(asciiDigits(f.format(new Date(Date.UTC(2000, 0, 1, 13)))));
  } catch {
    return true;
  }
}
