/**
 * Plan entitlements (PRD §84, R23), checked where something is added: an AI assist, a file, a
 * person on a team, an app. What each plan includes lives in `@caime/core/plans`; this is the
 * one place that counts usage against it. Nothing here gates the wedge.
 */
import {
  FREE_ORGS_PER_OWNER,
  formatBytes,
  formatSoon,
  nextOrgPlan,
  nextPersonPlan,
  ORG_ALLOWANCES,
  type OrgPlanView,
  PERSON_ALLOWANCES,
  PLAN_NAMES,
  type Plan,
  type PlanSeatView,
  type PlanUsageView,
  planWithSeats,
  safeLocale,
} from '@caime/core';
import { tr, trn } from '@caime/core/i18n';
import { type Kysely, sql, type Transaction } from 'kysely';
import type { AppContext } from '../context';
import type { Database } from '../db/schema';
import { AppError, notFound } from './errors';

type Q = Kysely<Database> | Transaction<Database>;

const DAY_MS = 86_400_000;

const upgrade = (ctx: AppContext) => ctx.config.PLANS_URL ?? null;

/** Refused because of the plan: says what it includes, and what the next one up does. */
function limit(ctx: AppContext, message: string, extra: Record<string, unknown> = {}): AppError {
  return new AppError(403, 'plan_limit', message, { upgradeUrl: upgrade(ctx), ...extra });
}

/**
 * Someone's plan as their allowances read it (M16 H1): their own, or what a seat on an open
 * organization's team includes where that's more (a Business seat includes everything Pro
 * does), with the organization it comes from. One query: their seats on paid plans.
 */
export async function effectivePlan(
  ctx: AppContext,
  userId: string,
  db: Q = ctx.db,
): Promise<{ plan: Plan; via: PlanSeatView | null }> {
  const rows = await db
    .selectFrom('users as u')
    .leftJoin('org_members as m', (j) =>
      j.onRef('m.user_id', '=', 'u.id').on('m.left_at', 'is', null),
    )
    .leftJoin('organizations as o', (j) =>
      j
        .onRef('o.id', '=', 'm.org_id')
        .on('o.archived_at', 'is', null)
        .on('o.suspended_at', 'is', null)
        .on('o.plan', '<>', 'free'),
    )
    .select(['u.plan', 'o.id as org_id', 'o.name as org_name', 'o.plan as org_plan'])
    .where('u.id', '=', userId)
    .execute();
  const own = rows[0]?.plan;
  if (!own) throw notFound(tr('That person'));
  const seats = rows.flatMap((r) =>
    r.org_id && r.org_name && r.org_plan
      ? [{ orgId: r.org_id, name: r.org_name, plan: r.org_plan }]
      : [],
  );
  const { plan, seat } = planWithSeats(
    own,
    seats.map((s) => s.plan),
  );
  return { plan, via: seat === null ? null : (seats[seat] ?? null) };
}

/**
 * Holds an open organization's row for the rest of the transaction, so what's counted against
 * its plan (apps, the team's starts) is counted once at a time (M16 H1).
 */
export async function lockOrgRow(trx: Transaction<Database>, orgId: string): Promise<void> {
  const open = await trx
    .selectFrom('organizations')
    .select('id')
    .where('id', '=', orgId)
    .where('archived_at', 'is', null)
    .forNoKeyUpdate()
    .executeTakeFirst();
  if (!open) throw notFound(tr('That organization'));
}

/** One person's files counted against their storage one addition at a time (M16 H1). */
export async function lockStorage(trx: Transaction<Database>, userId: string): Promise<void> {
  await sql`select pg_advisory_xact_lock(hashtext(${`storage:${userId}`}))`.execute(trx);
}

/**
 * Room for one more organization on the Free plan run by this owner (M16 H1): counted under the
 * person's lock in the transaction that makes it, so two at once never pass together. Only free
 * ones count; one on Business, or closed, makes room.
 */
export async function assertOrgRoom(
  ctx: AppContext,
  userId: string,
  trx: Transaction<Database>,
): Promise<void> {
  await sql`select pg_advisory_xact_lock(hashtext(${`orgs-owned:${userId}`}))`.execute(trx);
  const { n } = await trx
    .selectFrom('org_members as m')
    .innerJoin('organizations as o', 'o.id', 'm.org_id')
    .select(sql<number>`count(*)::int`.as('n'))
    .where('m.user_id', '=', userId)
    .where('m.role', '=', 'owner')
    .where('m.left_at', 'is', null)
    .where('o.archived_at', 'is', null)
    .where('o.plan', '=', 'free')
    .executeTakeFirstOrThrow();
  if (n < FREE_ORGS_PER_OWNER) return;
  throw limit(
    ctx,
    tr(
      'You run {count} on the {plan} plan already. Move one to {next}, or close one, to start another.',
      {
        count: trn(FREE_ORGS_PER_OWNER, 'one organization', '{n} organizations'),
        plan: PLAN_NAMES.free,
        next: PLAN_NAMES.business,
      },
    ),
    { nextPlan: 'business' },
  );
}

async function planOf(ctx: AppContext, userId: string, db: Q = ctx.db): Promise<Plan> {
  return (await effectivePlan(ctx, userId, db)).plan;
}

/** Successful AI assists in the last 24 hours, and when the oldest of them stops counting. */
async function aiUsage(ctx: AppContext, userId: string) {
  const since = new Date(ctx.now().getTime() - DAY_MS);
  const row = await ctx.db
    .selectFrom('ai_runs')
    .select([sql<number>`count(*)::int`.as('n'), sql<Date | null>`min(created_at)`.as('oldest')])
    .where('user_id', '=', userId)
    .where('outcome', '=', 'ok')
    .where('created_at', '>', since)
    .executeTakeFirstOrThrow();
  return { used: row.n, oldest: row.oldest };
}

/** What someone's files take up: finished uploads, and those under way at their full size. */
async function storageUsed(ctx: AppContext, userId: string, db: Q = ctx.db): Promise<number> {
  const row = await db
    .selectFrom('files')
    .select(sql<string>`coalesce(sum(size), 0)::text`.as('bytes'))
    .where('owner_id', '=', userId)
    .where('status', '<>', 'failed')
    .executeTakeFirstOrThrow();
  return Number(row.bytes);
}

export async function assertAiAllowance(ctx: AppContext, userId: string): Promise<void> {
  const me = await ctx.db
    .selectFrom('users')
    .select(['locale', 'time_zone'])
    .where('id', '=', userId)
    .executeTakeFirstOrThrow();
  const plan = await planOf(ctx, userId);
  const { aiPerDay } = PERSON_ALLOWANCES[plan];
  const { used, oldest } = await aiUsage(ctx, userId);
  if (used < aiPerDay) return;
  const nextAt = oldest ? new Date(oldest.getTime() + DAY_MS) : null;
  const ready = nextAt
    ? ` ${tr('The next one is ready {when}.', { when: formatSoon(nextAt.toISOString(), ctx.now(), me.time_zone, safeLocale(me.locale)) })}`
    : '';
  const next = nextPersonPlan(plan);
  const more = next
    ? ` ${tr('{plan} includes {n} a day.', { plan: PLAN_NAMES[next], n: PERSON_ALLOWANCES[next].aiPerDay })}`
    : '';
  throw limit(
    ctx,
    tr('You’ve used today’s {aiPerDay} AI assists.{ready}{more}', { aiPerDay, ready, more }),
    {
      nextAt: nextAt?.toISOString() ?? null,
    },
  );
}

/**
 * Room for `adding` more bytes of someone's files; `db` is the transaction that adds them, under
 * the person's `lockStorage`, where there is one.
 */
export async function assertStorage(
  ctx: AppContext,
  userId: string,
  adding: number,
  db: Q = ctx.db,
) {
  const plan = await planOf(ctx, userId, db);
  const { storageBytes } = PERSON_ALLOWANCES[plan];
  const used = await storageUsed(ctx, userId, db);
  if (used + adding <= storageBytes) return;
  const next = nextPersonPlan(plan);
  const more = next
    ? ` ${tr('{plan} includes {bytes}.', { plan: PLAN_NAMES[next], bytes: formatBytes(PERSON_ALLOWANCES[next].storageBytes) })}`
    : '';
  throw limit(
    ctx,
    tr('That’s more than the {allowed} of files your plan includes ({used} used).{more}', {
      allowed: formatBytes(storageBytes),
      used: formatBytes(used),
      more,
    }),
  );
}

async function orgPlanRow(ctx: AppContext, orgId: string, db: Q = ctx.db) {
  return db
    .selectFrom('organizations')
    .select(['name', 'plan'])
    .where('id', '=', orgId)
    .executeTakeFirstOrThrow();
}

/** People on a team: an app's bot is on it, but isn't counted. */
async function teamSize(ctx: AppContext, orgId: string, db: Q = ctx.db): Promise<number> {
  const row = await db
    .selectFrom('org_members as m')
    .innerJoin('users as u', 'u.id', 'm.user_id')
    .select(sql<number>`count(*)::int`.as('n'))
    .where('m.org_id', '=', orgId)
    .where('m.left_at', 'is', null)
    .where('u.kind', '=', 'human')
    .executeTakeFirstOrThrow();
  return row.n;
}

async function appCount(ctx: AppContext, orgId: string, db: Q = ctx.db): Promise<number> {
  const row = await db
    .selectFrom('org_apps')
    .select(sql<number>`count(*)::int`.as('n'))
    .where('org_id', '=', orgId)
    .where('revoked_at', 'is', null)
    .executeTakeFirstOrThrow();
  return row.n;
}

/** Room on the team for `adding` more people; `db` is the transaction that adds them, if any. */
export async function assertTeamRoom(
  ctx: AppContext,
  orgId: string,
  adding: number,
  db: Q = ctx.db,
) {
  const org = await orgPlanRow(ctx, orgId, db);
  const { teamSize: room } = ORG_ALLOWANCES[org.plan];
  if ((await teamSize(ctx, orgId, db)) + adding <= room) return;
  const next = nextOrgPlan(org.plan);
  const more = next
    ? ` ${tr('{plan} has room for {n}.', { plan: PLAN_NAMES[next], n: ORG_ALLOWANCES[next].teamSize })}`
    : '';
  throw limit(
    ctx,
    tr('{name}’s {plan} plan has room for {room} people on the team.{more}', {
      name: org.name,
      plan: PLAN_NAMES[org.plan],
      room,
      more,
    }),
  );
}

/**
 * Room for one more app; `db` is the transaction that adds it, holding the organization's row
 * (`lockOrgRow`), so two at once never pass together.
 */
export async function assertAppRoom(ctx: AppContext, orgId: string, db: Q = ctx.db) {
  const org = await orgPlanRow(ctx, orgId, db);
  const { apps } = ORG_ALLOWANCES[org.plan];
  if ((await appCount(ctx, orgId, db)) < apps) return;
  const next = nextOrgPlan(org.plan);
  const more = next
    ? ` ${tr('{plan} includes {n}.', { plan: PLAN_NAMES[next], n: ORG_ALLOWANCES[next].apps })}`
    : '';
  throw limit(
    ctx,
    tr('{org}’s {plan} plan includes {apps}.{more}', {
      org: org.name,
      plan: PLAN_NAMES[org.plan],
      apps: trn(apps, 'one app', '{n} apps'),
      more,
    }),
  );
}

/** Conversations the team started in the last 24 hours, and when the oldest stops counting. */
async function teamStarts(ctx: AppContext, orgId: string, db: Q = ctx.db) {
  const row = await db
    .selectFrom('business_threads')
    .select([sql<number>`count(*)::int`.as('n'), sql<Date | null>`min(created_at)`.as('oldest')])
    .where('org_id', '=', orgId)
    .where('started_by_team', '=', true)
    .where('created_at', '>', new Date(ctx.now().getTime() - DAY_MS))
    .executeTakeFirstOrThrow();
  return { used: row.n, oldest: row.oldest };
}

/**
 * Room for the team to start one more conversation today (R14); `userId` reads the time, and
 * `db` is the transaction that starts it, holding the organization's row (`lockOrgRow`).
 */
export async function assertStartRoom(
  ctx: AppContext,
  orgId: string,
  userId: string,
  db: Q = ctx.db,
) {
  const org = await orgPlanRow(ctx, orgId, db);
  const { startsPerDay } = ORG_ALLOWANCES[org.plan];
  const { used, oldest } = await teamStarts(ctx, orgId, db);
  if (used < startsPerDay) return;
  const me = await ctx.db
    .selectFrom('users')
    .select(['locale', 'time_zone'])
    .where('id', '=', userId)
    .executeTakeFirstOrThrow();
  const nextAt = oldest ? new Date(oldest.getTime() + DAY_MS) : null;
  const ready = nextAt
    ? ` ${tr('The next can start {when}.', { when: formatSoon(nextAt.toISOString(), ctx.now(), me.time_zone, safeLocale(me.locale)) })}`
    : '';
  const next = nextOrgPlan(org.plan);
  const more = next
    ? ` ${tr('{plan} includes {n} a day.', { plan: PLAN_NAMES[next], n: ORG_ALLOWANCES[next].startsPerDay })}`
    : '';
  throw limit(
    ctx,
    tr('{name} has started today’s {startsPerDay} new conversations.{ready}{more}', {
      name: org.name,
      startsPerDay,
      ready,
      more,
    }),
    { nextAt: nextAt?.toISOString() ?? null },
  );
}

/** Insights (PRD §71) come with Business and Enterprise. */
export async function assertInsights(ctx: AppContext, orgId: string) {
  const org = await orgPlanRow(ctx, orgId);
  if (ORG_ALLOWANCES[org.plan].insights) return;
  throw limit(
    ctx,
    tr(
      'Insights come with Business: how fast {name}’s team answers, how many customers write, and what’s still open.',
      { name: org.name },
    ),
  );
}

/** Relationship insights are Pro's (R47): the relationships themselves are free. */
export async function assertPersonInsights(ctx: AppContext, userId: string) {
  const plan = await planOf(ctx, userId);
  if (PERSON_ALLOWANCES[plan].insights) return;
  throw limit(
    ctx,
    tr(
      'Relationship insights come with {pro}: who you write with most, who’s gone quiet, how fast you answer and are answered, and when you write.',
      { pro: PLAN_NAMES.pro },
    ),
    { nextPlan: nextPersonPlan(plan) },
  );
}

/**
 * Room for one more automation on this plan. `count` is what's kept now, read under the
 * person's lock by the caller. A lower plan never removes one: it only stops new ones.
 */
export async function assertAutomationRoom(ctx: AppContext, userId: string, count: number) {
  const plan = await planOf(ctx, userId);
  const most = PERSON_ALLOWANCES[plan].automations;
  if (count < most) return;
  const next = nextPersonPlan(plan);
  // Named only when it keeps more: Enterprise keeps what Pro does.
  const more =
    next && PERSON_ALLOWANCES[next].automations > most
      ? ` ${tr('{plan} keeps {n}.', { plan: PLAN_NAMES[next], n: PERSON_ALLOWANCES[next].automations })}`
      : '';
  throw limit(
    ctx,
    tr('{plan} keeps {most} automations. Remove one to add another.{more}', {
      plan: PLAN_NAMES[plan],
      most,
      more,
    }),
    { nextPlan: next },
  );
}

async function automationsCount(ctx: AppContext, userId: string): Promise<number> {
  const row = await ctx.db
    .selectFrom('automations')
    .select(sql<number>`count(*)::int`.as('n'))
    .where('user_id', '=', userId)
    .executeTakeFirstOrThrow();
  return row.n;
}

export async function planUsage(ctx: AppContext, userId: string): Promise<PlanUsageView> {
  const { plan, via } = await effectivePlan(ctx, userId);
  const allowance = PERSON_ALLOWANCES[plan];
  const [ai, storageBytes, automations] = await Promise.all([
    aiUsage(ctx, userId),
    storageUsed(ctx, userId),
    automationsCount(ctx, userId),
  ]);
  return {
    plan,
    allowance,
    used: { aiToday: ai.used, storageBytes, automations },
    aiNextAt:
      ai.used >= allowance.aiPerDay && ai.oldest
        ? new Date(ai.oldest.getTime() + DAY_MS).toISOString()
        : null,
    upgradeUrl: upgrade(ctx),
    via,
  };
}

/**
 * What an organization's AI agents answered in the last 24 hours (PRD §75): every agent it has
 * had, so removing one and adding another starts nothing over.
 */
export async function agentRepliesToday(ctx: AppContext, orgId: string): Promise<number> {
  const row = await ctx.db
    .selectFrom('ai_runs')
    .select(sql<number>`count(*)::int`.as('n'))
    .where('feature', '=', 'agent')
    .where('outcome', '=', 'ok')
    // What it wrote to customers: an answer thrown away was never sent.
    .where('discarded_at', 'is', null)
    .where('created_at', '>', new Date(ctx.now().getTime() - DAY_MS))
    .where('user_id', 'in', (eb) =>
      eb
        .selectFrom('org_members as m')
        .innerJoin('users as u', 'u.id', 'm.user_id')
        .select('m.user_id')
        .where('m.org_id', '=', orgId)
        .where('u.kind', '=', 'agent'),
    )
    .executeTakeFirstOrThrow();
  return row.n;
}

export async function orgPlanView(ctx: AppContext, orgId: string): Promise<OrgPlanView> {
  const org = await orgPlanRow(ctx, orgId);
  const [size, apps, starts, agentReplies] = await Promise.all([
    teamSize(ctx, orgId),
    appCount(ctx, orgId),
    teamStarts(ctx, orgId),
    agentRepliesToday(ctx, orgId),
  ]);
  return {
    plan: org.plan,
    allowance: ORG_ALLOWANCES[org.plan],
    used: { teamSize: size, apps, startsToday: starts.used, agentRepliesToday: agentReplies },
    upgradeUrl: upgrade(ctx),
  };
}
