import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CATALOG_COLUMNS, ORG_COLUMNS, USER_COLUMNS } from '../src/db/schema';
import { createTestApp, type TestApp } from './helpers';

/**
 * A person or an organization is read without its catalog (review 2026-10-09 M19): the five
 * jsonb columns ride only where the catalog is drawn, booked from or exported.
 */
let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(() => t.close());

/**
 * Where the catalog is the point: the public pages, an export, the organization's own view and
 * summary, a profile, an item's photo.
 */
const CATALOG_READERS = [
  'lib/public-pages.ts',
  'lib/export.ts',
  'lib/orgs.ts',
  'modules/orgs.ts',
  'modules/people.ts',
  'modules/files.ts',
];

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
  it('nothing but the catalog readers selects everything of a person or an organization', () => {
    const root = join(__dirname, '..', 'src');
    const offenders = readdirSync(root, { recursive: true })
      .map(String)
      .filter((f) => f.endsWith('.ts') && !CATALOG_READERS.includes(f))
      .filter((f) =>
        /selectFrom\('(users|organizations)'\)\s*\.selectAll\(\)/.test(
          readFileSync(join(root, f), 'utf8'),
        ),
      );
    expect(offenders).toEqual([]);
  });
});
