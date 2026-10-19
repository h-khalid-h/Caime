/**
 * The audit log (PRD §81, R78): what was done to accounts and organizations, by whom, kept a
 * year (lib/retention.ts). Since migration 0072 it is a hash chain: as a row's transaction
 * commits, the database seals it (`audit_log_seal`, a deferred trigger under one lock) with
 * its place in the chain (`seq`), the hash of the row sealed before it and its own, over a
 * canonical form only the database knows (`audit_hash`). A row changed, taken out of the
 * middle or put in reads as a break to `verifyAuditChain`, which the operator runs
 * (`GET /v1/admin/audit`) and a daily task runs over the newest rows, logging the chain's head:
 * a copy of its end kept off the database, which rewriting the chain can't reach.
 */
import { type Kysely, sql } from 'kysely';
import type { Database } from '../db/schema';
import { registerPeriodic } from './jobs';
import { auditState } from './metrics';
import { writeSetting } from './settings';

export type AuditAction =
  | 'auth.signup'
  | 'auth.login'
  | 'auth.login_failed'
  | 'auth.logout'
  | 'auth.password_changed'
  | 'auth.recovered'
  | 'auth.email_verified'
  | 'auth.reset_requested'
  | 'auth.reset'
  | 'moderation.report_status'
  | 'moderation.message_removed'
  | 'moderation.update_removed'
  | 'moderation.suspended'
  | 'moderation.org_suspended'
  | 'moderation.org_unsuspended'
  | 'moderation.birth_date'
  | 'moderation.unsuspended'
  | 'age.checked'
  | 'moderation.appealed'
  | 'moderation.appeal_lifted'
  | 'moderation.appeal_upheld'
  | 'admin.person_viewed'
  | 'admin.reports_viewed'
  | 'admin.appeals_viewed'
  | 'admin.backups_viewed'
  | 'admin.backup_run'
  | 'admin.jobs_viewed'
  | 'admin.job_retried'
  | 'admin.audit_verified'
  | 'admin.providers_viewed'
  | 'admin.providers_checked'
  | 'admin.access_ended'
  | 'admin.reset_sent'
  | 'auth.recovery_codes_regenerated'
  | 'auth.passkey_added'
  | 'auth.passkey_removed'
  | 'session.revoked'
  | 'account.exported'
  | 'account.deleted'
  | 'token.created'
  | 'token.revoked'
  | 'calendar.feed_created'
  | 'calendar.feed_stopped'
  | 'org.created'
  | 'org.closed'
  | 'org.cleared'
  | 'org.booking_set'
  | 'org.booking_off'
  | 'org.checkout_connected'
  | 'org.checkout_removed'
  | 'account.booking_set'
  | 'account.booking_off'
  | 'org.exported'
  | 'org.conversation_erased'
  | 'org.retention_set'
  | 'org.domain_join_set'
  | 'org.reclaim_started'
  | 'org.reclaimed'
  | 'org.deleted'
  | 'org.members_added'
  | 'org.invite_made'
  | 'org.invite_revoked'
  | 'org.member_removed'
  | 'org.left'
  | 'org.verified'
  | 'org.update_posted'
  | 'org.update_edited'
  | 'org.update_removed'
  | 'app.created'
  | 'app.updated'
  | 'app.token_replaced'
  | 'app.secret_replaced'
  | 'app.kit_saved'
  | 'app.kit_removed'
  | 'app.revoked'
  | 'oauth.app_created'
  | 'oauth.app_removed'
  | 'oauth.secret_replaced'
  | 'oauth.allowed'
  | 'oauth.removed'
  | 'oauth.app_updated'
  | 'oauth.listing_asked'
  | 'oauth.listing_withdrawn'
  | 'oauth.listing_reviewed'
  | 'admin.listings_viewed'
  | 'agent.created'
  | 'agent.updated'
  | 'agent.removed'
  | 'plan.changed'
  | 'handle.claimed'
  | 'e2ee.device_first'
  | 'e2ee.device_waiting'
  | 'e2ee.device_approved'
  | 'e2ee.device_removed'
  | 'e2ee.device_resumed'
  | 'e2ee.device_restored'
  | 'e2ee.recovery_made';

export async function audit(
  db: Kysely<Database>,
  entry: {
    actorId: string | null;
    action: AuditAction;
    target?: string | null;
    ip?: string | null;
    userAgent?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await db
    .insertInto('audit_log')
    .values({
      actor_id: entry.actorId,
      action: entry.action,
      target: entry.target ?? null,
      ip: entry.ip ?? null,
      user_agent: entry.userAgent?.slice(0, 300) ?? null,
      metadata: entry.metadata ?? {},
    })
    .execute();
}

/** The newest rows the daily check verifies: a year of this log is far fewer. */
export const AUDIT_VERIFY_ROWS = 10_000;
/** At most this many broken places are named in a report. */
const REPORT_MAX = 50;

export interface AuditChainReport {
  /** Rows looked at: the newest `limit`. */
  checked: number;
  firstSeq: number | null;
  lastSeq: number | null;
  /** The newest row's hash: the chain's head. */
  head: string | null;
  /** Rows whose hash no longer matches their fields (changed in place). */
  altered: number[];
  /** Rows whose link doesn't match the row before them (one taken out, or put in). */
  broken: number[];
  ok: boolean;
}

/**
 * Recompute the newest `limit` rows' hashes from their fields and relink them in `seq` order.
 * The window's first row's link isn't checked (the row before it is outside the window, or
 * swept by retention, which takes the chain's start only).
 */
export async function verifyAuditChain(
  db: Kysely<Database>,
  limit = AUDIT_VERIFY_ROWS,
): Promise<AuditChainReport> {
  const r = await sql<{
    checked: number;
    first_seq: number | null;
    last_seq: number | null;
    head: string | null;
    altered: number[] | null;
    broken: number[] | null;
  }>`
    with w as (
      select seq, prev_hash, hash,
        hash = audit_hash(prev_hash, actor_id, action, target, ip, user_agent, metadata, created_at)
          as intact
      from audit_log
      where seq is not null
      order by seq desc
      limit ${limit}
    ),
    c as (
      select seq, hash, intact, prev_hash, lag(hash) over (order by seq) as before from w
    )
    select
      count(*)::int as checked,
      min(seq)::float8 as first_seq,
      max(seq)::float8 as last_seq,
      (select hash from c order by seq desc limit 1) as head,
      (array_agg(seq::float8 order by seq) filter (where not intact))[1:${REPORT_MAX}] as altered,
      (array_agg(seq::float8 order by seq)
        filter (where before is not null and prev_hash is distinct from before))[1:${REPORT_MAX}]
        as broken
    from c
  `.execute(db);
  const row = r.rows[0];
  const altered = row?.altered ?? [];
  const broken = row?.broken ?? [];
  return {
    checked: row?.checked ?? 0,
    firstSeq: row?.first_seq ?? null,
    lastSeq: row?.last_seq ?? null,
    head: row?.head ?? null,
    altered,
    broken,
    ok: altered.length === 0 && broken.length === 0,
  };
}

/** Daily: the newest rows verified, the result on /metrics and the head in the log. */
/** The last check, shared by every instance (`lib/gauges.ts` reads it on scrape). */
export const AUDIT_SETTING = 'audit.last';

export function registerAuditCheck(): void {
  registerPeriodic({
    name: 'audit.verify',
    everyMs: 86_400_000,
    background: true,
    run: async (ctx) => {
      const report = await verifyAuditChain(ctx.db);
      auditState.checkedAt = Date.now();
      auditState.ok = report.ok;
      auditState.headSeq = report.lastSeq ?? 0;
      // Every instance's /metrics says so, not only the one that checked.
      await writeSetting(ctx.db, AUDIT_SETTING, { ...auditState }, ctx.now());
      const line = {
        checked: report.checked,
        seq: report.lastSeq,
        head: report.head,
        altered: report.altered,
        broken: report.broken,
      };
      if (report.ok) ctx.log.info(line, 'audit chain verified');
      else ctx.log.error(line, 'audit chain broken');
    },
  });
}
