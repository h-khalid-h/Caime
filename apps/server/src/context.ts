import type { FastifyBaseLogger } from 'fastify';
import type { Kysely } from 'kysely';
import type pg from 'pg';
import type { Config } from './config';
import type { Database } from './db/schema';
import type { Bus } from './lib/bus';
import type { RateLimiter } from './lib/rate-limit';

export interface AppContext {
  config: Config;
  db: Kysely<Database>;
  pool: pg.Pool;
  bus: Bus;
  limiter: RateLimiter;
  log: FastifyBaseLogger;
  /** Injectable clock so tests can move time. */
  now(): Date;
  /** Run work after the response (notifications, suggestions). Errors are logged, never thrown. */
  defer(label: string, work: () => Promise<unknown>): void;
  /** Wait for deferred work to finish (tests, shutdown). */
  flush(): Promise<void>;
}

export interface Auth {
  userId: string;
  sessionId: string;
  kind: 'web' | 'native' | 'api';
  via: 'cookie' | 'bearer';
}

declare module 'fastify' {
  interface FastifyRequest {
    auth: Auth | null;
  }
}
