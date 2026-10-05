import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import type { Database } from './schema';

// A date column (a date of birth) is the day it says, 'YYYY-MM-DD', not midnight somewhere.
pg.types.setTypeParser(pg.types.builtins.DATE, (value) => value);

export interface Db {
  pool: pg.Pool;
  db: Kysely<Database>;
  close(): Promise<void>;
}

/** `onQuery` is told of each query sent (tests count what a path costs); nothing of its text. */
export function createDb(connectionString: string, max = 20, onQuery?: () => void): Db {
  const pool = new pg.Pool({ connectionString, max, idleTimeoutMillis: 30_000 });
  pool.on('error', (err) => {
    // An idle client died (e.g. the database restarted). The pool replaces it on next use.
    console.error('postgres pool error', err.message);
  });
  const db = new Kysely<Database>({
    dialect: new PostgresDialect({ pool }),
    log: onQuery
      ? (event) => {
          if (event.level === 'query') onQuery();
        }
      : undefined,
  });
  return {
    pool,
    db,
    async close() {
      await db.destroy();
    },
  };
}
