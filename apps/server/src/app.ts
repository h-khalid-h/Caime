/**
 * Builds the Fastify application. `index.ts` runs it; tests build it against a throwaway database.
 */

import { Resolver } from 'node:dns/promises';
import { uuidv7 } from '@caime/core';
import type { ErrorBody, ErrorCode } from '@caime/core/errors';
import { tr } from '@caime/core/i18n';
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
import { ageProviderFor } from './lib/age-provider';
import { registerAgentJob } from './lib/agent';
import { registerAgentEval } from './lib/agent-eval';
import { createAiAssist } from './lib/ai';
import { registerWebhookJob } from './lib/apps';
import { registerAuditCheck } from './lib/audit';
import { registerBackupJob } from './lib/backup';
import { registerBillingJobs } from './lib/billing';
import { registerBookingReminders } from './lib/booking-mail';
import { registerBriefJob } from './lib/briefs';
import { Bus } from './lib/bus';
import { businessRealtime } from './lib/business';
import { registerCaiJobs } from './lib/cai';
import { registerCaiAnswers } from './lib/cai-answers';
import { registerCaiInteract } from './lib/cai-interact';
import { registerSpokenSweep } from './lib/cai-voice';
import { registerCalendarPush } from './lib/calendar-push';
import { registerNotesJob } from './lib/call-notes';
import { afterTypedRemoved, registerNotesSummaryJob } from './lib/call-notes-summary';
import { registerRecordingJobs } from './lib/call-recording';
import { registerCallSweep } from './lib/calls';
import { canonicalLocation } from './lib/canonical-host';
import { registerCardZones } from './lib/card-zones';
import { deferredQueue } from './lib/deferred';
import { createMailer, type Mailer } from './lib/email';
import { AppError } from './lib/errors';
import { registerAccountSync } from './lib/external-busy';
import { registerGroupCallSweep } from './lib/group-calls';
import { registerLanguage } from './lib/i18n';
import { startWorkers } from './lib/jobs';
import { registerLinkPreviewJob } from './lib/link-previews';
import { requestForLog } from './lib/log';
import { registerMailBackfill, startMailBackfill } from './lib/mail-backfill';
import { registerMailJobs } from './lib/mail-out';
import { mailProviderFor } from './lib/mail-provider';
import { registerGuestsAgain } from './lib/meeting-guests';
import { registerSeriesJob } from './lib/meeting-series';
import { registerMeetingStartJob } from './lib/meeting-start';
import { afterTranscript, noteUnheard, registerEffectsSweep } from './lib/message-effects';
import { createMetrics } from './lib/metrics';
import { whenRemovedForEveryone } from './lib/moderation';
import { registerAutoReplies } from './lib/org-replies';
import { registerOrgSlipping } from './lib/org-slipping';
import { registerProviderHealth } from './lib/provider-health';
import { RateLimiter } from './lib/rate-limit';
import { registerPreviewJob, startPreviewBackfill } from './lib/renditions';
import { registerReplyDraftSweep } from './lib/reply-drafts';
import { registerScheduledJob } from './lib/scheduled-messages';
import { speechFor } from './lib/speech';
import { registerSpeechForgetJob } from './lib/speech-forget';
import { registerSystemJobs } from './lib/system-accounts';
import { registerTranscribeJob } from './lib/transcribe';
import { ttsFor } from './lib/tts';
import { registerUpdateJobs } from './lib/updates';
import { registerVaultReseal, startVaultReseal } from './lib/vault-reseal';
import { accountRoutes } from './modules/account';
import { connectedAccountRoutes } from './modules/accounts';
import { actionRoutes } from './modules/actions';
import { addressRoutes } from './modules/addresses';
import { adminRoutes } from './modules/admin';
import { ageRoutes } from './modules/age';
import { agentRoutes } from './modules/agents';
import { aiRoutes } from './modules/ai';
import { appLinkRoutes } from './modules/app-links';
import { appRoutes } from './modules/apps';
import { authRoutes } from './modules/auth';
import { automationRoutes } from './modules/automations';
import { billingRoutes } from './modules/billing';
import { businessRoutes } from './modules/business';
import { caiRoutes } from './modules/cai';
import { calendarRoutes } from './modules/calendar';
import { callNotesRoutes } from './modules/call-notes';
import { callRoutes } from './modules/calls';
import { checkoutRoutes } from './modules/checkout';
import { connectionRoutes } from './modules/connections';
import { contactRoutes } from './modules/contacts';
import { conversationRoutes } from './modules/conversations';
import { directoryRoutes } from './modules/directory';
import { domainJoinRoutes } from './modules/domain-join';
import { e2eeRoutes } from './modules/e2ee';
import { familyRoutes } from './modules/family';
import { feedRoutes } from './modules/feed';
import { fileLinkRoutes } from './modules/file-links';
import { fileRoutes } from './modules/files';
import { groupCallRoutes } from './modules/group-calls';
import { handleRoutes } from './modules/handles';
import { healthRoutes } from './modules/health';
import { importRoutes } from './modules/imports';
import { inboxRoutes } from './modules/inbox';
import { inviteRoutes } from './modules/invites';
import { joinLinkRoutes } from './modules/join-links';
import { kitRoutes } from './modules/kits';
import { linkRoutes } from './modules/links';
import { mailRoutes } from './modules/mail';
import { meRoutes } from './modules/me';
import { meetingRoutes } from './modules/meetings';
import { memoryRoutes } from './modules/memory';
import { messageRoutes } from './modules/messages';
import { metricsRoutes } from './modules/metrics';
import { moderationPageRoutes } from './modules/moderation-page';
import { notificationRoutes } from './modules/notifications';
import { oauthDiscovery, oauthRoutes } from './modules/oauth';
import { openApiRoutes } from './modules/openapi';
import { orgCustomerRoutes } from './modules/org-customers';
import { orgFormRoutes } from './modules/org-forms';
import { orgRoutes } from './modules/orgs';
import { pageRoutes, sitePageAt } from './modules/pages';
import { passkeyRoutes } from './modules/passkeys';
import { peopleRoutes } from './modules/people';
import { placeInviteRoutes } from './modules/place-invites';
import { placeRoutes } from './modules/places';
import { policyRoutes } from './modules/policies';
import { publicBookingRoutes } from './modules/public-booking';
import { publicReportRoutes } from './modules/public-report';
import { publicTimeRoutes } from './modules/public-time';
import { publicWriteRoutes } from './modules/public-write';
import { quickReplyRoutes } from './modules/quick-replies';
import { realtimeRoutes } from './modules/realtime';
import { relationshipRoutes } from './modules/relationships';
import { safetyRoutes } from './modules/safety';
import { scheduledMessageRoutes } from './modules/scheduled-messages';
import { searchRoutes } from './modules/search';
import { spaceRoutes } from './modules/spaces';
import { suggestionRoutes } from './modules/suggestions';
import { suspensionRoutes } from './modules/suspension';
import { teamInviteRoutes } from './modules/team-invites';
import { tokenRoutes } from './modules/tokens';
import { updateRoutes } from './modules/updates';
import { webManifestRoutes } from './modules/web-manifest';
import { wellKnownRoutes } from './modules/well-known';
import { registerWorkers } from './modules/workers';
import { registerAuth } from './plugins/auth';
import { registerWeb, type WebApp } from './plugins/static';

export interface BuiltApp {
  app: FastifyInstance;
  ctx: AppContext;
}

export interface BuildOptions {
  now?: () => Date;
  /** A mailer in place of SMTP (tests read its outbox). */
  mail?: Mailer;
  /** Skip migrations (the test template database is already migrated). */
  skipMigrations?: boolean;
  /** Told of every query sent (tests measure what a path costs). */
  onQuery?: () => void;
}

/** The OAuth endpoints a browser app elsewhere calls (see the CORS registration below). */
const OPEN_TO_ANY_SITE = new Set([
  '/v1/oauth/token',
  '/v1/oauth/revoke',
  '/.well-known/oauth-authorization-server',
]);

/** A refusal's body, every one the same shape and a code from the one list. */
const errorBody = (code: ErrorCode, message: string, details?: unknown): ErrorBody => ({
  error: { code, message, ...(details === undefined ? {} : { details }) },
});

export async function buildApp(config: Config, options: BuildOptions = {}): Promise<BuiltApp> {
  const app = Fastify({
    logger: config.isTest
      ? false
      : {
          level: config.LOG_LEVEL,
          redact: ['req.headers.authorization', 'req.headers.cookie', 'body.password'],
          // The path only, and never a secret in it (lib/log.ts).
          serializers: { req: requestForLog },
        },
    trustProxy: config.TRUST_PROXY,
    bodyLimit: 1_048_576,
    genReqId: () => uuidv7(),
    logController: new LogController({ disableRequestLogging: config.isTest }),
  });

  const database = createDb(config.DATABASE_URL, config.DATABASE_POOL_MAX, options.onQuery);
  if (!options.skipMigrations) await migrate(database.pool, (m) => app.log.info(m));
  const bus = new Bus(database.pool);
  await bus.start();
  // A business conversation's customer hears the organization, never who on its team (R15).
  bus.transform = businessRealtime({ db: database.db });

  const metrics = createMetrics(database.pool);
  // Work after a response, a few at a time on this instance (M16 D2a).
  const deferred = deferredQueue({ log: app.log, metrics, isTest: config.isTest });
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
    metrics,
    ai: createAiAssist(config),
    speech: speechFor(config),
    tts: ttsFor(config),
    age: ageProviderFor(config),
    mail: options.mail ?? createMailer(config, app.log),
    mailProvider: mailProviderFor(config),
    dns: {
      resolveTxt: (hostname) => {
        const resolver = new Resolver({ timeout: 4000, tries: 2 });
        if (dnsServers) resolver.setServers(dnsServers);
        return resolver.resolveTxt(hostname);
      },
      resolve: (hostname, rrtype) => {
        const resolver = new Resolver({ timeout: 4000, tries: 2 });
        if (dnsServers) resolver.setServers(dnsServers);
        return resolver.resolve(hostname, rrtype) as Promise<string[] | string[][]>;
      },
    },
    log: app.log,
    now: options.now ?? (() => new Date()),
    defer: deferred.defer,
    flush: deferred.flush,
  };

  await app.register(cookie);
  await app.register(helmet, {
    // The API sends JSON; the web app's CSP is set where it is served (static.ts).
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-site' },
    // The policy says frame-ancestors 'none'; the older header says the same.
    frameguard: { action: 'deny' },
  });
  // Apps on any site may trade codes and read where everything is: nothing there rides on a
  // cookie. The rest of the API is for CORS_ORIGINS alone, credentials and all.
  await app.register(cors, {
    delegator: (req, done) => {
      if (OPEN_TO_ANY_SITE.has(req.url.split('?')[0] ?? ''))
        return done(null, {
          origin: '*',
          methods: ['GET', 'POST'],
          allowedHeaders: ['authorization', 'content-type'],
          maxAge: 86_400,
        });
      done(
        null,
        config.corsOrigins.length
          ? { origin: config.corsOrigins, credentials: true }
          : { origin: false },
      );
    },
  });
  await app.register(websocket, { options: { maxPayload: 64 * 1024 } });
  await app.register(multipart, { limits: { fileSize: 100 * 1024 * 1024, files: 10 } });

  // The request's id on every answer, and in a 500's details: what support asks for first.
  app.addHook('onSend', async (req, reply) => {
    reply.header('x-request-id', req.id);
  });
  app.setErrorHandler((error, req, reply) => {
    const err = error as Error & { statusCode?: number };
    if (err instanceof AppError) {
      if (err.code === 'rate_limited') {
        const retry = (err.details as { retryAfterSeconds?: number } | undefined)
          ?.retryAfterSeconds;
        if (retry) reply.header('retry-after', String(retry));
      }
      return reply.status(err.status).send(errorBody(err.code, err.message, err.details));
    }
    const status = err.statusCode;
    if (status && status >= 400 && status < 500) {
      return reply.status(status).send(errorBody('invalid_request', err.message));
    }
    req.log.error({ err }, 'unhandled error');
    if (config.isTest) console.error('unhandled error', err);
    return reply
      .status(500)
      .send(errorBody('internal', tr('Something went wrong on our side.'), { requestId: req.id }));
  });
  let web: WebApp | null = null;
  app.setNotFoundHandler((req, reply) => {
    // Caime's own pages however they're spelled (/Privacy, /terms/): the page, never the app.
    const page = req.method === 'GET' || req.method === 'HEAD' ? sitePageAt(req.url) : null;
    if (page) return reply.redirect(`/${page}`, 301);
    if (web?.handles(req)) return web.serve(req, reply);
    reply.status(404).send({
      error: {
        code: 'not_found',
        message: `No route for ${req.method} ${req.url.split('?')[0]}`,
      },
    });
  });

  // Before anything else: a page asked for on another name goes to Caime's one address.
  app.addHook('onRequest', async (req, reply) => {
    const location = canonicalLocation(config.PUBLIC_URL, {
      method: req.method,
      host: req.host,
      url: req.url,
    });
    if (location) return reply.redirect(location, 301);
  });
  // Before anything answers: the request's language, for every word written in it (R54).
  registerLanguage(app);
  registerAuth(app, ctx);
  // Every answer, by the route as declared (never the path as requested) and its status.
  app.addHook('onResponse', async (req, reply) => {
    const route = req.routeOptions.url ?? (reply.statusCode === 404 ? 'unmatched' : 'web');
    ctx.metrics.http.inc({ method: req.method, route, status: String(reply.statusCode) });
    ctx.metrics.httpSeconds.observe({ method: req.method, route }, reply.elapsedTime / 1000);
  });
  // A monitor pointed at the bare path would read "up" from the app's page: it is told where
  // the check is instead.
  for (const path of ['/healthz', '/readyz'])
    app.get(path, async (_req, reply) =>
      reply.status(404).send({
        error: { code: 'not_found', message: `The health check is at /v1${path}.` },
      }),
    );
  await metricsRoutes(app, ctx);
  await oauthDiscovery(app, ctx);
  await appLinkRoutes(app, ctx);
  await webManifestRoutes(app, ctx);
  await wellKnownRoutes(app, ctx);
  await pageRoutes(app, ctx);
  await moderationPageRoutes(app, ctx);

  await app.register(
    async (v1) => {
      await healthRoutes(v1, ctx);
      await authRoutes(v1, ctx);
      await passkeyRoutes(v1, ctx);
      await accountRoutes(v1, ctx);
      await meRoutes(v1, ctx);
      await peopleRoutes(v1, ctx);
      await connectionRoutes(v1, ctx);
      await contactRoutes(v1, ctx);
      await connectedAccountRoutes(v1, ctx);
      await addressRoutes(v1, ctx);
      await placeRoutes(v1, ctx);
      await inviteRoutes(v1, ctx);
      await relationshipRoutes(v1, ctx);
      await policyRoutes(v1, ctx);
      await automationRoutes(v1, ctx);
      await suggestionRoutes(v1, ctx);
      await conversationRoutes(v1, ctx);
      await messageRoutes(v1, ctx);
      await linkRoutes(v1, ctx);
      await importRoutes(v1, ctx);
      await publicBookingRoutes(v1, ctx);
      await publicWriteRoutes(v1, ctx);
      await publicReportRoutes(v1, ctx);
      await publicTimeRoutes(v1, ctx);
      await scheduledMessageRoutes(v1, ctx);
      await callRoutes(v1, ctx);
      await groupCallRoutes(v1, ctx);
      await callNotesRoutes(v1, ctx);
      await e2eeRoutes(v1, ctx);
      await billingRoutes(v1, ctx);
      await checkoutRoutes(v1, ctx);
      await inboxRoutes(v1, ctx);
      await feedRoutes(v1, ctx);
      await realtimeRoutes(v1, ctx);
      await actionRoutes(v1, ctx);
      await caiRoutes(v1, ctx);
      await calendarRoutes(v1, ctx);
      await meetingRoutes(v1, ctx);
      await memoryRoutes(v1, ctx);
      await aiRoutes(v1, ctx);
      await searchRoutes(v1, ctx);
      await spaceRoutes(v1, ctx);
      await orgRoutes(v1, ctx);
      await orgCustomerRoutes(v1, ctx);
      await orgFormRoutes(v1, ctx);
      await quickReplyRoutes(v1, ctx);
      await teamInviteRoutes(v1, ctx);
      await domainJoinRoutes(v1, ctx);
      await joinLinkRoutes(v1, ctx);
      await familyRoutes(v1, ctx);
      await fileLinkRoutes(v1, ctx);
      await placeInviteRoutes(v1, ctx);
      await suspensionRoutes(v1, ctx);
      await ageRoutes(v1, ctx);
      await handleRoutes(v1, ctx);
      await businessRoutes(v1, ctx);
      await updateRoutes(v1, ctx);
      await appRoutes(v1, ctx);
      await kitRoutes(v1, ctx);
      await agentRoutes(v1, ctx);
      await tokenRoutes(v1, ctx);
      await oauthRoutes(v1, ctx);
      await directoryRoutes(v1, ctx);
      await adminRoutes(v1, ctx);
      await notificationRoutes(v1, ctx);
      await safetyRoutes(v1, ctx);
      await fileRoutes(v1, ctx);
      await mailRoutes(v1, ctx);
      await openApiRoutes(v1, ctx);
    },
    { prefix: '/v1' },
  );
  web = await registerWeb(app, ctx);

  registerWorkers();
  registerWebhookJob();
  registerBillingJobs();
  registerBackupJob();
  registerAuditCheck();
  registerProviderHealth();
  registerUpdateJobs();
  registerAgentJob();
  registerScheduledJob();
  registerAgentEval();
  registerAutoReplies();
  registerSystemJobs();
  registerCaiJobs();
  registerBriefJob();
  registerBookingReminders();
  registerMeetingStartJob();
  registerSeriesJob();
  registerAccountSync();
  registerCalendarPush();
  registerGuestsAgain();
  registerTranscribeJob(afterTranscript, noteUnheard);
  registerSpokenSweep();
  registerNotesJob();
  registerRecordingJobs();
  registerCardZones();
  registerOrgSlipping();
  registerSpeechForgetJob();
  registerCaiInteract();
  registerNotesSummaryJob();
  registerCaiAnswers();
  // A message typed in a call taken down for everyone writes the call's notes again (R121).
  whenRemovedForEveryone(afterTypedRemoved);
  registerLinkPreviewJob();
  registerMailJobs();
  registerEffectsSweep();
  registerCallSweep();
  registerGroupCallSweep();
  registerPreviewJob();
  registerMailBackfill();
  registerVaultReseal();
  registerReplyDraftSweep();
  const stopWorkers = config.WORKERS ? startWorkers(ctx) : () => {};
  // Older images get the preview new ones are given (R70): queued once, whichever instance.
  if (config.WORKERS)
    void startPreviewBackfill(ctx).catch((err) =>
      ctx.log.warn({ err }, 'preview backfill not queued'),
    );
  // Mail from before signatures were set apart (R75): folded once, whichever instance.
  if (config.WORKERS)
    void startMailBackfill(ctx).catch((err) => ctx.log.warn({ err }, 'mail backfill not queued'));
  // A VAULT_KEY new to what's sealed (M16 B5): everything moves to it that day, whichever instance.
  if (config.WORKERS)
    void startVaultReseal(ctx).catch((err) => ctx.log.warn({ err }, 'vault pass not queued'));

  app.addHook('onClose', async () => {
    stopWorkers();
    ctx.metrics.stop();
    await ctx.flush();
    await bus.stop();
    await database.close();
  });

  return { app, ctx };
}
