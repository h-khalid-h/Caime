/**
 * When an action is overdue, in SQL, as core overdueAt reads it for the apps: at its time, or
 * once its day is over when it has no time (it's kept at 09:00 of that day).
 */
import { DAY_DUE_MS } from '@caime/core/format';
import { dayIn } from '@caime/core/series';
import { zonedTimeToUtc } from '@caime/core/time';
import { sql } from 'kysely';

/**
 * The day an action is due on when it has no time (R119, I19b): its `due_at` (09:00 of the day on
 * its owner's clock) read on that clock once, in the statement that writes it, and kept; null for
 * a due with a time or none. Every write of `due_at` writes this beside it.
 */
export function dueOnSql(
  dueAt: Date | string | null | undefined,
  hasTime: boolean,
  ownerId: string,
) {
  if (!dueAt || hasTime) return null;
  const at = dueAt instanceof Date ? dueAt.toISOString() : dueAt;
  return sql<string>`((${at}::timestamptz) at time zone (select coalesce(nullif(time_zone, ''), 'UTC') from users where id = ${ownerId}))::date`;
}

/**
 * An action's due day when it has no time: as kept (`due_on`), else read from `due_at` on its
 * owner's clock (a row written before the day was kept, or by the release before).
 */
export function dueDay(
  t: { due_at: Date | null; due_has_time: boolean; due_on?: string | null },
  ownerZone: string,
): string | null {
  if (t.due_has_time || !t.due_at) return null;
  return t.due_on ?? dayIn(t.due_at, ownerZone);
}

/** A due day's 09:00 on a reader's clock, as its owner's is kept: where a reader's list puts it. */
export function dueInstant(on: string, zone: string): Date {
  const [year, month, day] = on.split('-').map(Number) as [number, number, number];
  return zonedTimeToUtc({ year, month, day, hour: 9 }, zone);
}

/**
 * When an action is due, for one reader (R119, I19b): due on a day, that day's 09:00 on the
 * reader's clock, as its owner's is kept, so a list of theirs puts it on its day; else its time.
 * For a query over `tasks` alone.
 */
export const dueAtForSql = (readerId: string) =>
  sql<Date | null>`case when due_on is not null then ((due_on + time '09:00') at time zone (select coalesce(nullif(time_zone, ''), 'UTC') from users where id = ${readerId})) else due_at end`;

export const overdueAtSql = sql<Date>`(due_at + case when due_has_time then interval '0' else ${`${DAY_DUE_MS / 60_000} minutes`}::interval end)`;
