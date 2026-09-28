/**
 * Calendar days as the server keeps them and the web's date input writes them (YYYY-MM-DD), for
 * the date fields (DateField): a day is a day wherever the device is, never a moment.
 */

export interface DateFieldProps {
  label: string;
  /** The day chosen (YYYY-MM-DD), or null while there's none. */
  value: string | null;
  /** A day, or null while the web's field holds only part of one. */
  onChange: (day: string | null) => void;
  /** The earliest and latest days that can be chosen. */
  min?: string;
  max?: string;
  hint?: string;
  error?: string | null;
  /** Shown while no day is chosen. */
  placeholder?: string;
  /**
   * A day long ago that people know by heart (a birthday): the phone's picker starts on the
   * year, or shows wheels; a calendar suits a day near now.
   */
  memorable?: boolean;
  testID?: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** The day a date falls on where the device is. */
export function dayOf(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * The day as a date at noon where the device is: a picker shows it as that day, and no change
 * of clocks at midnight moves it to the one before.
 */
export function dateOf(day: string | null | undefined): Date | null {
  const m = day ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(day) : null;
  if (!m) return null;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
  return dayOf(date) === day ? date : null;
}

/** The same day `years` before (29 February becomes the 28th in a year without one). */
export function yearsBefore(day: string, years: number): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const last = new Date(Date.UTC(y - years, m, 0)).getUTCDate();
  return `${y - years}-${pad(m)}-${pad(Math.min(d, last))}`;
}

/** How a day reads in the person's language: "15 March 1990", "March 15, 1990". */
export function formatDay(day: string, locale?: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return day;
  const at = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  try {
    return new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(at);
  } catch {
    return day;
  }
}
