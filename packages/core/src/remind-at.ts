/**
 * When something kept for someone reminds them (M17 I2, "nothing slips"), on their own clock and
 * never in the past. One rule for every way an action is made (a suggestion accepted, Cai asked
 * to keep it, one added by hand), so what was promised is recalled before it's due rather than
 * at the moment it's late, and a wait on someone else is looked at on the day they named.
 *
 * - `asked`: what they asked to be reminded of. At its hour; on its day without one, that
 *   morning (within the hour when the morning has passed); with no day at all, the next morning.
 * - `own`: an action of theirs with a day (a promise, a request to them, one they added). The
 *   morning of its day, or an hour before the hour it names when that comes first; nothing for
 *   one already past its moment or with no day, which Actions and Attention already show.
 * - `wait`: something someone else said they'd do, by a day. At the hour they named, else at the
 *   end of that working day, so it's looked at on the day it was promised and not before.
 *
 * "The morning" is the person's morning brief's hour when they set one, else nine.
 */
import { addDays, zonedParts, zonedTimeToUtc } from './time';

export type RemindKind = 'asked' | 'own' | 'wait';

/** The hour a day's reminder rings, unless the person's morning brief names another. */
export const REMIND_MORNING = '09:00';
/** Where a wait's day has no hour: the end of that working day. */
export const WAIT_LOOK = '17:00';
const HOUR_MS = 3_600_000;
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export interface RemindInput {
  kind: RemindKind;
  /** When it's due: an hour that was named, or 09:00 of the day on the writer's clock. */
  dueAt: Date | string | null;
  /** Whether an hour was named (else only the day counts). */
  dueHasTime: boolean;
  now: Date;
  timeZone: string;
  /** The person's morning brief (`preferences.caiBrief`, HH:MM), when set. */
  morning?: string | null;
}

export function remindAtFor(input: RemindInput): Date | null {
  let zone = input.timeZone || 'UTC';
  try {
    zonedParts(input.now, zone);
  } catch {
    zone = 'UTC';
  }
  const now = input.now.getTime();
  const due = input.dueAt ? new Date(input.dueAt) : null;
  const dated = due && !Number.isNaN(due.getTime()) ? due : null;
  const morning = HHMM.test(input.morning ?? '') ? (input.morning as string) : REMIND_MORNING;
  const at = (day: { year: number; month: number; day: number }, hhmm: string) => {
    const [hour, minute] = hhmm.split(':').map(Number);
    return zonedTimeToUtc({ ...day, hour, minute }, zone);
  };
  const ahead = (d: Date | null) => (d && d.getTime() > now ? d : null);

  if (input.kind === 'asked') {
    if (!dated) {
      // The next morning: this one if it's more than an hour off, else tomorrow's.
      const today = zonedParts(input.now, zone);
      const soon = at(today, morning);
      return soon.getTime() > now + HOUR_MS ? soon : at(addDays(today, 1), morning);
    }
    if (input.dueHasTime) return ahead(dated);
    const day = zonedParts(dated, zone);
    const first = at(day, morning);
    if (first.getTime() > now) return first;
    // Its day already under way: within the hour, while the day lasts.
    const soon = new Date(now + HOUR_MS);
    return zonedParts(soon, zone).day === day.day && soon.getTime() > now ? soon : null;
  }

  if (!dated) return null;
  const day = zonedParts(dated, zone);
  if (input.kind === 'wait') return ahead(input.dueHasTime ? dated : at(day, WAIT_LOOK));

  // Its own: the morning of its day, or an hour before the hour it names when that's sooner.
  const first = at(day, morning);
  const before = input.dueHasTime ? new Date(dated.getTime() - HOUR_MS) : null;
  return ahead(before && before.getTime() < first.getTime() ? before : first);
}
