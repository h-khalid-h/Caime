import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './helpers';

/**
 * Every foreign key leads an index (M16 D2a, review 2026-10-17 §6 M): without one, deleting the
 * row it points at (an account, a conversation, a message) makes Postgres scan the whole table
 * that points at it, to null or delete what did; an account's deletion walked every message for
 * `pinned_by`. A new foreign key brings its index in the same migration (concurrently, in a
 * file of its own, on a big table).
 */
let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(() => t.close());

describe('foreign keys (M16 D2a)', () => {
  it('each leads a valid index, so nothing deleted scans a table whole', async () => {
    const { rows } = await sql<{ fk: string }>`
      select c.conrelid::regclass::text || '.' || a.attname as fk
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
      where c.contype = 'f'
        and not exists (
          select 1 from pg_index i
          where i.indrelid = c.conrelid and i.indisvalid and i.indkey[0] = c.conkey[1]
        )
      order by 1
    `.execute(t.ctx.db);
    expect(rows.map((r) => r.fk)).toEqual([]);
  });

  it('are each of one column, which is what the check above reads', async () => {
    const { rows } = await sql<{ n: number }>`
      select count(*)::int as n from pg_constraint where contype = 'f' and array_length(conkey, 1) > 1
    `.execute(t.ctx.db);
    expect(rows[0]!.n).toBe(0);
  });
});
