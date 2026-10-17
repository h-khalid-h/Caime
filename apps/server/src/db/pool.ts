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

/** A query that runs longer than this is cancelled: nothing a request does should. */
export const STATEMENT_TIMEOUT_MS = 30_000;
/** A transaction left open and idle (a client that went away mid-way) is ended. */
export const IDLE_IN_TRANSACTION_MS = 60_000;
/** Waiting for a free connection ends with an error, never for good (review 2026-10-17 §4 H4). */
export const CONNECT_TIMEOUT_MS = 10_000;

/** `onQuery` is told of each query sent (tests count what a path costs); nothing of its text. */
export function createDb(connectionString: string, max = 20, onQuery?: () => void): Db {
  const pool = new pg.Pool({
    connectionString,
    max,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    // Session defaults every connection starts with; a migration lifts them for itself.
    options: `-c statement_timeout=${STATEMENT_TIMEOUT_MS} -c idle_in_transaction_session_timeout=${IDLE_IN_TRANSACTION_MS}`,
  });
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
