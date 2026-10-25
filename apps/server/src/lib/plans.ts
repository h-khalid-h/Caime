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
  type OrgPlan,
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
import { inDollars } from './ai-costs';
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
  const rows = await seatRows(db, [userId]).execute();
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

/** People's own plans and their seats on paid plans' open teams: a row a seat, or one with none. */
const seatRows = (db: Q, userIds: readonly string[]) =>
  db
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
    .select(['u.id', 'u.plan', 'o.id as org_id', 'o.name as org_name', 'o.plan as org_plan'])
    .where('u.id', 'in', userIds);

/**
 * `effectivePlan` for many people at once, a query a thousand (the operator's cost by plan,
 * M16 H7): each one's plan as their allowances read it now.
 */
export async function effectivePlansOf(
  ctx: AppContext,
  userIds: readonly string[],
): Promise<Map<string, Plan>> {
  const people = new Map<string, { own: Plan; seats: OrgPlan[] }>();
  for (let i = 0; i < userIds.length; i += 1000)
    for (const r of await seatRows(ctx.db, userIds.slice(i, i + 1000)).execute()) {
      const one = people.get(r.id) ?? { own: r.plan, seats: [] };
      if (r.org_id && r.org_plan) one.seats.push(r.org_plan);
      people.set(r.id, one);
    }
  return new Map([...people].map(([id, p]) => [id, planWithSeats(p.own, p.seats).plan]));
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

const aiRunsSince = (ctx: AppContext, since: Date) =>
  ctx.db.selectFrom('ai_runs').where('created_at', '>', since);

/**
 * What a day's AI calls cost and when there's room again (M16 G9, R107): the sum of what the
 * last 24 hours' calls cost as they ran (`ai_runs.cost_usd`, `chargedUsd`), against an allowance
 * in US dollars; once it's spent, room comes back as the oldest of them leave the window, so it's
 * the moment enough of them have. `runs` picks whose calls count.
 */
async function spentOver(
  ctx: AppContext,
  runs: (since: Date) => ReturnType<typeof aiRunsSince>,
  allowanceUsd: number,
): Promise<{ usd: number; roomAt: Date | null }> {
  const since = new Date(ctx.now().getTime() - DAY_MS);
  const row = await runs(since)
    .select(sql<number>`coalesce(sum(cost_usd), 0)::float8`.as('usd'))
    .executeTakeFirstOrThrow();
  if (row.usd < allowanceUsd) return { usd: row.usd, roomAt: null };
  // Spent: the calls in order, until what's left after them is under the allowance.
  const costs = await runs(since)
    .select(['created_at', 'cost_usd'])
    .where('cost_usd', '>', 0)
    .orderBy('created_at')
    .execute();
  let left = row.usd;
  for (const c of costs) {
    left -= c.cost_usd ?? 0;
    if (left < allowanceUsd)
      return { usd: row.usd, roomAt: new Date(c.created_at.getTime() + DAY_MS) };
  }
  return { usd: row.usd, roomAt: null };
}

/** What someone's own AI calls cost in the last 24 hours, against their plan's allowance. */
async function aiSpent(ctx: AppContext, userId: string, plan: Plan) {
  return spentOver(
    ctx,
    (since) => aiRunsSince(ctx, since).where('user_id', '=', userId),
    inDollars(PERSON_ALLOWANCES[plan].aiEurPerDay),
  );
}

/**
 * What someone's files take up: finished uploads, and those under way at their full size; and
 * the call recordings they keep past their day (M17 I13d), ready parts' bytes with the frames of
 * their shown screens (M17 I13h).
 */
async function storageUsed(ctx: AppContext, userId: string, db: Q = ctx.db): Promise<number> {
  const files = await db
    .selectFrom('files')
    .select(sql<string>`coalesce(sum(size), 0)::text`.as('bytes'))
    .where('owner_id', '=', userId)
    .where('status', '<>', 'failed')
    .executeTakeFirstOrThrow();
  const kept = await db
    .selectFrom('call_recording_parts as p')
    .innerJoin('call_notes as n', 'n.id', 'p.notes_id')
    .select(sql<string>`coalesce(sum(p.bytes), 0)::text`.as('bytes'))
    .where('n.kept_by', '=', userId)
    .where('p.state', '=', 'ready')
    .executeTakeFirstOrThrow();
  const frames = await db
    .selectFrom('call_recording_frames as f')
    .innerJoin('call_notes as n', 'n.id', 'f.notes_id')
    .select(sql<string>`coalesce(sum(f.bytes), 0)::text`.as('bytes'))
    .where('n.kept_by', '=', userId)
    .executeTakeFirstOrThrow();
  return Number(files.bytes) + Number(kept.bytes) + Number(frames.bytes);
}

/**
 * Room for one more AI assist, else a refusal saying when there's room again: what the last 24
 * hours' calls cost against the plan's allowance (M16 G9, R107), never how many there were.
 * Answers the plan it counted from (their own, or a seat's), which also names the model (M16 H7).
 */
export async function assertAiAllowance(ctx: AppContext, userId: string): Promise<Plan> {
  const plan = await planOf(ctx, userId);
  const { roomAt } = await aiSpent(ctx, userId, plan);
  if (!roomAt) return plan;
  const me = await ctx.db
    .selectFrom('users')
    .select(['locale', 'time_zone'])
    .where('id', '=', userId)
    .executeTakeFirstOrThrow();
  const when = formatSoon(roomAt.toISOString(), ctx.now(), me.time_zone, safeLocale(me.locale));
  const next = nextPersonPlan(plan);
  const more = next ? ` ${tr('{plan} includes more.', { plan: PLAN_NAMES[next] })}` : '';
  throw limit(
    ctx,
    tr('You’ve used the AI assist your plan includes for now. There’s more {when}.{more}', {
      when,
      more,
    }),
    { nextAt: roomAt.toISOString() },
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
      'Insights come with Business: how fast {name}’s team answers, how many customers write, what they book, order and pay, and what’s still open.',
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
    aiSpent(ctx, userId, plan),
    storageUsed(ctx, userId),
    automationsCount(ctx, userId),
  ]);
  return {
    plan,
    allowance,
    used: { aiShare: shareOf(ai, inDollars(allowance.aiEurPerDay)), storageBytes, automations },
    aiNextAt: ai.roomAt?.toISOString() ?? null,
    upgradeUrl: upgrade(ctx),
    via,
  };
}

/** How much of an allowance is used, 0 to 1 to a hundredth: spent is 1 whatever passed it. */
const shareOf = (spent: { usd: number; roomAt: Date | null }, allowanceUsd: number) =>
  spent.roomAt ? 1 : Math.min(0.99, Math.round((spent.usd / allowanceUsd) * 100) / 100);

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

/**
 * What an organization's AI agents cost in the last 24 hours against its plan's backstop
 * (`agentEurPerDay`, M16 G9): every answer the model wrote, sent, drafted or thrown away, since
 * each one cost what it cost.
 */
export async function agentSpent(ctx: AppContext, orgId: string, plan: OrgPlan) {
  return spentOver(
    ctx,
    (since) =>
      aiRunsSince(ctx, since)
        .where('feature', '=', 'agent')
        .where('user_id', 'in', (eb) =>
          eb
            .selectFrom('org_members as m')
            .innerJoin('users as u', 'u.id', 'm.user_id')
            .select('m.user_id')
            .where('m.org_id', '=', orgId)
            .where('u.kind', '=', 'agent'),
        ),
    inDollars(ORG_ALLOWANCES[plan].agentEurPerDay),
  );
}

export async function orgPlanView(ctx: AppContext, orgId: string): Promise<OrgPlanView> {
  const org = await orgPlanRow(ctx, orgId);
  const [size, apps, starts, agentReplies, spent] = await Promise.all([
    teamSize(ctx, orgId),
    appCount(ctx, orgId),
    teamStarts(ctx, orgId),
    agentRepliesToday(ctx, orgId),
    agentSpent(ctx, orgId, org.plan),
  ]);
  return {
    plan: org.plan,
    allowance: ORG_ALLOWANCES[org.plan],
    used: { teamSize: size, apps, startsToday: starts.used, agentRepliesToday: agentReplies },
    agentHeldUntil: spent.roomAt?.toISOString() ?? null,
    upgradeUrl: upgrade(ctx),
  };
}
