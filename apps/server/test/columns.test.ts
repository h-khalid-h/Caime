import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CATALOG_COLUMNS, ORG_COLUMNS, USER_COLUMNS } from '../src/db/schema';
import { createTestApp, type TestApp } from './helpers';

/**
 * A person or an organization is read without its catalog (review 2026-10-09 M19): the five
 * jsonb columns ride only where the catalog is drawn, booked from or exported, which
 * `select-all.test.ts` holds the source to (M16 D1); here, the lists are held to the tables.
 */
let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(() => t.close());

describe('people and organizations without their catalogs (M19)', () => {
  it('the column lists are the tables, less the catalog', async () => {
    for (const [table, columns] of [
      ['users', USER_COLUMNS],
      ['organizations', ORG_COLUMNS],
    ] as const) {
      const rows = await sql<{ column_name: string }>`
        select column_name from information_schema.columns where table_name = ${table}
      `.execute(t.ctx.db);
      expect([...columns, ...CATALOG_COLUMNS].sort(), table).toEqual(
        rows.rows.map((r) => r.column_name).sort(),
      );
    }
  });
});
