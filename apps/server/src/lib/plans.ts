/**
 * Plan entitlements (PRD §84, R23), checked where something is added: an AI assist, a file, a
 * person on a team, an app. What each plan includes lives in `@caishy/core/plans`; this is the
 * one place that counts usage against it. Nothing here gates the wedge.
 */
import {
  formatBytes,
  formatSoon,
  nextOrgPlan,
  nextPersonPlan,
  ORG_ALLOWANCES,
  type OrgPlanView,
  PERSON_ALLOWANCES,
  PLAN_NAMES,
  type Plan,
  type PlanUsageView,
  safeLocale,
} from '@caishy/core';
import { sql } from 'kysely';
import type { AppContext } from '../context';
import { AppError } from './errors';

const DAY_MS = 86_400_000;

const upgrade = (ctx: AppContext) => ctx.config.PLANS_URL ?? null;

/** Refused because of the plan: says what it includes, and what the next one up does. */
function limit(ctx: AppContext, message: string, extra: Record<string, unknown> = {}): AppError {
  return new AppError(403, 'plan_limit', message, { upgradeUrl: upgrade(ctx), ...extra });
}

async function planOf(ctx: AppContext, userId: string): Promise<Plan> {
  const row = await ctx.db
    .selectFrom('users')
    .select('plan')
    .where('id', '=', userId)
    .executeTakeFirstOrThrow();
  return row.plan;
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
async function storageUsed(ctx: AppContext, userId: string): Promise<number> {
  const row = await ctx.db
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
    .select(['plan', 'locale', 'time_zone'])
    .where('id', '=', userId)
    .executeTakeFirstOrThrow();
  const { aiPerDay } = PERSON_ALLOWANCES[me.plan];
  const { used, oldest } = await aiUsage(ctx, userId);
  if (used < aiPerDay) return;
  const nextAt = oldest ? new Date(oldest.getTime() + DAY_MS) : null;
  const ready = nextAt
    ? ` The next one is ready ${formatSoon(nextAt.toISOString(), ctx.now(), me.time_zone, safeLocale(me.locale))}.`
    : '';
  const next = nextPersonPlan(me.plan);
  const more = next
    ? ` ${PLAN_NAMES[next]} includes ${PERSON_ALLOWANCES[next].aiPerDay} a day.`
    : '';
  throw limit(ctx, `You’ve used today’s ${aiPerDay} AI assists.${ready}${more}`, {
    nextAt: nextAt?.toISOString() ?? null,
  });
}

/** Room for `adding` more bytes of someone's files. */
export async function assertStorage(ctx: AppContext, userId: string, adding: number) {
  const plan = await planOf(ctx, userId);
  const { storageBytes } = PERSON_ALLOWANCES[plan];
  const used = await storageUsed(ctx, userId);
  if (used + adding <= storageBytes) return;
  const next = nextPersonPlan(plan);
  const more = next
    ? ` ${PLAN_NAMES[next]} includes ${formatBytes(PERSON_ALLOWANCES[next].storageBytes)}.`
    : '';
  throw limit(
    ctx,
    `That’s more than the ${formatBytes(storageBytes)} of files your plan includes (${formatBytes(used)} used).${more}`,
  );
}

async function orgPlanRow(ctx: AppContext, orgId: string) {
  return ctx.db
    .selectFrom('organizations')
    .select(['name', 'plan'])
    .where('id', '=', orgId)
    .executeTakeFirstOrThrow();
}

/** People on a team: an app's bot is on it, but isn't counted. */
async function teamSize(ctx: AppContext, orgId: string): Promise<number> {
  const row = await ctx.db
    .selectFrom('org_members as m')
    .innerJoin('users as u', 'u.id', 'm.user_id')
    .select(sql<number>`count(*)::int`.as('n'))
    .where('m.org_id', '=', orgId)
    .where('m.left_at', 'is', null)
    .where('u.kind', '=', 'human')
    .executeTakeFirstOrThrow();
  return row.n;
}

async function appCount(ctx: AppContext, orgId: string): Promise<number> {
  const row = await ctx.db
    .selectFrom('org_apps')
    .select(sql<number>`count(*)::int`.as('n'))
    .where('org_id', '=', orgId)
    .where('revoked_at', 'is', null)
    .executeTakeFirstOrThrow();
  return row.n;
}

export async function assertTeamRoom(ctx: AppContext, orgId: string, adding: number) {
  const org = await orgPlanRow(ctx, orgId);
  const { teamSize: room } = ORG_ALLOWANCES[org.plan];
  if ((await teamSize(ctx, orgId)) + adding <= room) return;
  const next = nextOrgPlan(org.plan);
  const more = next ? ` ${PLAN_NAMES[next]} has room for ${ORG_ALLOWANCES[next].teamSize}.` : '';
  throw limit(
    ctx,
    `${org.name}’s ${PLAN_NAMES[org.plan]} plan has room for ${room} people on the team.${more}`,
  );
}

export async function assertAppRoom(ctx: AppContext, orgId: string) {
  const org = await orgPlanRow(ctx, orgId);
  const { apps } = ORG_ALLOWANCES[org.plan];
  if ((await appCount(ctx, orgId)) < apps) return;
  const next = nextOrgPlan(org.plan);
  const more = next ? ` ${PLAN_NAMES[next]} includes ${ORG_ALLOWANCES[next].apps}.` : '';
  throw limit(
    ctx,
    `${org.name}’s ${PLAN_NAMES[org.plan]} plan includes ${apps === 1 ? 'one app' : `${apps} apps`}.${more}`,
  );
}

/** Conversations the team started in the last 24 hours, and when the oldest stops counting. */
async function teamStarts(ctx: AppContext, orgId: string) {
  const row = await ctx.db
    .selectFrom('business_threads')
    .select([sql<number>`count(*)::int`.as('n'), sql<Date | null>`min(created_at)`.as('oldest')])
    .where('org_id', '=', orgId)
    .where('started_by_team', '=', true)
    .where('created_at', '>', new Date(ctx.now().getTime() - DAY_MS))
    .executeTakeFirstOrThrow();
  return { used: row.n, oldest: row.oldest };
}

/** Room for the team to start one more conversation today (R14); `userId` reads the time. */
export async function assertStartRoom(ctx: AppContext, orgId: string, userId: string) {
  const org = await orgPlanRow(ctx, orgId);
  const { startsPerDay } = ORG_ALLOWANCES[org.plan];
  const { used, oldest } = await teamStarts(ctx, orgId);
  if (used < startsPerDay) return;
  const me = await ctx.db
    .selectFrom('users')
    .select(['locale', 'time_zone'])
    .where('id', '=', userId)
    .executeTakeFirstOrThrow();
  const nextAt = oldest ? new Date(oldest.getTime() + DAY_MS) : null;
  const ready = nextAt
    ? ` The next can start ${formatSoon(nextAt.toISOString(), ctx.now(), me.time_zone, safeLocale(me.locale))}.`
    : '';
  const next = nextOrgPlan(org.plan);
  const more = next
    ? ` ${PLAN_NAMES[next]} includes ${ORG_ALLOWANCES[next].startsPerDay.toLocaleString('en-US')} a day.`
    : '';
  throw limit(
    ctx,
    `${org.name} has started today’s ${startsPerDay} new conversations.${ready}${more}`,
    { nextAt: nextAt?.toISOString() ?? null },
  );
}

/** Insights (PRD §71) come with Business and Enterprise. */
export async function assertInsights(ctx: AppContext, orgId: string) {
  const org = await orgPlanRow(ctx, orgId);
  if (ORG_ALLOWANCES[org.plan].insights) return;
  throw limit(
    ctx,
    `Insights come with Business: how fast ${org.name}’s team answers, how many customers write, and what’s still open.`,
  );
}

export async function planUsage(ctx: AppContext, userId: string): Promise<PlanUsageView> {
  const plan = await planOf(ctx, userId);
  const allowance = PERSON_ALLOWANCES[plan];
  const [ai, storageBytes] = await Promise.all([aiUsage(ctx, userId), storageUsed(ctx, userId)]);
  return {
    plan,
    allowance,
    used: { aiToday: ai.used, storageBytes },
    aiNextAt:
      ai.used >= allowance.aiPerDay && ai.oldest
        ? new Date(ai.oldest.getTime() + DAY_MS).toISOString()
        : null,
    upgradeUrl: upgrade(ctx),
  };
}

export async function orgPlanView(ctx: AppContext, orgId: string): Promise<OrgPlanView> {
  const org = await orgPlanRow(ctx, orgId);
  const [size, apps, starts] = await Promise.all([
    teamSize(ctx, orgId),
    appCount(ctx, orgId),
    teamStarts(ctx, orgId),
  ]);
  return {
    plan: org.plan,
    allowance: ORG_ALLOWANCES[org.plan],
    used: { teamSize: size, apps, startsToday: starts.used },
    upgradeUrl: upgrade(ctx),
  };
}
