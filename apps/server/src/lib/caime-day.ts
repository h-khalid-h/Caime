/**
 * Caime's own day, for whoever runs it (M17 I15b, R115, the council in
 * docs/REVIEW-2026-10-25-CAI.md §6): the product's own organization (the one whose verified domain
 * is `PUBLIC_URL`'s, `productDomain`) is Caime one organization among others, and its owner and
 * admins hear the platform's state as Cai's lines: told when a condition crosses (a provider down
 * on two checks in a row, the last backup old or not copied off the server, the audit chain
 * failing, jobs failed for good, a report about a child's safety waiting) and again when it clears,
 * and answered "how is Caime doing" and in the morning brief. Read from what the periodic tasks
 * already keep (`server_settings`) and two counts, never a person, a handle or anyone's words; a
 * check that hasn't run is said as not checked, since silence reads as healthy. Acting stays with
 * the operator's token (R115 (3)): Cai says where, never does.
 */
import { formatAmount, formatWhenAt, safeLocale, tr, trn } from '@caime/core';
import { sql } from 'kysely';
import type { AppContext } from '../context';
import { inEuros } from './ai-costs';
import { AUDIT_SETTING } from './audit';
import { backupBucket, lastBackup } from './backup';
import { productDomain } from './handles';
import type { ProviderHealth } from './metrics';
import { PROVIDERS_SETTING, providerProbes } from './provider-health';
import { readSettings } from './settings';

/** A backup older than this is old: the daily task plus its slack. */
export const BACKUP_STALE_MS = 26 * 3_600_000;
/** An audit check older than this hasn't run lately: the daily task plus a day. */
const AUDIT_STALE_MS = 48 * 3_600_000;
const DAY_MS = 86_400_000;

/** The product's own organization: open, verified at `PUBLIC_URL`'s domain. */
export async function productOrgId(ctx: AppContext): Promise<string | null> {
  const domain = productDomain(ctx.config);
  if (!domain) return null;
  const row = await ctx.db
    .selectFrom('organizations')
    .select('id')
    .where('domain', '=', domain)
    .where('verified_at', 'is not', null)
    .where('archived_at', 'is', null)
    .where('suspended_at', 'is', null)
    .executeTakeFirst();
  return row?.id ?? null;
}

/** Whether a condition is bad now, fine, or unknown (its check hasn't run). */
type State = 'bad' | 'fine' | 'unread';

/** One thing that can cross: its key, its state, how many (jobs, reports), what's said. */
export interface Condition {
  key: string;
  state: State;
  count?: number;
  /** Said when it crosses, and in the day's lines while it's bad. */
  bad: () => string;
  /** Said when it clears. */
  cleared: () => string;
}

/** What the platform's own checks say now, as conditions that can cross and clear. */
export async function platformConditions(ctx: AppContext, now: Date): Promise<Condition[]> {
  const kept = await readSettings<unknown>(ctx.db, [PROVIDERS_SETTING, AUDIT_SETTING]);
  const conditions: Condition[] = [];
  if (ctx.config.PROVIDER_HEALTH_ENABLED) {
    const health = (kept.get(PROVIDERS_SETTING) ?? {}) as Record<string, ProviderHealth>;
    for (const probe of providerProbes(ctx)) {
      const s = health[probe.id];
      conditions.push({
        key: `provider:${probe.id}`,
        state: !s ? 'unread' : !s.up && (s.downs ?? 1) >= 2 ? 'bad' : 'fine',
        bad: () => tr('{name} isn’t answering: two checks in a row failed.', { name: probe.name }),
        cleared: () => tr('{name} answers again.', { name: probe.name }),
      });
    }
  }
  if (ctx.config.BACKUP_ENABLED) {
    const last = await lastBackup(ctx);
    const at = last ? Date.parse(last.at) : null;
    const old = at === null || now.getTime() - at > BACKUP_STALE_MS;
    const uncopied = Boolean(last && backupBucket(ctx.config) && !last.copy);
    conditions.push({
      key: 'backup',
      state: old || uncopied ? 'bad' : 'fine',
      bad: () =>
        at === null
          ? tr('No backup has been made yet.')
          : old
            ? tr('The last backup is older than a day.')
            : tr('The last backup wasn’t copied off the server.'),
      cleared: () => tr('Backups are made and copied again.'),
    });
  }
  const audit = kept.get(AUDIT_SETTING) as
    | { checkedAt?: number; ok?: boolean; headSeq?: number }
    | undefined;
  const checked = typeof audit?.checkedAt === 'number' && audit.checkedAt > 0;
  conditions.push({
    key: 'audit',
    state: !checked
      ? 'unread'
      : audit?.ok === false
        ? 'bad'
        : now.getTime() - (audit?.checkedAt ?? 0) > AUDIT_STALE_MS
          ? 'unread'
          : 'fine',
    bad: () => tr('The audit log’s chain failed its check: the operator’s token reads it.'),
    cleared: () => tr('The audit log’s chain checks out again.'),
  });
  const counts = await sql<{ dead: number; child: number }>`
    select
      (select count(*)::int from jobs where dead_at is not null and done_at is null) as dead,
      (select count(*)::int from reports where closed_at is null and reason = 'child_safety') as child`.execute(
    ctx.db,
  );
  const { dead, child } = counts.rows[0] ?? { dead: 0, child: 0 };
  conditions.push({
    key: 'jobs',
    state: dead > 0 ? 'bad' : 'fine',
    count: dead,
    bad: () =>
      trn(
        dead,
        'One job failed for good: the operator’s token retries it.',
        '{n} jobs failed for good: the operator’s token retries them.',
      ),
    cleared: () => tr('Every job that failed for good has been dealt with.'),
  });
  conditions.push({
    key: 'child_safety',
    state: child > 0 ? 'bad' : 'fine',
    count: child,
    bad: () =>
      trn(
        child,
        'A report about a child’s safety is waiting.',
        '{n} reports about a child’s safety are waiting.',
      ),
    cleared: () => tr('No report about a child’s safety is waiting.'),
  });
  return conditions;
}

/**
 * Caime's own lines for its day, under the organization's: what's wrong first, then what was
 * checked, the people who joined, the day's AI and the version answering. Counts only.
 */
export async function caimeDayText(
  ctx: AppContext,
  now: Date,
  reader: { zone: string; locale: string },
): Promise<string> {
  const locale = safeLocale(reader.locale);
  const conditions = await platformConditions(ctx, now);
  const dayAgo = new Date(now.getTime() - DAY_MS);
  // Who joined, as the operator's product metrics count sign-ups.
  const [joined, spent, waiting] = await Promise.all([
    ctx.db
      .selectFrom('users')
      .select(sql<number>`count(*)::int`.as('n'))
      .where('kind', '=', 'human')
      .where('deleted_at', 'is', null)
      .where('created_at', '>', dayAgo)
      .executeTakeFirst(),
    ctx.db
      .selectFrom('ai_runs')
      .select(sql<number>`coalesce(sum(cost_usd), 0)::float`.as('usd'))
      .where('created_at', '>=', dayAgo)
      .executeTakeFirst(),
    sql<{ reports: number; appeals: number }>`
      select
        (select count(*)::int from reports where closed_at is null) as reports,
        (select count(*)::int from appeals where decided_at is null) as appeals`.execute(ctx.db),
  ]);
  const bad = conditions.filter((c) => c.state === 'bad').map((c) => `• ${c.bad()}`);
  const providers = conditions.filter((c) => c.key.startsWith('provider:'));
  const unread = conditions.filter((c) => c.state === 'unread');
  const lines = [
    ...bad,
    providers.length && providers.every((c) => c.state === 'fine')
      ? trn(providers.length, '• The one provider answers', '• All {n} providers answer')
      : null,
    unread.length
      ? trn(
          unread.length,
          '• One check hasn’t run lately, so it isn’t known',
          '• {n} checks haven’t run lately, so they aren’t known',
        )
      : null,
    await backupLine(ctx, now, reader, locale),
    waiting.rows[0]?.reports
      ? trn(waiting.rows[0].reports, '• One report waiting', '• {n} reports waiting')
      : null,
    waiting.rows[0]?.appeals
      ? trn(waiting.rows[0].appeals, '• One appeal waiting', '• {n} appeals waiting')
      : null,
    joined?.n
      ? trn(joined.n, '• One person joined in the last day', '• {n} people joined in the last day')
      : tr('• Nobody joined in the last day'),
    tr('• AI in the last day: {amount}', {
      amount: formatAmount(inEuros(spent?.usd ?? 0), 'EUR', locale),
    }),
    tr('• Running {version}', { version: ctx.config.version }),
  ].filter((l): l is string => Boolean(l));
  return [tr('Caime itself:'), ...lines].join('\n');
}

/** When the last backup was, while it's fine: what's wrong with it is said with the rest. */
async function backupLine(
  ctx: AppContext,
  now: Date,
  reader: { zone: string },
  locale: string,
): Promise<string | null> {
  if (!ctx.config.BACKUP_ENABLED) return tr('• Backups are off on this server');
  const last = await lastBackup(ctx);
  if (!last || now.getTime() - Date.parse(last.at) > BACKUP_STALE_MS) return null;
  return tr('• Last backup {when}', {
    when: formatWhenAt(last.at, true, now, reader.zone, locale),
  });
}
