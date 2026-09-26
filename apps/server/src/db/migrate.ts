/**
 * Applies ./migrations/*.sql in order, once each, under a Postgres advisory lock so several
 * instances booting together don't race. A migration that changed after it was applied stops
 * the boot: migrations are append-only (CLAUDE.md convention 6).
 */
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';

const LOCK_ID = 7_431_118_202;

export function migrationsDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // Source layout: src/db/migrate.ts next to src/db/migrations. Bundle: dist/server.js next to dist/migrations.
  return join(here, 'migrations');
}

export async function migrate(
  pool: pg.Pool,
  log: (msg: string) => void = () => {},
  dir: string = migrationsDir(),
): Promise<string[]> {
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await client.query('select pg_advisory_lock($1)', [LOCK_ID]);
    await client.query(
      `create table if not exists schema_migrations (
         name text primary key,
         checksum text not null,
         applied_at timestamptz not null default now()
       )`,
    );
    const done = new Map<string, string>(
      (
        await client.query<{ name: string; checksum: string }>(
          'select name, checksum from schema_migrations',
        )
      ).rows.map((r) => [r.name, r.checksum]),
    );
    const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      const sql = await readFile(join(dir, file), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const previous = done.get(file);
      if (previous) {
        if (previous !== checksum) {
          throw new Error(
            `Migration ${file} changed after it was applied. Add a new migration instead.`,
          );
        }
        continue;
      }
      await client.query('begin');
      try {
        await client.query(sql);
        await client.query('insert into schema_migrations (name, checksum) values ($1, $2)', [
          file,
          checksum,
        ]);
        await client.query('commit');
      } catch (err) {
        await client.query('rollback');
        throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
      }
      applied.push(file);
      log(`applied migration ${file}`);
    }
  } finally {
    await client.query('select pg_advisory_unlock($1)', [LOCK_ID]).catch(() => {});
    client.release();
  }
  return applied;
}
