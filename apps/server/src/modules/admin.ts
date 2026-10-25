/**
 * The operator's routes, behind `ADMIN_TOKEN`: the product's metrics, setting plans until a
 * billing integration does it (R25), and giving out the handles nobody takes on their own,
 * reserved or held (R35). Without the token configured, none of this exists: every route answers
 * the same 404 as a route that was never there.
 */
import {
  AppealDecisionBody,
  AppListingReviewBody,
  BirthDateBody,
  Handle,
  type HandleView,
  isReservedHandle,
  ORG_PLANS,
  PERSON_PLANS,
  ReportStatusBody,
  ReportsQuery,
  type ReportView,
  SuspensionBody,
} from '@caime/core';
import type {
  AdminConnectionsResponse,
  AdminJobsResponse,
  AdminPersonResponse,
  AgentEvalResponse,
  AppealResponse,
  AppealsResponse,
  AppListingReviewResponse,
  AppListingsResponse,
  AuditChainResponse,
  BackupResponse,
  BackupsResponse,
  OkResponse,
  OrgPlanResponse,
  PlanUsageResponse,
  ProductMetricsResponse,
  ProvidersResponse,
  ReportResponse,
  ReportsResponse,
} from '@caime/core/api';
import { tr } from '@caime/core/i18n';
import { LISTING_CHECKS } from '@caime/core/marketplace';
import { REPORT_REASON_CHOICES } from '@caime/core/report-reasons';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context';
import { agentEvalKept } from '../lib/agent-eval';
import {
  giveSlug,
  listingById,
  listingReviewView,
  listingState,
  waitingListings,
} from '../lib/app-directory';
import { AUDIT_VERIFY_ROWS, audit, verifyAuditChain } from '../lib/audit';
import { backupDir, lastBackup, listBackups, runBackup } from '../lib/backup';
import { endBillingOf, paysThroughBilling } from '../lib/billing';
import { connectionsForOperator } from '../lib/connected-accounts';
import { AppError, badRequest, conflict, mailUnavailable, notFound } from '../lib/errors';
import { handleHeld, moveHandle, releaseHandle } from '../lib/handles';
import { enqueue, retryJob, troubledJobs } from '../lib/jobs';
import {
  appealViews,
  decideAppeal,
  endAllAccess,
  removeForEveryone,
  reportViews,
  setOrgSuspended,
  setSuspended,
  settleReport,
  takeBackUpdate,
} from '../lib/moderation';
import { notify } from '../lib/notify';
import { listingWatchers } from '../lib/oauth';
import { requireOperator } from '../lib/operator';
import { orgPlanView, planUsage } from '../lib/plans';
import { productMetrics } from '../lib/product-metrics';
import { checkProviders, providersView } from '../lib/provider-health';
import { sendResetLink } from '../lib/reset';
import { forgetSitemaps } from '../lib/sitemap-cache';
import { oldEnoughIn, tooYoung } from '../lib/users';
import { parse } from '../lib/validate';

const PAYING = (plan: string) =>
  tr(
    '{plan} is paid for through Stripe: cancel it there (at once, or at the end of what’s paid), and the plan follows.',
    { plan },
  );

export async function adminRoutes(app: FastifyInstance, ctx: AppContext) {
  const operator = (req: FastifyRequest) =>
    requireOperator(ctx, req, ctx.config.ADMIN_TOKEN, ctx.config.OPERATOR_TOKENS);

  const handleParam = z.object({ handle: z.string().trim().min(1).max(64) });
  const personByHandle = async (handle: string) => {
    const person = await ctx.db
      .selectFrom('users')
      .select(['id', 'email', 'display_name'])
      .where('handle', '=', handle.toLowerCase().replace(/^@/, ''))
      .where('kind', '=', 'human')
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    if (!person) throw notFound(tr('That person'));
    return person;
  };

  /** The database's backups (docs/DEPLOY.md): the last that succeeded, and the ones on disk. */
  // --- Reports (R49): what people reported, reviewed and acted on by the operator --------------

  app.get('/admin/reports', async (req): Promise<ReportsResponse> => {
    const by = operator(req);
    const { status, limit } = parse(ReportsQuery, req.query);
    const reports = await reportViews(ctx, { status, limit });
    // Reading what people reported is an act too: who looked, at which, is kept.
    await audit(ctx.db, {
      actorId: null,
      action: 'admin.reports_viewed',
      metadata: { status, count: reports.length, operator: by },
    });
    return { reports };
  });

  /** Suspended accounts' appeals (M16 B6): waiting first, oldest first. Looking is kept too. */
  app.get('/admin/appeals', async (req): Promise<AppealsResponse> => {
    const by = operator(req);
    const { waiting, limit } = parse(
      z.object({
        waiting: z.enum(['0', '1']).default('1'),
        limit: z.coerce.number().int().min(1).max(200).default(100),
      }),
      req.query,
    );
    const appeals = await appealViews(ctx, { waiting: waiting === '1', limit });
    await audit(ctx.db, {
      actorId: null,
      action: 'admin.appeals_viewed',
      metadata: { count: appeals.length, operator: by },
    });
    return { appeals };
  });

  /** An appeal decided: the suspension lifted, or upheld with a note; the person is mailed. */
  app.post('/admin/appeals/:id', async (req): Promise<AppealResponse> => {
    const by = operator(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const body = parse(AppealDecisionBody, req.body);
    const decided = await decideAppeal(ctx, id, body.decision, body.note ?? null, by);
    const [appeal] = await appealViews(ctx, { waiting: false, limit: 1, id });
    if (!appeal) throw notFound(tr('That appeal'));
    if (!decided) throw conflict('appeal_decided', tr('That appeal was decided already.'));
    return { appeal };
  });

  const reportParam = z.object({ id: z.string().uuid() });
  const oneReport = async (id: string): Promise<ReportView> => {
    const [report] = await reportViews(ctx, { status: 'all', limit: 1, id });
    if (!report) throw notFound(tr('That report'));
    return report;
  };

  /** Moving a report along: reviewing, actioned, dismissed (or back to open). */
  app.patch('/admin/reports/:id', async (req): Promise<ReportResponse> => {
    const by = operator(req);
    const { id } = parse(reportParam, req.params);
    const { status } = parse(ReportStatusBody, req.body);
    await oneReport(id);
    await settleReport(ctx, id, status);
    await audit(ctx.db, {
      actorId: null,
      action: 'moderation.report_status',
      target: id,
      metadata: { status, operator: by },
    });
    return { report: await oneReport(id) };
  });

  /** The reported message, gone for everyone, exactly as its sender's own delete would do. */
  app.post('/admin/reports/:id/remove-message', async (req): Promise<ReportResponse> => {
    const by = operator(req);
    const { id } = parse(reportParam, req.params);
    const report = await oneReport(id);
    if (!report.message) throw badRequest(tr('This report isn’t about a message.'));
    const m = await ctx.db
      .selectFrom('messages')
      .select(['id', 'conversation_id', 'pinned_at', 'deleted_at', 'kind'])
      .where('id', '=', report.message.id)
      .executeTakeFirst();
    if (!m) throw notFound(tr('That message'));
    if (m.kind === 'system') throw badRequest(tr('Lines about the conversation stay.'));
    if (!m.deleted_at) await removeForEveryone(ctx, m, null);
    await settleReport(ctx, id, 'actioned');
    await audit(ctx.db, {
      actorId: null,
      action: 'moderation.message_removed',
      target: id,
      metadata: { messageId: m.id, operator: by },
    });
    return { report: await oneReport(id) };
  });

  /** The reported update, taken back, exactly as its organization would do. */
  app.post('/admin/reports/:id/remove-update', async (req): Promise<ReportResponse> => {
    const by = operator(req);
    const { id } = parse(reportParam, req.params);
    const report = await oneReport(id);
    if (!report.update || !report.org) throw badRequest(tr('This report isn’t about an update.'));
    await takeBackUpdate(ctx, report.org.id, report.update.id, null, by);
    await settleReport(ctx, id, 'actioned');
    return { report: await oneReport(id) };
  });

  /** An account suspended, or the suspension lifted (R49): every way in closes; nothing goes. */
  app.put('/admin/people/:handle/suspension', async (req): Promise<OkResponse> => {
    const by = operator(req);
    const { handle } = parse(handleParam, req.params);
    const body = parse(SuspensionBody, req.body);
    const person = await ctx.db
      .selectFrom('users')
      .select(['id', 'kind'])
      .where('handle', '=', handle.toLowerCase().replace(/^@/, ''))
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    if (person?.kind !== 'human') throw notFound(tr('That person'));
    await setSuspended(ctx, person.id, body.suspended, body.reason ?? null, by);
    return { ok: true };
  });

  /**
   * Someone locked out, or asking what Caime holds (a data-subject request): the account's
   * facts, never its content. Who's signed in where, which devices read private conversations,
   * what tokens and apps act for them, and the ways back in. Looking is written down too.
   */
  app.get('/admin/people/:handle', async (req): Promise<AdminPersonResponse> => {
    const by = operator(req);
    const { handle } = parse(handleParam, req.params);
    const person = await ctx.db
      .selectFrom('users')
      .select([
        'id',
        'handle',
        'display_name',
        'kind',
        'plan',
        'created_at',
        'last_active_at',
        'email_verified_at',
        'suspended_at',
        'suspended_reason',
      ])
      .where('handle', '=', handle.toLowerCase().replace(/^@/, ''))
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    if (person?.kind !== 'human') throw notFound(tr('That person'));
    const now = ctx.now();
    const [sessions, devices, tokens, grants, codes, orgs] = await Promise.all([
      ctx.db
        .selectFrom('sessions')
        .select(['id', 'kind', 'platform', 'device_name', 'created_at', 'last_seen_at'])
        .where('user_id', '=', person.id)
        .where('revoked_at', 'is', null)
        .where('expires_at', '>', now)
        .orderBy('last_seen_at', 'desc')
        .execute(),
      ctx.db
        .selectFrom('e2ee_devices')
        .select(({ fn }) => fn.countAll<number>().as('n'))
        .where('user_id', '=', person.id)
        .where('revoked_at', 'is', null)
        .executeTakeFirstOrThrow(),
      ctx.db
        .selectFrom('personal_tokens')
        .select(({ fn }) => fn.countAll<number>().as('n'))
        .where('user_id', '=', person.id)
        .where('revoked_at', 'is', null)
        .executeTakeFirstOrThrow(),
      ctx.db
        .selectFrom('oauth_grants')
        .select(({ fn }) => fn.countAll<number>().as('n'))
        .where('user_id', '=', person.id)
        .where('revoked_at', 'is', null)
        .executeTakeFirstOrThrow(),
      ctx.db
        .selectFrom('recovery_codes')
        .select(({ fn }) => fn.countAll<number>().as('n'))
        .where('user_id', '=', person.id)
        .where('used_at', 'is', null)
        .executeTakeFirstOrThrow(),
      ctx.db
        .selectFrom('org_members as m')
        .innerJoin('organizations as o', 'o.id', 'm.org_id')
        .select(['o.handle', 'm.role'])
        .where('m.user_id', '=', person.id)
        .where('m.left_at', 'is', null)
        .where('o.archived_at', 'is', null)
        .execute(),
    ]);
    await audit(ctx.db, {
      actorId: null,
      action: 'admin.person_viewed',
      target: person.id,
      metadata: { operator: by },
    });
    return {
      person: {
        id: person.id,
        handle: person.handle,
        displayName: person.display_name,
        plan: person.plan,
        createdAt: person.created_at.toISOString(),
        lastActiveAt: person.last_active_at?.toISOString() ?? null,
        emailConfirmed: person.email_verified_at !== null,
        suspended: person.suspended_at !== null,
        suspendedReason: person.suspended_reason,
        sessions: sessions.map((s) => ({
          id: s.id,
          kind: s.kind,
          platform: s.platform,
          deviceName: s.device_name,
          createdAt: s.created_at.toISOString(),
          lastSeenAt: s.last_seen_at.toISOString(),
        })),
        privateDevices: Number(devices.n),
        personalTokens: Number(tokens.n),
        appGrants: Number(grants.n),
        recoveryCodesLeft: Number(codes.n),
        organizations: orgs.map((o) => ({ handle: o.handle, role: o.role })),
      },
    };
  });

  /** Every way in ended for someone whose account may be in the wrong hands. */
  app.delete('/admin/people/:handle/sessions', async (req): Promise<OkResponse> => {
    const by = operator(req);
    const { handle } = parse(handleParam, req.params);
    const person = await personByHandle(handle);
    await endAllAccess(ctx, person.id, null);
    await audit(ctx.db, {
      actorId: null,
      action: 'admin.access_ended',
      target: person.id,
      metadata: { operator: by },
    });
    return { ok: true };
  });

  /**
   * A way back in for someone without their recovery codes: the reset link goes to the
   * account's own address, as the sign-in screen would send it, never to an address the
   * operator names (that would make the operator a way into any account).
   */
  app.post('/admin/people/:handle/reset', async (req): Promise<OkResponse> => {
    const by = operator(req);
    const { handle } = parse(handleParam, req.params);
    if (!ctx.mail) throw mailUnavailable();
    const person = await personByHandle(handle);
    await sendResetLink(ctx, ctx.mail, person);
    await audit(ctx.db, {
      actorId: null,
      action: 'admin.reset_sent',
      target: person.id,
      metadata: { operator: by },
    });
    return { ok: true };
  });

  /**
   * The reason a suspension from a report gives the person (M16 B6, the DSA's statement of
   * reasons): the operator's own words when they wrote some, else what the report was for.
   */
  const reasonFrom = (report: ReportView, written: string | undefined): string => {
    if (written && written.trim().length >= 10) return written.trim().slice(0, 500);
    const label =
      REPORT_REASON_CHOICES.find((c) => c.value === report.reason)?.label ?? 'Something else';
    return `Reported for: ${label}. Caime looked and upheld the report.`;
  };
  const SuspendFromReport = z.object({ reason: z.string().trim().max(500).optional() });

  /** The reported person suspended, from the report: it's actioned. */
  app.post('/admin/reports/:id/suspend', async (req): Promise<ReportResponse> => {
    const by = operator(req);
    const { id } = parse(reportParam, req.params);
    const { reason } = parse(SuspendFromReport, req.body ?? {});
    const report = await oneReport(id);
    if (!report.person) throw badRequest(tr('This report isn’t about a person.'));
    await setSuspended(ctx, report.person.id, true, reasonFrom(report, reason), by);
    await settleReport(ctx, id, 'actioned');
    return { report: await oneReport(id) };
  });

  /** The reported organization suspended, from the report (M16 B3): it's actioned. */
  app.post('/admin/reports/:id/suspend-org', async (req): Promise<ReportResponse> => {
    const by = operator(req);
    const { id } = parse(reportParam, req.params);
    const report = await oneReport(id);
    if (!report.org) throw badRequest(tr('This report isn’t about an organization.'));
    const { reason } = parse(SuspendFromReport, req.body ?? {});
    await setOrgSuspended(ctx, report.org.id, true, reasonFrom(report, reason), by);
    await settleReport(ctx, id, 'actioned');
    return { report: await oneReport(id) };
  });

  /**
   * An organization suspended, or lifted (M16 B3): nothing written as it or to it, its page and
   * handle nobody's to anyone new, its apps' tokens refused, its updates stopped; nothing of it
   * goes, and lifting brings it all back. Its team sees the reason.
   */
  app.put('/admin/orgs/:handle/suspension', async (req): Promise<OkResponse> => {
    const by = operator(req);
    const { handle } = parse(handleParam, req.params);
    const body = parse(SuspensionBody, req.body);
    const org = await ctx.db
      .selectFrom('organizations')
      .select('id')
      .where('handle', '=', handle.toLowerCase().replace(/^@/, ''))
      .where('archived_at', 'is', null)
      .executeTakeFirst();
    if (!org) throw notFound(tr('That organization'));
    await setOrgSuspended(ctx, org.id, body.suspended, body.reason ?? null, by);
    return { ok: true };
  });

  /**
   * A date of birth corrected at its owner's request (the privacy page's "write to us", M16 B3):
   * a real day, never one under the age Caime asks where they live (suspend instead), kept out
   * of the audit log, and the under-18 rules follow at once (`privacyOf` reads it on every
   * request).
   */
  app.put('/admin/people/:handle/birth-date', async (req): Promise<OkResponse> => {
    const by = operator(req);
    const { handle } = parse(handleParam, req.params);
    const { birthDate } = parse(BirthDateBody, req.body);
    const person = await ctx.db
      .selectFrom('users')
      .select(['id', 'country', 'time_zone'])
      .where('handle', '=', handle.toLowerCase().replace(/^@/, ''))
      .where('kind', '=', 'human')
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    if (!person) throw notFound(tr('That person'));
    const day = new Date(`${birthDate}T00:00:00Z`);
    if (Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== birthDate)
      throw badRequest(tr('Enter a date like 1990-05-17.'));
    if (
      !oldEnoughIn(ctx.config.MINIMUM_AGE, person.country, birthDate, ctx.now(), person.time_zone)
    )
      throw tooYoung(ctx.config.MINIMUM_AGE, person.country);
    await ctx.db
      .updateTable('users')
      .set({ birth_date: birthDate })
      .where('id', '=', person.id)
      .execute();
    await audit(ctx.db, {
      actorId: null,
      action: 'moderation.birth_date',
      target: person.id,
      metadata: { operator: by },
    });
    await ctx.bus.publish([person.id], { type: 'me.updated', data: { id: person.id } });
    return { ok: true };
  });

  // The audit log's chain (R78): the newest rows recomputed and relinked, the head to note down.
  const auditQuery = z.object({ limit: z.coerce.number().int().min(1).max(100_000).optional() });
  app.get('/admin/audit', async (req): Promise<AuditChainResponse> => {
    const by = operator(req);
    const { limit } = parse(auditQuery, req.query);
    const chain = await verifyAuditChain(ctx.db, limit ?? AUDIT_VERIFY_ROWS);
    await audit(ctx.db, {
      actorId: null,
      action: 'admin.audit_verified',
      metadata: { operator: by, checked: chain.checked, ok: chain.ok, head: chain.head },
    });
    return { chain };
  });

  // The providers as their last probe found them (R78), and a probe run now.
  app.get('/admin/providers', async (req): Promise<ProvidersResponse> => {
    const by = operator(req);
    await audit(ctx.db, {
      actorId: null,
      action: 'admin.providers_viewed',
      metadata: { operator: by },
    });
    return { providers: providersView(ctx) };
  });
  app.post('/admin/providers/check', async (req): Promise<ProvidersResponse> => {
    const by = operator(req);
    const providers = await checkProviders(ctx);
    await audit(ctx.db, {
      actorId: null,
      action: 'admin.providers_checked',
      metadata: { operator: by, down: providers.filter((p) => p.up === false).map((p) => p.id) },
    });
    return { providers };
  });

  // The agent's nightly evaluation (M16 G6c): the last run on each model, and one now, as a job
  // (it takes minutes).
  app.get('/admin/agent-eval', async (req): Promise<AgentEvalResponse> => {
    const by = operator(req);
    await audit(ctx.db, {
      actorId: null,
      action: 'admin.agent_eval_viewed',
      metadata: { operator: by },
    });
    const kept = await agentEvalKept(ctx);
    return {
      enabled: ctx.config.AGENT_EVAL_ENABLED && ctx.ai !== null,
      at: kept ? new Date(kept.at).toISOString() : null,
      runs: kept?.runs ?? [],
    };
  });
  app.post('/admin/agent-eval/run', async (req, reply): Promise<OkResponse> => {
    const by = operator(req);
    if (!ctx.ai)
      throw new AppError(503, 'ai_unavailable', tr('AI assist isn’t set up on this server.'));
    // At most one asked for a minute: a second press runs nothing twice.
    await enqueue(
      ctx,
      'agent.eval',
      {},
      {
        dedupeKey: `agent.eval:${Math.floor(ctx.now().getTime() / 60_000)}`,
        maxAttempts: 1,
      },
    );
    await audit(ctx.db, {
      actorId: null,
      action: 'admin.agent_eval_run',
      metadata: { operator: by },
    });
    reply.code(202);
    return { ok: true };
  });

  app.get('/admin/backups', async (req): Promise<BackupsResponse> => {
    const by = operator(req);
    await audit(ctx.db, {
      actorId: null,
      action: 'admin.backups_viewed',
      metadata: { operator: by },
    });
    return {
      enabled: ctx.config.BACKUP_ENABLED,
      encrypts: ctx.config.backupKey !== null,
      dir: backupDir(ctx),
      keepDays: ctx.config.BACKUP_KEEP_DAYS,
      last: await lastBackup(ctx),
      files: await listBackups(ctx),
    };
  });

  /** A backup now, before a risky change or to try the restore drill. */
  app.post('/admin/backups', async (req): Promise<BackupResponse> => {
    const by = operator(req);
    const made = await runBackup(ctx);
    if (!made) throw conflict('backup_running', tr('Another instance is backing up right now.'));
    await audit(ctx.db, {
      actorId: null,
      action: 'admin.backup_run',
      metadata: { file: made.file, bytes: made.bytes, operator: by },
    });
    return { backup: made };
  });

  /** The dead-letter (review 2026-10-17): jobs out of attempts or failing, never their payload. */
  app.get('/admin/jobs', async (req): Promise<AdminJobsResponse> => {
    const by = operator(req);
    await audit(ctx.db, { actorId: null, action: 'admin.jobs_viewed', metadata: { operator: by } });
    return troubledJobs(ctx);
  });

  /**
   * Connected accounts that aren't working (M16 G4): how every use last went, the plans waiting
   * for their card to change, and the failing connections by whose they are, never an address or
   * anything read or written. Reading it is audited.
   */
  app.get('/admin/connections', async (req): Promise<AdminConnectionsResponse> => {
    const by = operator(req);
    const view = await connectionsForOperator(ctx);
    await audit(ctx.db, {
      actorId: null,
      action: 'admin.connections_viewed',
      metadata: { count: view.failing.length, operator: by },
    });
    return view;
  });

  /** A dead job given its attempts back, to run now. */
  app.post('/admin/jobs/:id/retry', async (req): Promise<OkResponse> => {
    const by = operator(req);
    const { id } = parse(z.object({ id: z.string().min(1).max(64) }), req.params);
    if (!(await retryJob(ctx, id))) throw notFound(tr('That job'));
    await audit(ctx.db, {
      actorId: null,
      action: 'admin.job_retried',
      metadata: { jobId: id, operator: by },
    });
    return { ok: true };
  });

  /** The product's health (PRD §82–83): aggregates only, over the last `days`. */
  app.get('/admin/metrics', async (req): Promise<ProductMetricsResponse> => {
    operator(req);
    const { days } = parse(
      z.object({ days: z.coerce.number().int().min(1).max(365).default(28) }),
      req.query,
    );
    return { metrics: await productMetrics(ctx, days) };
  });

  app.put('/admin/people/:handle/plan', async (req): Promise<PlanUsageResponse> => {
    const by = operator(req);
    const { handle } = parse(handleParam, req.params);
    const { plan } = parse(z.object({ plan: z.enum(PERSON_PLANS) }), req.body);
    const person = await ctx.db
      .selectFrom('users')
      .select(['id', 'plan'])
      .where('handle', '=', handle.replace(/^@/, ''))
      .where('kind', '=', 'human')
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    if (!person) throw notFound(tr('That person'));
    // Paying for Pro, they keep it until that ends: never charged for a plan they don't have.
    if (plan === 'personal' && (await paysThroughBilling(ctx, { userId: person.id })))
      throw new AppError(409, 'paying', PAYING('Pro'));
    // The operator's say holds: billing never changes it (setting the plan everyone starts on
    // hands it back to billing).
    await ctx.db
      .updateTable('users')
      .set({
        plan,
        plan_source: plan === 'personal' ? 'default' : 'operator',
        updated_at: ctx.now(),
      })
      .where('id', '=', person.id)
      .execute();
    await audit(ctx.db, {
      actorId: null,
      action: 'plan.changed',
      target: person.id,
      ip: req.ip,
      metadata: { of: 'person', from: person.plan, to: plan, operator: by },
    });
    return { plan: await planUsage(ctx, person.id) };
  });

  app.put('/admin/orgs/:handle/plan', async (req): Promise<OrgPlanResponse> => {
    const by = operator(req);
    const { handle } = parse(handleParam, req.params);
    const { plan } = parse(z.object({ plan: z.enum(ORG_PLANS) }), req.body);
    const org = await ctx.db
      .selectFrom('organizations')
      .select(['id', 'plan'])
      .where('handle', '=', handle.replace(/^@/, ''))
      .where('archived_at', 'is', null)
      .executeTakeFirst();
    if (!org) throw notFound(tr('That organization'));
    if (plan === 'free' && (await paysThroughBilling(ctx, { orgId: org.id })))
      throw new AppError(409, 'paying', PAYING('Business'));
    await ctx.db
      .updateTable('organizations')
      .set({ plan, plan_source: plan === 'free' ? 'default' : 'operator', updated_at: ctx.now() })
      .where('id', '=', org.id)
      .execute();
    await audit(ctx.db, {
      actorId: null,
      action: 'plan.changed',
      target: org.id,
      ip: req.ip,
      metadata: { of: 'organization', from: org.plan, to: plan, operator: by },
    });
    return { plan: await orgPlanView(ctx, org.id) };
  });

  // --- Handles nobody takes on their own (R35) --------------------------------------------------
  // A reserved one (@caime, @support…) for the product's own account or organization, or a held
  // one back to whoever had it, once they've shown it was theirs (Caime keeps no record of whose
  // it was). This is the one way either is given out: sign-up, a handle change and a new
  // organization all refuse them (lib/handles.ts).

  /** The handle asked for, which must be reserved or held: any other, its owner takes themselves. */
  const givableIn = async (body: unknown) => {
    const { handle } = parse(z.object({ handle: Handle }), body);
    if (!isReservedHandle(handle) && !(await handleHeld(ctx.db, handle, ctx.now())))
      throw badRequest(
        tr('That handle isn’t reserved or held: whoever wants it can take it themselves.'),
      );
    return handle;
  };

  /** Gives `handle` to a person or an organization, if nobody else has it; in the audit log. */
  async function giveHandle(
    req: FastifyRequest,
    by: string,
    to: { of: 'person' | 'organization'; id: string; handle: string },
    handle: string,
  ): Promise<void> {
    if (!(await moveHandle(ctx.db, to, handle, ctx.now()))) return;
    await audit(ctx.db, {
      actorId: null,
      action: 'handle.claimed',
      target: to.id,
      ip: req.ip,
      metadata: { of: to.of, from: to.handle, to: handle, operator: by },
    });
  }

  app.put('/admin/people/:handle/handle', async (req): Promise<HandleView> => {
    const by = operator(req);
    const { handle } = parse(handleParam, req.params);
    const wanted = await givableIn(req.body);
    const person = await ctx.db
      .selectFrom('users')
      .select(['id', 'handle'])
      .where('handle', '=', handle.replace(/^@/, ''))
      .where('kind', '=', 'human')
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    if (!person) throw notFound(tr('That person'));
    await giveHandle(req, by, { of: 'person', ...person }, wanted);
    await ctx.bus.publish([person.id], { type: 'me.updated', data: { id: person.id } });
    return { kind: 'person', id: person.id, handle: wanted };
  });

  /**
   * A closed organization deleted for good (R42): a lawful request, or a test that shouldn't
   * stay. Everything its customers were sent by it goes with it, and its handle is held a year
   * from everyone (unless an open organization continues it). Only ever a closed one: an open
   * organization is its owner's to close.
   */
  app.delete('/admin/orgs/:id', async (req): Promise<OkResponse> => {
    const by = operator(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const org = await ctx.db
      .selectFrom('organizations')
      .select(['id', 'handle', 'archived_at', 'succeeded_by'])
      .where('id', '=', id)
      .executeTakeFirst();
    if (!org) throw notFound(tr('That organization'));
    if (!org.archived_at) throw conflict('org_open', tr('Only a closed organization is deleted.'));
    await endBillingOf(ctx, { orgId: id });
    const bots = await ctx.db
      .selectFrom('org_apps')
      .select('bot_user_id')
      .where('org_id', '=', id)
      .union(ctx.db.selectFrom('org_agents').select('bot_user_id').where('org_id', '=', id))
      .execute();
    await ctx.db.transaction().execute(async (trx) => {
      await trx
        .deleteFrom('conversations')
        .where('id', 'in', (eb) =>
          eb.selectFrom('business_threads').select('conversation_id').where('org_id', '=', id),
        )
        .execute();
      await trx.deleteFrom('organizations').where('id', '=', id).execute();
      const botIds = bots.map((b) => b.bot_user_id).filter((x): x is string => Boolean(x));
      if (botIds.length) await trx.deleteFrom('users').where('id', 'in', botIds).execute();
      if (!org.succeeded_by) await releaseHandle(trx, org.handle, ctx.now());
    });
    await audit(ctx.db, {
      actorId: null,
      action: 'org.deleted',
      target: id,
      ip: req.ip,
      metadata: { handle: org.handle, operator: by },
    });
    return { ok: true };
  });

  app.put('/admin/orgs/:handle/handle', async (req): Promise<HandleView> => {
    const by = operator(req);
    const { handle } = parse(handleParam, req.params);
    const wanted = await givableIn(req.body);
    const org = await ctx.db
      .selectFrom('organizations')
      .select(['id', 'handle'])
      .where('handle', '=', handle.replace(/^@/, ''))
      .where('archived_at', 'is', null)
      .executeTakeFirst();
    if (!org) throw notFound(tr('That organization'));
    await giveHandle(req, by, { of: 'organization', ...org }, wanted);
    return { kind: 'org', id: org.id, handle: wanted };
  });

  // --- Apps asking to be listed (R74): looked at once, let into Discover or declined ----------

  app.get('/admin/listings', async (req): Promise<AppListingsResponse> => {
    const by = operator(req);
    const rows = await waitingListings(ctx);
    await audit(ctx.db, {
      actorId: null,
      action: 'admin.listings_viewed',
      metadata: { count: rows.length, operator: by },
    });
    return { listings: rows.map(listingReviewView) };
  });

  app.post('/admin/listings/:id', async (req): Promise<AppListingReviewResponse> => {
    const by = operator(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const body = parse(AppListingReviewBody, req.body);
    const before = await listingById(ctx, id);
    if (!before?.listed_at || before.revoked_at) throw notFound(tr('That app'));
    if (body.decision !== 'list' && !body.reason?.trim())
      throw badRequest(tr('Say why, so the developer can change it and ask again.'));
    // Taken out only once it's in (R80); a waiting one is declined.
    if (body.decision === 'delist' && listingState(before) !== 'listed')
      throw badRequest(tr('Only a listed app can be taken out.'));
    // Let through only with every point of the bar checked (R80).
    if (body.decision === 'list' && LISTING_CHECKS.some((c) => !body.checks?.includes(c)))
      throw badRequest(tr('Check every point of the bar before listing it.'));
    // Only the version looked at is let through or turned down: a change since asks again.
    // Taking a listed app out applies to whatever is live, so it asks for no version.
    if (body.decision !== 'delist' && before.listing_rev !== body.revision)
      throw new AppError(
        409,
        'listing_changed',
        tr('The listing changed since it was looked at: look at it again.'),
      );
    await ctx.db.transaction().execute(async (trx) => {
      // Its address in the marketplace, the first time it's let through, held from then on.
      const slug =
        body.decision === 'list' && !before.slug ? await giveSlug(trx, before) : before.slug;
      await trx
        .updateTable('oauth_clients')
        .set({
          reviewed_at: ctx.now(),
          declined_reason: body.decision === 'list' ? null : (body.reason?.trim() ?? null),
          slug,
        })
        .where('id', '=', id)
        .execute();
      await audit(trx, {
        actorId: null,
        action: 'oauth.listing_reviewed',
        target: id,
        ip: req.ip,
        metadata: { decision: body.decision, checks: body.checks ?? [], operator: by },
      });
    });
    // The marketplace's pages and the sitemap follow at once.
    forgetSitemaps();
    // The developer hears the decision (M9), in their language, with the reason when declined.
    const reason = body.reason?.trim() || null;
    await notify(ctx, {
      userId: before.owner_id,
      kind: 'app',
      level: 'attention',
      title: () =>
        body.decision === 'list'
          ? tr('{name} is listed in Discover', { name: before.name })
          : body.decision === 'delist'
            ? tr('{name} was taken out of Discover', { name: before.name })
            : tr('{name} wasn’t listed', { name: before.name }),
      body: () =>
        body.decision === 'list' ? tr('Anyone on Caime can find and connect it now.') : reason,
      data: { appId: id },
      groupKey: `listing:${id}`,
    });
    const after = await listingById(ctx, id);
    if (!after) throw notFound(tr('That app'));
    // Developer, Discover and the organization's setup screen show the decision (M15).
    await ctx.bus.publish(await listingWatchers(ctx, after), {
      type: 'apps.changed',
      data: { appId: id },
    });
    return { listing: listingReviewView(after) };
  });
}
