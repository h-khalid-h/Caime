import type { FastifyBaseLogger } from 'fastify';
import type { Kysely } from 'kysely';
import type pg from 'pg';
import type { Config } from './config';
import type { Database } from './db/schema';
import type { PersonGrant } from './lib/access';
import type { AiAssist } from './lib/ai';
import type { Bus } from './lib/bus';
import type { Metrics } from './lib/metrics';
import type { TxtResolver } from './lib/orgs';
import type { RateLimiter } from './lib/rate-limit';

export interface AppContext {
  config: Config;
  db: Kysely<Database>;
  pool: pg.Pool;
  bus: Bus;
  limiter: RateLimiter;
  /** Operational counts and timings for GET /metrics (PRD §81); never content. */
  metrics: Metrics;
  /** AI assist, when the operator configured a provider (R17). */
  ai: AiAssist | null;
  /** DNS TXT lookups for domain verification (tests stand in for them). */
  dns: TxtResolver;
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
  kind: 'web' | 'native' | 'api' | 'token';
  via: 'cookie' | 'bearer';
  /** Set when an app's token made the request: it acts as the app's bot (lib/apps.ts). */
  app?: { id: string; orgId: string; scopes: string[] };
  /** Set when a token acting as a person made it: theirs, or an app's they let in (lib/access.ts). */
  grant?: PersonGrant;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth: Auth | null;
  }
}
