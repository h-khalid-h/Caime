/**
 * Age assurance (M16 B7, REVIEW 2026-10-17 §3): a check begun, what the provider answered applied
 * to the person's standing, and the one question every trigger asks. The person checks on the
 * provider's own page (lib/age-provider.ts); Caime keeps the check's row (who, when, what the
 * provider said, never an image) and, on the account, the standing core's rules make of it
 * (`nextAgeStanding`: a document wins, an under-18 holds for its year, retrying a face lifts
 * nothing), which `minorOf` reads through `age_minor_until`. A provider's notice and the person's
 * return may both bring the same answer: applying it twice changes nothing the second time.
 */
import { uuidv7 } from '@caime/core';
import {
  AGE_CHECKS_A_DAY,
  type AgeStanding,
  type AgeTrigger,
  minorUntil,
  nextAgeStanding,
} from '@caime/core/age-assurance';
import { tr } from '@caime/core/i18n';
import { sql } from 'kysely';
import type { AppContext } from '../context';
import type { AgeResult } from './age-provider';
import { audit } from './audit';
import { AppError } from './errors';
import { minorOf } from './users';

const DAY = 86_400_000;

/** No provider is set here: nobody is asked, and a check can't be begun. */
export const ageCheckUnavailable = () =>
  new AppError(503, 'age_check_unavailable', tr('Age checks aren’t available here.'));

/** What a trigger answers someone not yet checked: what to do, and which trigger asked. */
export const ageCheckNeeded = (trigger: AgeTrigger) =>
  new AppError(
    403,
    'age_check_needed',
    tr('Before this, Caime asks you to check your age once. It takes a minute.'),
    { trigger },
  );

/**
 * Whether someone may go on past a trigger: always where no provider is set or the trigger is
 * off, for anyone but a person, for someone under 18 (the under-18 rules answer for them), and
 * for someone checked 18 or over; anyone else is asked first.
 */
export async function assertAgeChecked(
  ctx: AppContext,
  userId: string,
  trigger: AgeTrigger,
): Promise<void> {
  if (!ctx.age || !ctx.config.ageTriggers.includes(trigger)) return;
  const u = await ctx.db
    .selectFrom('users')
    .select(['kind', 'birth_date', 'time_zone', 'age_check', 'age_minor_until'])
    .where('id', '=', userId)
    .executeTakeFirst();
  if (u?.kind !== 'human' || minorOf(u, ctx.now()) || u.age_check === 'adult') return;
  throw ageCheckNeeded(trigger);
}

/**
 * A check begun: its row (the provider's reference), and the provider's page to open, coming
 * back to `/v1/age/return`. At most `AGE_CHECKS_A_DAY` a day for one person, counted from the
 * rows, so no instance or restart forgets one.
 */
export async function startAgeCheck(
  ctx: AppContext,
  userId: string,
  opts: { back: 'web' | 'app'; trigger: AgeTrigger | null; language: string },
): Promise<string> {
  const provider = ctx.age;
  if (!provider) throw ageCheckUnavailable();
  const since = new Date(ctx.now().getTime() - DAY);
  const today = await ctx.db
    .selectFrom('age_checks')
    .select(sql<number>`count(*)::int`.as('n'))
    .where('user_id', '=', userId)
    .where('created_at', '>', since)
    .executeTakeFirstOrThrow();
  if (today.n >= AGE_CHECKS_A_DAY)
    throw new AppError(
      429,
      'rate_limited',
      tr('That’s as many age checks as a day allows. Try again tomorrow.'),
    );
  const id = uuidv7();
  await ctx.db
    .insertInto('age_checks')
    .values({
      id,
      user_id: userId,
      provider: provider.id,
      back: opts.back,
      trigger: opts.trigger,
      created_at: ctx.now(),
    })
    .execute();
  ctx.metrics.ageChecks.inc({ provider: provider.id, outcome: 'started' });
  const base = ctx.config.PUBLIC_URL.replace(/\/+$/, '');
  return provider.startUrl(
    id,
    (end) => `${base}/v1/age/return?ref=${id}&end=${end}`,
    opts.language,
  );
}

/** A result's strength for a check's own row: a refusal records only where nothing else is. */
const rowNext = (
  row: { outcome: 'adult' | 'minor' | 'failed' | null; method: 'estimate' | 'document' | null },
  result: AgeResult,
  now: Date,
): { outcome: 'adult' | 'minor' | 'failed'; method: 'estimate' | 'document' } | null => {
  if (result.outcome === 'failed') return row.outcome ? null : result;
  if (!row.outcome || row.outcome === 'failed' || !row.method) return result;
  const next = nextAgeStanding(
    { outcome: row.outcome, method: row.method, at: now },
    { outcome: result.outcome, method: result.method, at: now },
    now,
  );
  return next.outcome === row.outcome && next.method === row.method ? null : next;
};

/**
 * What the provider answered for a reference, applied: the check's row, the account's standing
 * by core's rules, the audit chain (outcome, method, provider; nothing of the face), the
 * person's devices told. `unknown` for a reference that isn't Caime's, `unchanged` for an answer
 * already applied.
 */
export async function applyAgeResult(
  ctx: AppContext,
  reference: string,
  result: AgeResult,
): Promise<'applied' | 'unchanged' | 'unknown'> {
  if (!/^[0-9a-f-]{36}$/.test(reference)) return 'unknown';
  const now = ctx.now();
  const done = await ctx.db.transaction().execute(async (trx) => {
    const row = await trx
      .selectFrom('age_checks')
      .select(['id', 'user_id', 'provider', 'outcome', 'method'])
      .where('id', '=', reference)
      .forUpdate()
      .executeTakeFirst();
    if (!row) return null;
    const next = rowNext(row, result, now);
    if (!next) return { userId: row.user_id, provider: row.provider, changed: false };
    await trx
      .updateTable('age_checks')
      .set({
        finished_at: now,
        outcome: next.outcome,
        method: next.method,
        confidence: result.confidence,
        error: next.outcome === 'failed' ? result.error : null,
      })
      .where('id', '=', row.id)
      .execute();
    if (next.outcome !== 'failed') {
      const user = await trx
        .selectFrom('users')
        .select(['age_check', 'age_check_method', 'age_checked_at'])
        .where('id', '=', row.user_id)
        .forUpdate()
        .executeTakeFirstOrThrow();
      const current: AgeStanding | null =
        user.age_check && user.age_check_method && user.age_checked_at
          ? { outcome: user.age_check, method: user.age_check_method, at: user.age_checked_at }
          : null;
      const standing = nextAgeStanding(
        current,
        { outcome: next.outcome, method: next.method, at: now },
        now,
      );
      await trx
        .updateTable('users')
        .set({
          age_check: standing.outcome,
          age_check_method: standing.method,
          age_checked_at: standing.at,
          age_minor_until: minorUntil(standing),
          updated_at: now,
        })
        .where('id', '=', row.user_id)
        .execute();
    }
    await audit(trx, {
      actorId: row.user_id,
      action: 'age.checked',
      target: row.user_id,
      metadata: {
        check: row.id,
        provider: row.provider,
        outcome: next.outcome,
        method: next.method,
      },
    });
    return { userId: row.user_id, provider: row.provider, changed: true, outcome: next.outcome };
  });
  if (!done) return 'unknown';
  if (!done.changed) return 'unchanged';
  ctx.metrics.ageChecks.inc({ provider: done.provider, outcome: done.outcome ?? 'failed' });
  await ctx.bus.publish([done.userId], { type: 'me.updated', data: { id: done.userId } });
  return 'applied';
}

/** Where a check's return lands, and with what to say: the web app's Security, or the phone's. */
export async function ageReturnTarget(
  ctx: AppContext,
  reference: string,
): Promise<{ back: 'web' | 'app'; userId: string } | null> {
  if (!/^[0-9a-f-]{36}$/.test(reference)) return null;
  const row = await ctx.db
    .selectFrom('age_checks')
    .select(['back', 'user_id'])
    .where('id', '=', reference)
    .executeTakeFirst();
  return row ? { back: row.back, userId: row.user_id } : null;
}
