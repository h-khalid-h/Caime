/**
 * One small value every instance shares (`server_settings`): the last backup, the audit
 * chain's last check, the providers' last probes (review 2026-10-17 §4: those three were held
 * in memory by the instance that ran the task, so an instance without workers reported no
 * backup and an alert fired falsely). A key is a short dotted name; a value is JSON.
 */
import type { Kysely } from 'kysely';
import type { Database } from '../db/schema';

export async function readSetting<T>(db: Kysely<Database>, key: string): Promise<T | null> {
  const row = await db
    .selectFrom('server_settings')
    .select('value')
    .where('key', '=', key)
    .executeTakeFirst();
  return (row?.value as T | undefined) ?? null;
}

export async function readSettings<T>(
  db: Kysely<Database>,
  keys: string[],
): Promise<Map<string, T>> {
  if (keys.length === 0) return new Map();
  const rows = await db
    .selectFrom('server_settings')
    .select(['key', 'value'])
    .where('key', 'in', keys)
    .execute();
  return new Map(rows.map((r) => [r.key, r.value as T]));
}

export async function writeSetting(
  db: Kysely<Database>,
  key: string,
  value: unknown,
  now: Date,
): Promise<void> {
  await db
    .insertInto('server_settings')
    .values({ key, value: JSON.stringify(value) })
    .onConflict((oc) =>
      oc.column('key').doUpdateSet({ value: JSON.stringify(value), updated_at: now }),
    )
    .execute();
}
