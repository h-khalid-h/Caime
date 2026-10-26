/**
 * A child's own way to their parent (R122 (2), M16 B8c). Where a parent's consent is what lets
 * someone in (`needsGuardian`), they no longer need their parent to start: they sign up, or tell
 * the truth about their age later, and the account waits (`beginWait`) until a parent agrees.
 * While it waits the child names whom to ask, by their handle, after seeing who that is
 * (`askNamed`), or, for a parent not on Caime yet, sends them a link of their own (`makeAskLink`,
 * `/family/famk_…`, taken by whoever opens it signed in as an adult, `takeAskLink`). One ask at a
 * time, `ASKS_MAX` adults at most; an adult who answers "not my child" ends that ask and is never
 * asked again by that account (`family_refusals`), and the last of them ends the account. A
 * week from when the wait began, unanswered, deletes it as R122's does (`lapseUnanswered`).
 *
 * A child their parent looks after asks that parent to correct their date of birth or where they
 * live (`askCorrection`): applied once the parent agrees (`answerCorrection`), or a document check
 * says they're 18 or over (`applyCheckedCorrection`), never by a keystroke that would leave their
 * parent's care. The day the parent saw when agreeing is the age's source (`birth_date_confirmed_at`).
 */
import { tr, uuidv7 } from '@caime/core';
import type { Kysely, Transaction } from 'kysely';
import type { AppContext } from '../context';
import type { Database } from '../db/schema';
import { deleteAccount } from './account-deletion';
import { audit } from './audit';
import { hashToken, newToken } from './crypto';
import { AppError, notFound } from './errors';
import {
  CHILDREN_MAX,
  endByGuardian,
  needsGuardian,
  supervisorOf,
  tellGuardianAsked,
} from './family';
import { notify } from './notify';
import { isBlockedEitherWay } from './relations';
import { minorOf, oldEnoughIn } from './users';

type Db = Kysely<Database> | Transaction<Database>;

/** The most adults a waiting account asks, by handle or through its link. */
export const ASKS_MAX = 3;
/** How long a child's link to their parent stays open. */
export const ASK_LINK_DAYS = 7;
/** A child's link to their parent as it's carried (`famk_` and 43 characters), and nothing else. */
export const ASK_TOKEN = /^famk_[A-Za-z0-9_-]{43}$/;

export const askLinkUrl = (ctx: AppContext, token: string) =>
  `${ctx.config.PUBLIC_URL}/family/${token}`;

/** Every miss answers the same, whatever its reason: nobody's age, block or refusal is told. */
export const nobodyToAsk = () =>
  new AppError(
    404,
    'not_found',
    tr('Nobody by that handle can be asked. Check it with your parent.'),
  );
export const askLinkGone = () => notFound(tr('That family link'));
const notWaiting = () =>
  new AppError(409, 'conflict', tr('Your account isn’t waiting for a parent.'));

/**
 * The wait begun for someone who needs a parent's yes and has none (their sign-up, or a date of
 * birth or a country they corrected): nobody asked yet. Nothing when one is live already.
 */
export async function beginWait(
  db: Db,
  childId: string,
  began: 'sign_up' | 'corrected',
  now: Date,
): Promise<void> {
  await db
    .insertInto('guardianships')
    .values({ id: uuidv7(), child_id: childId, asked_at: now, began })
    .onConflict((oc) => oc.column('child_id').where('ended_at', 'is', null).doNothing())
    .execute();
}

/**
 * What a new date of birth or country makes of an account where it would live: `ok` (old enough
 * there, or a parent's consent that holds looks after them already), `wait` (a parent's yes is
 * what lets them in, and nobody's holds: the account waits for one), or `refused` (too young for
 * Caime there, parent or not).
 */
export async function ageChangeFor(
  ctx: AppContext,
  userId: string,
  next: { birthDate: string; country: string | null; timeZone: string | null },
): Promise<'ok' | 'wait' | 'refused'> {
  const now = ctx.now();
  if (oldEnoughIn(ctx.config.MINIMUM_AGE, next.country, next.birthDate, now, next.timeZone))
    return 'ok';
  if (!needsGuardian(next.country, next.birthDate, now, next.timeZone)) return 'refused';
  const held = await ctx.db
    .selectFrom('guardianships')
    .select('id')
    .where('child_id', '=', userId)
    .where('ended_at', 'is', null)
    .where('consented_at', 'is not', null)
    .executeTakeFirst();
  return held ? 'ok' : 'wait';
}

/**
 * Someone a waiting child may ask: an adult with an account of their own, here and not
 * suspended, not the child, not blocked either way, never one who said no to this account. Null
 * for anyone else, said to the child in one way (`nobodyToAsk`).
 */
export async function askableAdult(
  db: Db,
  by: { handle: string } | { id: string },
  childId: string,
  now: Date,
): Promise<{ id: string; displayName: string } | null> {
  const u = await db
    .selectFrom('users')
    .select([
      'id',
      'kind',
      'display_name',
      'birth_date',
      'time_zone',
      'age_minor_until',
      'suspended_at',
      'deleted_at',
    ])
    .$if('handle' in by, (q) =>
      q.where('handle', '=', 'handle' in by ? by.handle.replace(/^@/, '').toLowerCase() : ''),
    )
    .$if('id' in by, (q) => q.where('id', '=', 'id' in by ? by.id : ''))
    .executeTakeFirst();
  if (u?.kind !== 'human' || u.suspended_at || u.deleted_at || u.id === childId) return null;
  if (minorOf(u, now)) return null;
  const [refused, blocked] = await Promise.all([
    db
      .selectFrom('family_refusals')
      .select('child_id')
      .where('child_id', '=', childId)
      .where('guardian_id', '=', u.id)
      .executeTakeFirst(),
    isBlockedEitherWay(db, childId, u.id),
  ]);
  return refused || blocked ? null : { id: u.id, displayName: u.display_name };
}

/** Under the adult's own row (the order a family link takes): whether they've room for a child. */
async function roomFor(trx: Transaction<Database>, adultId: string, now: Date): Promise<boolean> {
  await trx.selectFrom('users').select('id').where('id', '=', adultId).forUpdate().execute();
  const [children, links] = await Promise.all([
    trx
      .selectFrom('guardianships')
      .select((eb) => eb.fn.countAll<string>().as('n'))
      .where('guardian_id', '=', adultId)
      .where('ended_at', 'is', null)
      .executeTakeFirstOrThrow(),
    trx
      .selectFrom('family_links')
      .select((eb) => eb.fn.countAll<string>().as('n'))
      .where('guardian_id', '=', adultId)
      .where('revoked_at', 'is', null)
      .where('spent_by', 'is', null)
      .where('expires_at', '>', now)
      .executeTakeFirstOrThrow(),
  ]);
  return Number(children.n) + Number(links.n) < CHILDREN_MAX;
}

/** The child's own live wait under its lock, or the refusal that says why there's none to change. */
async function lockWait(trx: Transaction<Database>, childId: string) {
  const g = await trx
    .selectFrom('guardianships')
    .select(['id', 'guardian_id', 'link_id', 'asks', 'began'])
    .where('child_id', '=', childId)
    .where('ended_at', 'is', null)
    .where('consented_at', 'is', null)
    .forUpdate()
    .executeTakeFirst();
  // A wait their parent's own link began is that parent's to answer.
  if (!g || g.link_id || g.began === 'link') throw notWaiting();
  return g;
}

const tooManyAsked = () =>
  new AppError(
    409,
    'limit',
    tr(
      'You’ve asked {max} people. If none of them is your parent or guardian, this account can’t go on.',
      {
        max: ASKS_MAX,
      },
    ),
  );

/**
 * The child names their parent by handle, having seen who that is: asked at once, and told as a
 * family link's parent is. Asking the one already asked asks nothing more.
 */
export async function askNamed(ctx: AppContext, childId: string, handle: string): Promise<string> {
  const now = ctx.now();
  const adult = await askableAdult(ctx.db, { handle }, childId, now);
  if (!adult) throw nobodyToAsk();
  const asked = await ctx.db.transaction().execute(async (trx) => {
    if (!(await roomFor(trx, adult.id, now))) throw nobodyToAsk();
    const g = await lockWait(trx, childId);
    if (g.guardian_id === adult.id) return false;
    if (g.asks >= ASKS_MAX) throw tooManyAsked();
    await trx
      .updateTable('guardianships')
      .set({ guardian_id: adult.id, asks: g.asks + 1, ask_token_hash: null, ask_expires_at: null })
      .where('id', '=', g.id)
      .execute();
    return true;
  });
  if (asked) {
    const child = await ctx.db
      .selectFrom('users')
      .select('display_name')
      .where('id', '=', childId)
      .executeTakeFirstOrThrow();
    await audit(ctx.db, { actorId: childId, action: 'family.named', target: adult.id });
    ctx.metrics.family.inc({ step: 'named' });
    await tellGuardianAsked(ctx, adult.id, childId, child.display_name, 'named');
  }
  await ctx.bus.publish([childId], { type: 'family.changed', data: {} });
  return adult.id;
}

/**
 * A link the child sends a parent who isn't on Caime yet, from their own phone: shown once, kept
 * as its hash, open `ASK_LINK_DAYS`. It replaces an ask that's waiting (one at a time).
 */
export async function makeAskLink(
  ctx: AppContext,
  childId: string,
): Promise<{ url: string; expiresAt: Date }> {
  const now = ctx.now();
  const token = newToken('famk');
  const expiresAt = new Date(now.getTime() + ASK_LINK_DAYS * 86_400_000);
  await ctx.db.transaction().execute(async (trx) => {
    const g = await lockWait(trx, childId);
    if (g.asks >= ASKS_MAX) throw tooManyAsked();
    await trx
      .updateTable('guardianships')
      .set({ guardian_id: null, ask_token_hash: hashToken(token), ask_expires_at: expiresAt })
      .where('id', '=', g.id)
      .execute();
  });
  ctx.metrics.family.inc({ step: 'ask_link' });
  await ctx.bus.publish([childId], { type: 'family.changed', data: {} });
  return { url: askLinkUrl(ctx, token), expiresAt };
}

/** A child's link still open, with the child's name, for its page; null for anything else. */
export async function liveAskLink(
  db: Db,
  token: string,
  now: Date,
): Promise<{ childId: string; childName: string } | null> {
  if (!ASK_TOKEN.test(token)) return null;
  const row = await db
    .selectFrom('guardianships as g')
    .innerJoin('users as u', 'u.id', 'g.child_id')
    .select(['g.child_id', 'u.display_name'])
    .where('g.ask_token_hash', '=', hashToken(token))
    .where('g.ended_at', 'is', null)
    .where('g.consented_at', 'is', null)
    .where('g.ask_expires_at', '>', now)
    .where('u.deleted_at', 'is', null)
    .executeTakeFirst();
  return row ? { childId: row.child_id, childName: row.display_name } : null;
}

/**
 * An adult opens the child's link signed in: they become the one asked, on Family to agree or say
 * it isn't their child's, exactly as if the child had named them. The link is spent.
 */
export async function takeAskLink(
  ctx: AppContext,
  adultId: string,
  token: string,
): Promise<string> {
  const now = ctx.now();
  const open = await liveAskLink(ctx.db, token, now);
  if (!open) throw askLinkGone();
  const adult = await askableAdult(ctx.db, { id: adultId }, open.childId, now);
  if (!adult) throw new AppError(403, 'forbidden', tr('Only an adult adds a child to Caime.'));
  await ctx.db.transaction().execute(async (trx) => {
    if (!(await roomFor(trx, adultId, now)))
      throw new AppError(
        409,
        'limit',
        tr('A parent adds up to {max} children on Caime.', { max: CHILDREN_MAX }),
      );
    const g = await trx
      .selectFrom('guardianships')
      .select(['id', 'asks'])
      .where('child_id', '=', open.childId)
      .where('ask_token_hash', '=', hashToken(token))
      .where('ended_at', 'is', null)
      .where('consented_at', 'is', null)
      .forUpdate()
      .executeTakeFirst();
    // Taken a moment ago by someone else, or replaced.
    if (!g) throw askLinkGone();
    if (g.asks >= ASKS_MAX) throw askLinkGone();
    await trx
      .updateTable('guardianships')
      .set({ guardian_id: adultId, asks: g.asks + 1, ask_token_hash: null, ask_expires_at: null })
      .where('id', '=', g.id)
      .execute();
  });
  await audit(ctx.db, { actorId: adultId, action: 'family.link_taken', target: open.childId });
  ctx.metrics.family.inc({ step: 'ask_taken' });
  await ctx.bus.publish([open.childId], { type: 'family.changed', data: {} });
  await ctx.bus.publish([adultId], { type: 'family.changed', data: {} });
  return open.childId;
}

/**
 * "Not my child" before agreeing. What a parent's own link made is deleted, as R122 has it; an
 * ask the child made ends there: that adult is never asked again by this account, and the child
 * names someone else, until the last they may ask says no too, which ends the account.
 */
export async function refuseChild(
  ctx: AppContext,
  guardianId: string,
  childId: string,
): Promise<void> {
  const now = ctx.now();
  const outcome = await ctx.db.transaction().execute(async (trx) => {
    const g = await trx
      .selectFrom('guardianships')
      .select(['id', 'began', 'link_id', 'asks'])
      .where('child_id', '=', childId)
      .where('guardian_id', '=', guardianId)
      .where('ended_at', 'is', null)
      .where('consented_at', 'is', null)
      .forUpdate()
      .executeTakeFirst();
    if (!g) throw notFound(tr('That child'));
    if (g.link_id || g.began === 'link') return 'link' as const;
    await trx
      .insertInto('family_refusals')
      .values({ child_id: childId, guardian_id: guardianId, refused_at: now })
      .onConflict((oc) => oc.columns(['child_id', 'guardian_id']).doNothing())
      .execute();
    if (g.asks >= ASKS_MAX) {
      await trx
        .updateTable('guardianships')
        .set({ guardian_id: null, ended_at: now, ended_why: 'not_mine' })
        .where('id', '=', g.id)
        .execute();
      return 'last' as const;
    }
    await trx
      .updateTable('guardianships')
      .set({ guardian_id: null })
      .where('id', '=', g.id)
      .execute();
    return 'refused' as const;
  });
  if (outcome === 'link') return endByGuardian(ctx, guardianId, childId, 'not_mine');
  await audit(ctx.db, { actorId: guardianId, action: 'family.refused', target: childId });
  ctx.metrics.family.inc({ step: 'not_mine' });
  await ctx.bus.publish([guardianId], { type: 'family.changed', data: {} });
  if (outcome === 'last') {
    await deleteAccount(ctx, childId);
    return;
  }
  await notify(ctx, {
    userId: childId,
    kind: 'family',
    level: 'attention',
    title: () => tr('The person you asked said they aren’t your parent or guardian'),
    body: () => tr('Ask your parent or guardian on Caime, or send them a link.'),
    data: { family: childId },
  });
  await ctx.bus.publish([childId], { type: 'family.changed', data: {} });
}

/**
 * A child their parent looks after asks them to correct their date of birth or where they live:
 * kept on the guardianship and told to the parent, applied only once they agree (or a document
 * check says 18 or over). A new ask replaces one waiting.
 */
export async function askCorrection(
  ctx: AppContext,
  childId: string,
  guardianId: string,
  change: { bornOn?: string; country?: string },
): Promise<void> {
  const now = ctx.now();
  const g = await ctx.db
    .updateTable('guardianships')
    .set({
      asked_born_on: change.bornOn ?? null,
      asked_country: change.country ?? null,
      correction_asked_at: now,
    })
    .where('child_id', '=', childId)
    .where('guardian_id', '=', guardianId)
    .where('ended_at', 'is', null)
    .where('consented_at', 'is not', null)
    .returning('id')
    .executeTakeFirst();
  if (!g) throw notFound(tr('Your parent'));
  const child = await ctx.db
    .selectFrom('users')
    .select('display_name')
    .where('id', '=', childId)
    .executeTakeFirstOrThrow();
  await audit(ctx.db, { actorId: childId, action: 'family.correction_asked', target: guardianId });
  await notify(ctx, {
    userId: guardianId,
    kind: 'family',
    level: 'attention',
    title: () =>
      change.bornOn
        ? tr('{name} asks to correct their date of birth', { name: child.display_name })
        : tr('{name} asks to change where they live', { name: child.display_name }),
    body: () => tr('It waits for your yes, in Family.'),
    data: { family: childId },
  });
  await ctx.bus.publish([guardianId, childId], { type: 'family.changed', data: {} });
}

/** What a correction the parent agrees to (or a document check) writes on the child's account. */
async function applyCorrection(
  trx: Transaction<Database>,
  childId: string,
  g: { id: string; asked_born_on: string | null; asked_country: string | null },
  now: Date,
  confirmed: boolean,
): Promise<void> {
  await trx
    .updateTable('users')
    .set({
      ...(g.asked_born_on
        ? { birth_date: g.asked_born_on, birth_date_confirmed_at: confirmed ? now : null }
        : {}),
      ...(g.asked_country ? { country: g.asked_country } : {}),
      updated_at: now,
    })
    .where('id', '=', childId)
    .execute();
  await trx
    .updateTable('guardianships')
    .set({ asked_born_on: null, asked_country: null, correction_asked_at: null })
    .where('id', '=', g.id)
    .execute();
}

/** The parent's answer to their child's correction: applied, or let go; the child is told. */
export async function answerCorrection(
  ctx: AppContext,
  guardianId: string,
  childId: string,
  yes: boolean,
): Promise<void> {
  const now = ctx.now();
  await ctx.db.transaction().execute(async (trx) => {
    const g = await trx
      .selectFrom('guardianships')
      .select(['id', 'asked_born_on', 'asked_country'])
      .where('child_id', '=', childId)
      .where('guardian_id', '=', guardianId)
      .where('ended_at', 'is', null)
      .where('consented_at', 'is not', null)
      .where('correction_asked_at', 'is not', null)
      .forUpdate()
      .executeTakeFirst();
    if (!g) throw notFound(tr('That request'));
    if (yes) await applyCorrection(trx, childId, g, now, true);
    else
      await trx
        .updateTable('guardianships')
        .set({ asked_born_on: null, asked_country: null, correction_asked_at: null })
        .where('id', '=', g.id)
        .execute();
  });
  await audit(ctx.db, {
    actorId: guardianId,
    action: yes ? 'family.correction_agreed' : 'family.correction_declined',
    target: childId,
  });
  await notify(ctx, {
    userId: childId,
    kind: 'family',
    level: 'activity',
    title: () =>
      yes
        ? tr('Your parent agreed to your correction')
        : tr('Your parent didn’t agree to your correction'),
    body: null,
    data: { family: guardianId },
  });
  await ctx.bus.publish([childId], { type: 'me.updated', data: { id: childId } });
  await ctx.bus.publish([guardianId, childId], { type: 'family.changed', data: {} });
}

/**
 * A document check found someone 18 or over (M16 B7): a correction they asked of their parent is
 * theirs to make, applied as checked (not as their parent's word). Run in the check's transaction.
 */
export async function applyCheckedCorrection(
  trx: Transaction<Database>,
  userId: string,
  now: Date,
): Promise<void> {
  const g = await trx
    .selectFrom('guardianships')
    .select(['id', 'asked_born_on', 'asked_country'])
    .where('child_id', '=', userId)
    .where('ended_at', 'is', null)
    .where('correction_asked_at', 'is not', null)
    .forUpdate()
    .executeTakeFirst();
  if (g) await applyCorrection(trx, userId, g, now, false);
}

/** Whose say a correction waits on now: the parent who looks after them, or nobody. */
export const correctionGoesTo = (db: Db, userId: string, now: Date) =>
  supervisorOf(db, userId, now);
