/**
 * When an action is overdue, in SQL, as core overdueAt reads it for the apps: at its time, or
 * once its day is over when it has no time (it's kept at 09:00 of that day).
 */
import { DAY_DUE_MS } from '@caishy/core/format';
import { sql } from 'kysely';

export const overdueAtSql = sql<Date>`(due_at + case when due_has_time then interval '0' else ${`${DAY_DUE_MS / 60_000} minutes`}::interval end)`;
