/**
 * Builds the Fastify application. `index.ts` runs it; tests build it against a throwaway database.
 */

import { Resolver } from 'node:dns/promises';
import { uuidv7 } from '@caishy/core';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import websocket from '@fastify/websocket';
import Fastify, { type FastifyInstance, LogController } from 'fastify';
import type { Config } from './config';
import type { AppContext } from './context';
import { migrate } from './db/migrate';
import { createDb } from './db/pool';
import { createAiAssist } from './lib/ai';
import { registerWebhookJob } from './lib/apps';
import { Bus } from './lib/bus';
import { businessRealtime } from './lib/business';
import { AppError } from './lib/errors';
import { startWorkers } from './lib/jobs';
import { createMetrics } from './lib/metrics';
import { RateLimiter } from './lib/rate-limit';
import { accountRoutes } from './modules/account';
import { actionRoutes } from './modules/actions';
import { adminRoutes } from './modules/admin';
import { aiRoutes } from './modules/ai';
import { appRoutes } from './modules/apps';
import { authRoutes } from './modules/auth';
import { businessRoutes } from './modules/business';
import { connectionRoutes } from './modules/connections';
import { conversationRoutes } from './modules/conversations';
import { fileRoutes } from './modules/files';
import { handleRoutes } from './modules/handles';
import { healthRoutes } from './modules/health';
import { inboxRoutes } from './modules/inbox';
import { meRoutes } from './modules/me';
import { memoryRoutes } from './modules/memory';
import { metricsRoutes } from './modules/metrics';
import { notificationRoutes } from './modules/notifications';
import { oauthDiscovery, oauthRoutes } from './modules/oauth';
import { orgRoutes } from './modules/orgs';
import { peopleRoutes } from './modules/people';
import { policyRoutes } from './modules/policies';
import { realtimeRoutes } from './modules/realtime';
import { relationshipRoutes } from './modules/relationships';
import { safetyRoutes } from './modules/safety';
import { searchRoutes } from './modules/search';
import { spaceRoutes } from './modules/spaces';
import { suggestionRoutes } from './modules/suggestions';
import { tokenRoutes } from './modules/tokens';
import { registerWorkers } from './modules/workers';
import { registerAuth } from './plugins/auth';
import { registerWeb, type WebApp } from './plugins/static';

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
          serializers: {
            // Query strings carry search terms and handles: log the path only.
            req: (req: { method: string; url: string; ip?: string }) => ({
              method: req.method,
              url: req.url.split('?')[0],
              remoteAddress: req.ip,
            }),
          },
        },
    trustProxy: config.TRUST_PROXY,
    bodyLimit: 1_048_576,
    genReqId: () => uuidv7(),
    logController: new LogController({ disableRequestLogging: config.isTest }),
  });

  const database = createDb(config.DATABASE_URL, config.DATABASE_POOL_MAX);
  if (!options.skipMigrations) await migrate(database.pool, (m) => app.log.info(m));
  const bus = new Bus(database.pool);
  await bus.start();
  // A business conversation's customer hears the organization, never who on its team (R15).
  bus.transform = businessRealtime({ db: database.db });

  const pending = new Set<Promise<unknown>>();
  const dnsServers = config.DNS_SERVERS?.split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  // A mistyped server fails at start, not at the first organization's check.
  if (dnsServers?.length) new Resolver().setServers(dnsServers);
  const ctx: AppContext = {
    config,
    db: database.db,
    pool: database.pool,
    bus,
    limiter: new RateLimiter(),
    metrics: createMetrics(database.pool),
    ai: createAiAssist(config),
    dns: {
      resolveTxt: (hostname) => {
        const resolver = new Resolver({ timeout: 4000, tries: 2 });
        if (dnsServers) resolver.setServers(dnsServers);
        return resolver.resolveTxt(hostname);
      },
    },
    log: app.log,
    now: options.now ?? (() => new Date()),
    defer(label, work) {
      const p: Promise<unknown> = work()
        .catch((err) => {
          app.log.error({ err }, `deferred ${label} failed`);
          if (config.isTest) console.error(`deferred ${label} failed`, err);
        })
        .finally(() => pending.delete(p));
      pending.add(p);
    },
    async flush() {
      while (pending.size) await Promise.all([...pending]);
    },
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
  let web: WebApp | null = null;
  app.setNotFoundHandler((req, reply) => {
    if (web?.handles(req)) return web.serve(reply);
    reply.status(404).send({
      error: {
        code: 'not_found',
        message: `No route for ${req.method} ${req.url.split('?')[0]}`,
      },
    });
  });

  registerAuth(app, ctx);
  // Every answer, by the route as declared (never the path as requested) and its status.
  app.addHook('onResponse', async (req, reply) => {
    const route = req.routeOptions.url ?? (reply.statusCode === 404 ? 'unmatched' : 'web');
    ctx.metrics.http.inc({ method: req.method, route, status: String(reply.statusCode) });
    ctx.metrics.httpSeconds.observe({ method: req.method, route }, reply.elapsedTime / 1000);
  });
  await metricsRoutes(app, ctx);
  await oauthDiscovery(app, ctx);

  await app.register(
    async (v1) => {
      await healthRoutes(v1, ctx);
      await authRoutes(v1, ctx);
      await accountRoutes(v1, ctx);
      await meRoutes(v1, ctx);
      await peopleRoutes(v1, ctx);
      await connectionRoutes(v1, ctx);
      await relationshipRoutes(v1, ctx);
      await policyRoutes(v1, ctx);
      await suggestionRoutes(v1, ctx);
      await conversationRoutes(v1, ctx);
      await inboxRoutes(v1, ctx);
      await realtimeRoutes(v1, ctx);
      await actionRoutes(v1, ctx);
      await memoryRoutes(v1, ctx);
      await aiRoutes(v1, ctx);
      await searchRoutes(v1, ctx);
      await spaceRoutes(v1, ctx);
      await orgRoutes(v1, ctx);
      await handleRoutes(v1, ctx);
      await businessRoutes(v1, ctx);
      await appRoutes(v1, ctx);
      await tokenRoutes(v1, ctx);
      await oauthRoutes(v1, ctx);
      await adminRoutes(v1, ctx);
      await notificationRoutes(v1, ctx);
      await safetyRoutes(v1, ctx);
      await fileRoutes(v1, ctx);
    },
    { prefix: '/v1' },
  );
  web = await registerWeb(app, ctx);

  registerWorkers();
  registerWebhookJob();
  const stopWorkers = config.WORKERS ? startWorkers(ctx) : () => {};

  app.addHook('onClose', async () => {
    stopWorkers();
    ctx.metrics.stop();
    await ctx.flush();
    await bus.stop();
    await database.close();
  });

  return { app, ctx };
}
