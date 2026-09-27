/**
 * How long Caishy keeps what it records about how it's used, as its privacy page says (the page
 * reads these): security records (sign-ins and changes to how an account is secured, with the
 * network address and browser) a year; a sign-in that ended, 30 days after it ended; the log of
 * what happens (a message sent, a connection made, an AI feature used: by account, never the
 * words) 30 days, and what of it names nobody a little over a year, for the product's metrics
 * (they look back up to 365 days); copies of what was sent to an organization's apps, 30 days.
 */
import { type RawBuilder, sql } from 'kysely';
import type { AppContext } from '../context';

export const KEPT_DAYS = {
  securityRecords: 365,
  endedSignIns: 30,
  activity: 30,
  measures: 400,
  appDeliveries: 30,
} as const;

/**
 * What the product's metrics count, recorded without anyone's id (lib/product-metrics.ts). The
 * indexes that find what's due (0032) name the same list, and a test holds them together.
 */
export const MEASURES = ['attention.answered', 'attention.dismissed', 'search.outcome'] as const;

/** Rows a statement takes at a time, so no sweep holds a table, or the database, for long. */
const LOT = 5000;

/** A sweep, a lot at a time until nothing's left. Lots are claimed, so instances share one. */
async function inLots(ctx: AppContext, lot: RawBuilder<unknown>): Promise<void> {
  for (;;) {
    const done = await lot.execute(ctx.db);
    if (Number(done.numAffectedRows ?? 0) < LOT) return;
    // Everyone else's queries first.
    await new Promise((r) => setTimeout(r, 20));
  }
}

/** Daily: each kind of record goes once its time is up, found by when it was written (0032). */
export async function sweepRecords(ctx: AppContext): Promise<void> {
  const now = ctx.now().getTime();
  const before = (days: number) => new Date(now - days * 86_400_000);
  const ended = before(KEPT_DAYS.endedSignIns);
  // Written out, as the indexes are, so the planner sees they fit.
  const measures = sql.join(MEASURES.map((m) => sql.lit(m)));
  await inLots(
    ctx,
    sql`delete from audit_log where id in (select id from audit_log
      where created_at < ${before(KEPT_DAYS.securityRecords)}
      limit ${LOT} for update skip locked)`,
  );
  await inLots(
    ctx,
    sql`delete from domain_events where id in (select id from domain_events
      where created_at < ${before(KEPT_DAYS.activity)} and type not in (${measures})
      limit ${LOT} for update skip locked)`,
  );
  await inLots(
    ctx,
    sql`delete from domain_events where id in (select id from domain_events
      where created_at < ${before(KEPT_DAYS.measures)} and type in (${measures})
      limit ${LOT} for update skip locked)`,
  );
  // An AI feature used: once the log's time is up it names nobody (who, or in what conversation),
  // and it's counted like the measures.
  await inLots(
    ctx,
    sql`update ai_runs set user_id = null, conversation_id = null where id in (select id from ai_runs
      where created_at < ${before(KEPT_DAYS.activity)}
        and (user_id is not null or conversation_id is not null)
      limit ${LOT} for update skip locked)`,
  );
  await inLots(
    ctx,
    sql`delete from ai_runs where id in (select id from ai_runs
      where created_at < ${before(KEPT_DAYS.measures)}
      limit ${LOT} for update skip locked)`,
  );
  await inLots(
    ctx,
    sql`delete from sessions where id in (select id from sessions
      where revoked_at < ${ended} or expires_at < ${ended}
      limit ${LOT} for update skip locked)`,
  );
  await inLots(
    ctx,
    sql`delete from webhook_deliveries where id in (select id from webhook_deliveries
      where created_at < ${before(KEPT_DAYS.appDeliveries)}
      limit ${LOT} for update skip locked)`,
  );
}
