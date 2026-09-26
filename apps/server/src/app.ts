/**
 * Builds the Fastify application. `index.ts` runs it; tests build it against a throwaway database.
 */

import { uuidv7 } from '@caishy/core';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import websocket from '@fastify/websocket';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Config } from './config';
import type { AppContext } from './context';
import { migrate } from './db/migrate';
import { createDb } from './db/pool';
import { Bus } from './lib/bus';
import { AppError } from './lib/errors';
import { RateLimiter } from './lib/rate-limit';
import { authRoutes } from './modules/auth';
import { connectionRoutes } from './modules/connections';
import { healthRoutes } from './modules/health';
import { meRoutes } from './modules/me';
import { peopleRoutes } from './modules/people';
import { policyRoutes } from './modules/policies';
import { relationshipRoutes } from './modules/relationships';
import { suggestionRoutes } from './modules/suggestions';
import { registerAuth } from './plugins/auth';

export interface BuiltApp {
  app: FastifyInstance;
  ctx: AppContext;
}

export interface BuildOptions {
  now?: () => Date;
  /** Skip migrations (the test template database is already migrated). */
  skipMigrations?: boolean;
}

export async function buildApp(config: Config, options: BuildOptions = {}): Promise<BuiltApp> {
  const app = Fastify({
    logger: config.isTest
      ? false
      : {
          level: config.LOG_LEVEL,
          redact: ['req.headers.authorization', 'req.headers.cookie', 'body.password'],
        },
    trustProxy: config.TRUST_PROXY,
    bodyLimit: 1_048_576,
    genReqId: () => uuidv7(),
    disableRequestLogging: config.isTest,
  });

  const database = createDb(config.DATABASE_URL, config.DATABASE_POOL_MAX);
  if (!options.skipMigrations) await migrate(database.pool, (m) => app.log.info(m));
  const bus = new Bus(database.pool);
  await bus.start();

  const ctx: AppContext = {
    config,
    db: database.db,
    pool: database.pool,
    bus,
    limiter: new RateLimiter(),
    log: app.log,
    now: options.now ?? (() => new Date()),
  };

  await app.register(cookie);
  await app.register(helmet, {
    // The API sends JSON; the web app's CSP is set where it is served (static.ts).
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-site' },
  });
  if (config.corsOrigins.length > 0) {
    await app.register(cors, { origin: config.corsOrigins, credentials: true });
  }
  await app.register(websocket, { options: { maxPayload: 64 * 1024 } });
  await app.register(multipart, { limits: { fileSize: 100 * 1024 * 1024, files: 10 } });

  app.setErrorHandler((error, req, reply) => {
    const err = error as Error & { statusCode?: number };
    if (err instanceof AppError) {
      if (err.code === 'rate_limited') {
        const retry = (err.details as { retryAfterSeconds?: number } | undefined)
          ?.retryAfterSeconds;
        if (retry) reply.header('retry-after', String(retry));
      }
      return reply
        .status(err.status)
        .send({ error: { code: err.code, message: err.message, details: err.details } });
    }
    const status = err.statusCode;
    if (status && status >= 400 && status < 500) {
      return reply
        .status(status)
        .send({ error: { code: 'invalid_request', message: err.message } });
    }
    req.log.error({ err }, 'unhandled error');
    if (config.isTest) console.error('unhandled error', err);
    return reply
      .status(500)
      .send({ error: { code: 'internal', message: 'Something went wrong on our side.' } });
  });
  app.setNotFoundHandler((req, reply) => {
    reply
      .status(404)
      .send({
        error: {
          code: 'not_found',
          message: `No route for ${req.method} ${req.url.split('?')[0]}`,
        },
      });
  });

  registerAuth(app, ctx);

  await app.register(
    async (v1) => {
      await healthRoutes(v1, ctx);
      await authRoutes(v1, ctx);
      await meRoutes(v1, ctx);
      await peopleRoutes(v1, ctx);
      await connectionRoutes(v1, ctx);
      await relationshipRoutes(v1, ctx);
      await policyRoutes(v1, ctx);
      await suggestionRoutes(v1, ctx);
    },
    { prefix: '/v1' },
  );

  app.addHook('onClose', async () => {
    await bus.stop();
    await database.close();
  });

  return { app, ctx };
}
