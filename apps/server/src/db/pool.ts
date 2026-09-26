import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import type { Database } from './schema';

export interface Db {
  pool: pg.Pool;
  db: Kysely<Database>;
  close(): Promise<void>;
}

export function createDb(connectionString: string, max = 20): Db {
  const pool = new pg.Pool({ connectionString, max, idleTimeoutMillis: 30_000 });
  pool.on('error', (err) => {
    // An idle client died (e.g. the database restarted). The pool replaces it on next use.
    console.error('postgres pool error', err.message);
  });
  const db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
  return {
    pool,
    db,
    async close() {
      await db.destroy();
    },
  };
}
