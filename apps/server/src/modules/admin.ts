/**
 * The operator's routes, behind `ADMIN_TOKEN`: the product's metrics, setting plans until a
 * billing integration does it (R25), and giving out the handles nobody takes on their own,
 * reserved or held (R35). Without the token configured, none of this exists: every route answers
 * the same 404 as a route that was never there.
 */
import {
  Handle,
  type HandleView,
  isReservedHandle,
  ORG_PLANS,
  PERSON_PLANS,
  type ProductMetricsView,
  ReportStatusBody,
  ReportsQuery,
  type ReportView,
  SuspensionBody,
} from '@caime/core';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { sql } from 'kysely';
import { z } from 'zod';
import type { AppContext } from '../context';
import { audit } from '../lib/audit';
import { backupDir, lastBackup, listBackups, runBackup } from '../lib/backup';
import { endBillingOf, paysThroughBilling } from '../lib/billing';
import { AppError, badRequest, conflict, mailUnavailable, notFound } from '../lib/errors';
import { handleHeld, handleTaken, releaseHandle } from '../lib/handles';
import {
  endAllAccess,
  removeForEveryone,
  reportViews,
  setSuspended,
  settleReport,
  takeBackUpdate,
} from '../lib/moderation';
import { requireOperator } from '../lib/operator';
import { orgPlanView, planUsage } from '../lib/plans';
import { productMetrics } from '../lib/product-metrics';
import { sendResetLink } from '../lib/reset';
import { parse } from '../lib/validate';

const PAYING = (plan: string) =>
  `${plan} is paid for through Stripe: cancel it there (at once, or at the end of what’s paid), and the plan follows.`;

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
    if (!person) throw notFound('That person');
    return person;
  };

  /** The database's backups (docs/DEPLOY.md): the last that succeeded, and the ones on disk. */
  // --- Reports (R49): what people reported, reviewed and acted on by the operator --------------

  app.get('/admin/reports', async (req): Promise<{ reports: ReportView[] }> => {
    operator(req);
    const { status, limit } = parse(ReportsQuery, req.query);
    return { reports: await reportViews(ctx, { status, limit }) };
  });

  const reportParam = z.object({ id: z.string().uuid() });
  const oneReport = async (id: string): Promise<ReportView> => {
    const [report] = await reportViews(ctx, { status: 'all', limit: 1, id });
    if (!report) throw notFound('That report');
    return report;
  };

  /** Moving a report along: reviewing, actioned, dismissed (or back to open). */
  app.patch('/admin/reports/:id', async (req): Promise<{ report: ReportView }> => {
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
  app.post('/admin/reports/:id/remove-message', async (req): Promise<{ report: ReportView }> => {
    const by = operator(req);
    const { id } = parse(reportParam, req.params);
    const report = await oneReport(id);
    if (!report.message) throw badRequest('This report isn’t about a message.');
    const m = await ctx.db
      .selectFrom('messages')
      .select(['id', 'conversation_id', 'pinned_at', 'deleted_at', 'kind'])
      .where('id', '=', report.message.id)
      .executeTakeFirst();
    if (!m) throw notFound('That message');
    if (m.kind === 'system') throw badRequest('Lines about the conversation stay.');
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
  app.post('/admin/reports/:id/remove-update', async (req): Promise<{ report: ReportView }> => {
    const by = operator(req);
    const { id } = parse(reportParam, req.params);
    const report = await oneReport(id);
    if (!report.update || !report.org) throw badRequest('This report isn’t about an update.');
    await takeBackUpdate(ctx, report.org.id, report.update.id, null, by);
    await settleReport(ctx, id, 'actioned');
    return { report: await oneReport(id) };
  });

  /** An account suspended, or the suspension lifted (R49): every way in closes; nothing goes. */
  app.put('/admin/people/:handle/suspension', async (req): Promise<{ ok: true }> => {
    const by = operator(req);
    const { handle } = parse(handleParam, req.params);
    const body = parse(SuspensionBody, req.body);
    const person = await ctx.db
      .selectFrom('users')
      .select(['id', 'kind'])
      .where('handle', '=', handle.toLowerCase().replace(/^@/, ''))
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    if (!person || person.kind !== 'human') throw notFound('That person');
    await setSuspended(ctx, person.id, body.suspended, body.reason ?? null, by);
    return { ok: true };
  });

  /**
   * Someone locked out, or asking what Caime holds (a data-subject request): the account's
   * facts, never its content. Who's signed in where, which devices read private conversations,
   * what tokens and apps act for them, and the ways back in. Looking is written down too.
   */
  app.get('/admin/people/:handle', async (req) => {
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
    if (!person || person.kind !== 'human') throw notFound('That person');
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
  app.delete('/admin/people/:handle/sessions', async (req): Promise<{ ok: true }> => {
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
  app.post('/admin/people/:handle/reset', async (req): Promise<{ ok: true }> => {
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

  /** The reported person suspended, from the report: it's actioned. */
  app.post('/admin/reports/:id/suspend', async (req): Promise<{ report: ReportView }> => {
    const by = operator(req);
    const { id } = parse(reportParam, req.params);
    const report = await oneReport(id);
    if (!report.person) throw badRequest('This report isn’t about a person.');
    await setSuspended(ctx, report.person.id, true, `Report ${id}: ${report.reason}`, by);
    await settleReport(ctx, id, 'actioned');
    return { report: await oneReport(id) };
  });

  app.get('/admin/backups', async (req) => {
    operator(req);
    return {
      enabled: ctx.config.BACKUP_ENABLED,
      dir: backupDir(ctx),
      keepDays: ctx.config.BACKUP_KEEP_DAYS,
      last: await lastBackup(ctx),
      files: await listBackups(ctx),
    };
  });

  /** A backup now, before a risky change or to try the restore drill. */
  app.post('/admin/backups', async (req) => {
    operator(req);
    const made = await runBackup(ctx);
    if (!made) throw conflict('backup_running', 'Another instance is backing up right now.');
    return { backup: made };
  });

  /** The product's health (PRD §82–83): aggregates only, over the last `days`. */
  app.get('/admin/metrics', async (req): Promise<{ metrics: ProductMetricsView }> => {
    operator(req);
    const { days } = parse(
      z.object({ days: z.coerce.number().int().min(1).max(365).default(28) }),
      req.query,
    );
    return { metrics: await productMetrics(ctx, days) };
  });

  app.put('/admin/people/:handle/plan', async (req) => {
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
    if (!person) throw notFound('That person');
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

  app.put('/admin/orgs/:handle/plan', async (req) => {
    const by = operator(req);
    const { handle } = parse(handleParam, req.params);
    const { plan } = parse(z.object({ plan: z.enum(ORG_PLANS) }), req.body);
    const org = await ctx.db
      .selectFrom('organizations')
      .select(['id', 'plan'])
      .where('handle', '=', handle.replace(/^@/, ''))
      .where('archived_at', 'is', null)
      .executeTakeFirst();
    if (!org) throw notFound('That organization');
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
        'That handle isn’t reserved or held: whoever wants it can take it themselves.',
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
    if (to.handle.toLowerCase() === handle) return;
    await ctx.db.transaction().execute(async (trx) => {
      // People and organizations are two tables, so a claim for each at once would both find
      // the handle free: one handle's claims go one at a time.
      await sql`select pg_advisory_xact_lock(hashtext(${`handle:${handle}`}))`.execute(trx);
      const theirs = to.of === 'person' ? { userId: to.id } : { orgId: to.id };
      if (await handleTaken(trx, handle, theirs))
        throw conflict('handle_taken', 'Someone else has that handle.');
      const change = { handle, updated_at: ctx.now() };
      if (to.of === 'person')
        await trx.updateTable('users').set(change).where('id', '=', to.id).execute();
      else await trx.updateTable('organizations').set(change).where('id', '=', to.id).execute();
      // A held one is someone's again, so nothing's held; the one it had is let go of, as any is.
      await trx.deleteFrom('released_handles').where('handle', '=', handle).execute();
      await releaseHandle(trx, to.handle, ctx.now());
    });
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
    if (!person) throw notFound('That person');
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
  app.delete('/admin/orgs/:id', async (req): Promise<{ ok: true }> => {
    const by = operator(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const org = await ctx.db
      .selectFrom('organizations')
      .select(['id', 'handle', 'archived_at', 'succeeded_by'])
      .where('id', '=', id)
      .executeTakeFirst();
    if (!org) throw notFound('That organization');
    if (!org.archived_at) throw conflict('org_open', 'Only a closed organization is deleted.');
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
    if (!org) throw notFound('That organization');
    await giveHandle(req, by, { of: 'organization', ...org }, wanted);
    return { kind: 'org', id: org.id, handle: wanted };
  });
}
