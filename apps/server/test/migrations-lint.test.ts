/**
 * The migrations lint (review 2026-10-17 §4, block A3; CLAUDE.md convention 7): what a release's
 * new migrations keep to, judged against production rather than taste.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  BIG_TABLES,
  lintMigration,
  MIGRATIONS_DIR,
  statementsOf,
} from '../../../scripts/migrations-lint.mjs';
import { createTestApp, type TestApp } from './helpers';

const root = join(__dirname, '..', '..', '..');
const never = { inProduction: () => false };
const always = { inProduction: () => true };

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.close();
});

describe('the migrations lint (A3)', () => {
  it('splits statements outside a dollar-quoted body, comments out', () => {
    const { noTransaction, statements } = statementsOf(
      '-- a note; with a semicolon\nalter table x add column y int;\n' +
        'create procedure p() language plpgsql as $$ begin update messages set a = 1; commit; end $$;\n',
    );
    expect(noTransaction).toBe(false);
    expect(statements).toHaveLength(2);
    expect(statements[1]).toContain('update messages set a = 1; commit;');
    expect(
      statementsOf('-- no-transaction\ncreate index concurrently i on t (c);').noTransaction,
    ).toBe(true);
  });

  it('lets an expansion through', () => {
    expect(
      lintMigration('0100_x.sql', 'alter table messages add column note text;\n', never),
    ).toEqual([]);
    expect(
      lintMigration('0100_x.sql', 'create table things (id uuid primary key, name text);\n', never),
    ).toEqual([]);
  });

  it('a contraction needs the commit that stopped reading it, already in production', () => {
    const drop = 'alter table messages drop column note;\n';
    expect(lintMigration('0100_x.sql', drop, never)[0]).toContain('contracts after');
    const marked = `-- contracts after 0123abc\n${drop}`;
    expect(lintMigration('0100_x.sql', marked, never)[0]).toContain('does not run yet');
    expect(lintMigration('0100_x.sql', marked, always)).toEqual([]);
    expect(lintMigration('0100_x.sql', 'drop table old_things;\n', never)).toHaveLength(1);
    expect(
      lintMigration('0100_x.sql', 'alter table users rename column a to b;\n', never),
    ).toHaveLength(1);
    expect(
      lintMigration('0100_x.sql', 'alter table users alter column a type text;\n', never),
    ).toHaveLength(1);
  });

  it('a backfill of a big table runs in batches inside a procedure that commits each', () => {
    expect(lintMigration('0100_x.sql', 'update messages set note = null;\n', never)[0]).toContain(
      'in batches',
    );
    // A small table may be rewritten in one go.
    expect(lintMigration('0100_x.sql', 'update organizations set plan = plan;\n', never)).toEqual(
      [],
    );
    const bare =
      'create procedure caime_backfill() language plpgsql as $$ begin update messages set note = null; end $$;\n';
    expect(lintMigration('0100_x.sql', bare, never)[0]).toContain('loops over batches');
    const batched =
      'create procedure caime_backfill() language plpgsql as $$ declare n int; begin loop ' +
      'update messages set note = null where id in (select id from messages where note is not null limit 1000); ' +
      'get diagnostics n = row_count; exit when n = 0; commit; end loop; end $$;\n';
    expect(lintMigration('0100_x.sql', batched, never)).toEqual([]);
    expect(
      lintMigration('0101_x.sql', '-- no-transaction\ncall caime_backfill();\n', never),
    ).toEqual([]);
  });

  it('an index on a big table is built concurrently, one statement to a no-transaction file', () => {
    expect(
      lintMigration('0100_x.sql', 'create index messages_note on messages (note);\n', never)[0],
    ).toContain('concurrently');
    expect(
      lintMigration(
        '0100_x.sql',
        '-- no-transaction\ncreate index concurrently if not exists messages_note on messages (note);\n',
        never,
      ),
    ).toEqual([]);
    expect(
      lintMigration(
        '0100_x.sql',
        '-- no-transaction\nalter table messages add column note text;\ncreate index concurrently messages_note on messages (note);\n',
        never,
      )[0],
    ).toContain('one statement per file');
    // A small table's index may be built in the transaction.
    expect(
      lintMigration('0100_x.sql', 'create index org_plan on organizations (plan);\n', never),
    ).toEqual([]);
  });

  it('every big table is one the schema has', async () => {
    const rows = await sql<{ table_name: string }>`
      select table_name from information_schema.tables where table_schema = 'public'
    `.execute(t.ctx.db);
    const tables = new Set(rows.rows.map((r) => r.table_name));
    expect(BIG_TABLES.filter((name) => !tables.has(name))).toEqual([]);
  });

  it('the migrations this release adds keep the rules', () => {
    // Everything from A3's own (0091) on: the lint was not there for what came before.
    const dir = join(root, MIGRATIONS_DIR);
    const files = readdirSync(dir)
      .filter((f) => f.endsWith('.sql') && Number(f.slice(0, 4)) >= 91)
      .sort();
    expect(files.length).toBeGreaterThan(0);
    for (const file of files)
      expect(lintMigration(file, readFileSync(join(dir, file), 'utf8'), never)).toEqual([]);
  });
});
