/**
 * A child on Caime with a parent's or guardian's consent (R122). Where the law of the country a
 * child lives in asks a guardian's consent (`MINIMUM_AGE_BY_LAW`) and Caime's own consent opens an
 * age there (`GUARDIAN_MINIMUM_AGE`), someone between the two signs up only through their parent's
 * family link, and their account waits until that parent agrees on it:
 *
 * - The parent, an adult on Caime (their age checked by the provider where one is set), makes a
 *   link for one child (`/family/fam_…`, shown once, kept as its hash, open `FAMILY_LINK_DAYS`), at most
 *   `CHILDREN_MAX` children and open links together.
 * - The child signs up through it on their own device (`attachChild`, in sign-up's transaction:
 *   the link spent, the guardianship asked). Until the parent agrees, the child's session reaches
 *   only what waiting takes (`WAITING_ROUTES`, plugins/auth.ts).
 * - The parent agrees on the child's own account (`consentFor`): the consent is kept (when, the
 *   version of its words, how the parent was known), the two are connected, and the child's app
 *   leaves its waiting screen. Or the parent says it isn't their child (`refuseChild`), or never
 *   answers in `CONSENT_DAYS` (the daily sweep): the child's account is deleted, as any is.
 * - Until the child reaches the age where they live (`supervisorOf`), the parent sees whom they're
 *   connected with, never a message, and the child sees exactly that and who their guardian is;
 *   the parent may withdraw the consent, which deletes the child's account.
 */
import { ADULT_AGE, ageOn, tr, uuidv7 } from '@caime/core';
import type { MeView } from '@caime/core/api';
import { countryFacts } from '@caime/core/countries';
import type { Kysely, Selectable, Transaction } from 'kysely';
import type { AppContext } from '../context';
import type { Database, FamilyLinksTable, UserRow } from '../db/schema';
import { deleteAccount } from './account-deletion';
import { assertAgeChecked } from './age';
import { audit } from './audit';
import { formConnection, tellRequested } from './connections';
import { hashToken, newToken } from './crypto';
import { AppError, forbidden, notFound } from './errors';
import { notify } from './notify';
import { createRelationship } from './relationships';
import { meView, minorOf } from './users';

/** How long a family link stays open for the child to sign up through. */
export const FAMILY_LINK_DAYS = 7;
/** How long a child's account waits for the parent to agree before it's deleted. */
export const CONSENT_DAYS = 7;
/** Children and open links one parent holds at once. */
export const CHILDREN_MAX = 5;
/** The version of the consent's words (core's catalogs say them), kept with each consent. */
export const CONSENT_VERSION = '2026-10-26';
/** A family link's token as it's carried (`fam_` and 43 characters), and nothing else. */
export const FAMILY_TOKEN = /^fam_[A-Za-z0-9_-]{43}$/;

type Db = Kysely<Database> | Transaction<Database>;
type Link = Selectable<FamilyLinksTable>;

export const familyLinkUrl = (ctx: AppContext, token: string) =>
  `${ctx.config.PUBLIC_URL}/family/${token}`;

/**
 * Where someone lives, whether a parent's consent is what lets someone of this birth date in:
 * under the law's minimum there, and at or over the age a guardian's consent opens.
 */
export function needsGuardian(
  country: string | null | undefined,
  birthDate: string,
  now: Date,
  timeZone: string | null | undefined,
): boolean {
  const facts = countryFacts(country);
  if (facts.minimumAge === null || facts.guardianAge === null) return false;
  const age = ageOn(birthDate, now, timeZone);
  return age >= facts.guardianAge && age < facts.minimumAge;
}

/** A parent's link for one child; the token comes back this once. */
export async function makeFamilyLink(
  ctx: AppContext,
  guardianId: string,
  childName: string,
): Promise<{ link: Link; token: string }> {
  const guardian = await ctx.db
    .selectFrom('users')
    .select(['kind', 'birth_date', 'time_zone', 'age_minor_until'])
    .where('id', '=', guardianId)
    .executeTakeFirstOrThrow();
  // A parent or guardian is an adult with an account of their own, never a guest or a child.
  if (guardian.kind !== 'human' || minorOf(guardian, ctx.now()))
    throw forbidden(tr('Only an adult adds a child to Caime.'));
  await assertAgeChecked(ctx, guardianId, 'guardian');
  const now = ctx.now();
  const token = newToken('fam');
  return ctx.db.transaction().execute(async (trx) => {
    // Counted under the parent's own row, so two links made at once can't pass the limit.
    await trx.selectFrom('users').select('id').where('id', '=', guardianId).forUpdate().execute();
    const children = await trx
      .selectFrom('guardianships')
      .select((eb) => eb.fn.countAll<string>().as('n'))
      .where('guardian_id', '=', guardianId)
      .where('ended_at', 'is', null)
      .executeTakeFirstOrThrow();
    const links = await trx
      .selectFrom('family_links')
      .select((eb) => eb.fn.countAll<string>().as('n'))
      .where('guardian_id', '=', guardianId)
      .where('revoked_at', 'is', null)
      .where('spent_by', 'is', null)
      .where('expires_at', '>', now)
      .executeTakeFirstOrThrow();
    const held = Number(children.n) + Number(links.n);
    if (held >= CHILDREN_MAX)
      throw new AppError(
        409,
        'limit',
        tr('A parent adds up to {max} children on Caime.', { max: CHILDREN_MAX }),
      );
    const link = await trx
      .insertInto('family_links')
      .values({
        id: uuidv7(),
        guardian_id: guardianId,
        token_hash: hashToken(token),
        child_name: childName.trim(),
        created_at: now,
        expires_at: new Date(now.getTime() + FAMILY_LINK_DAYS * 86_400_000),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    ctx.metrics.family.inc({ step: 'link' });
    return { link, token };
  });
}

/** A parent's links still open: not taken back, not used, not run out. */
export async function openFamilyLinks(ctx: AppContext, guardianId: string): Promise<Link[]> {
  return ctx.db
    .selectFrom('family_links')
    .selectAll()
    .where('guardian_id', '=', guardianId)
    .where('revoked_at', 'is', null)
    .where('spent_by', 'is', null)
    .where('expires_at', '>', ctx.now())
    .orderBy('created_at', 'desc')
    .execute();
}

/** Taken back: it opens nothing from now on. False when it wasn't theirs or open. */
export async function revokeFamilyLink(
  ctx: AppContext,
  guardianId: string,
  id: string,
): Promise<boolean> {
  const r = await ctx.db
    .updateTable('family_links')
    .set({ revoked_at: ctx.now() })
    .where('id', '=', id)
    .where('guardian_id', '=', guardianId)
    .where('revoked_at', 'is', null)
    .where('spent_by', 'is', null)
    .executeTakeFirst();
  return Number(r.numUpdatedRows) > 0;
}

/**
 * An open link by its token, with its parent's name: the parent still here and not suspended.
 * Null for anything else, which every caller answers as a link that isn't one.
 */
export async function liveFamilyLink(
  db: Db,
  token: string,
  now: Date,
): Promise<(Link & { guardian_name: string }) | null> {
  if (!FAMILY_TOKEN.test(token)) return null;
  const row = await db
    .selectFrom('family_links as l')
    .innerJoin('users as u', 'u.id', 'l.guardian_id')
    .selectAll('l')
    .select('u.display_name as guardian_name')
    .where('l.token_hash', '=', hashToken(token))
    .where('l.revoked_at', 'is', null)
    .where('l.spent_by', 'is', null)
    .where('l.expires_at', '>', now)
    .where('u.deleted_at', 'is', null)
    .where('u.suspended_at', 'is', null)
    .executeTakeFirst();
  return row ?? null;
}

/**
 * In sign-up's transaction: the link spent by the child it was for, and the guardianship asked
 * of the parent. Throws as a link that isn't one when another sign-up spent it first.
 */
export async function attachChild(
  trx: Transaction<Database>,
  link: Pick<Link, 'id' | 'guardian_id'>,
  childId: string,
  now: Date,
): Promise<void> {
  const spent = await trx
    .updateTable('family_links')
    .set({ spent_by: childId, spent_at: now })
    .where('id', '=', link.id)
    .where('spent_by', 'is', null)
    .where('revoked_at', 'is', null)
    .executeTakeFirst();
  if (Number(spent.numUpdatedRows) !== 1) throw familyLinkGone();
  await trx
    .insertInto('guardianships')
    .values({
      id: uuidv7(),
      child_id: childId,
      guardian_id: link.guardian_id,
      link_id: link.id,
      asked_at: now,
    })
    .execute();
}

export const familyLinkGone = () => notFound(tr('That family link'));

/** The parent's turn after a child signed up through their link: told, to agree or say no. */
export async function tellGuardianAsked(
  ctx: AppContext,
  guardianId: string,
  childId: string,
  childName: string,
): Promise<void> {
  await notify(ctx, {
    userId: guardianId,
    kind: 'family',
    level: 'attention',
    title: () => tr('{name} joined Caime through your family link', { name: childName }),
    body: () => tr('Agree to their account, or say it isn’t your child’s.'),
    // Opens Settings · Family, where it's answered.
    data: { family: childId },
  });
  await ctx.bus.publish([guardianId], { type: 'family.changed', data: {} });
}

/**
 * The parent agrees on the child's own account: the consent kept, the two connected (the
 * parent's own label says "Child"; the child labels the parent themselves), and the child's
 * app told it may go on.
 */
export async function consentFor(
  ctx: AppContext,
  guardianId: string,
  childId: string,
): Promise<void> {
  const now = ctx.now();
  const guardian = await ctx.db
    .selectFrom('users')
    .select(['age_check'])
    .where('id', '=', guardianId)
    .executeTakeFirstOrThrow();
  let conversationId = '';
  await ctx.db.transaction().execute(async (trx) => {
    const row = await trx
      .selectFrom('guardianships')
      .select(['id'])
      .where('child_id', '=', childId)
      .where('guardian_id', '=', guardianId)
      .where('ended_at', 'is', null)
      .where('consented_at', 'is', null)
      .forUpdate()
      .executeTakeFirst();
    if (!row) throw notFound(tr('That child'));
    await trx
      .updateTable('guardianships')
      .set({
        consented_at: now,
        consent_version: CONSENT_VERSION,
        method: guardian.age_check ? 'account_age_checked' : 'account',
      })
      .where('id', '=', row.id)
      .execute();
    const formed = await formConnection(trx, guardianId, childId);
    conversationId = formed.conversationId;
    const { connectionId } = formed;
    await createRelationship(
      trx,
      ctx,
      guardianId,
      childId,
      { sphere: 'family', role: 'child' },
      { source: 'user', connectionId },
    );
  });
  await audit(ctx.db, { actorId: guardianId, action: 'family.consented', target: childId });
  ctx.metrics.family.inc({ step: 'agreed' });
  await ctx.bus.publish([childId], { type: 'me.updated', data: {} });
  await ctx.bus.publish([guardianId], { type: 'family.changed', data: {} });
  await notify(ctx, {
    userId: childId,
    kind: 'family',
    level: 'attention',
    title: () => tr('You’re on Caime'),
    body: () => tr('Your parent agreed. Say hello.'),
    data: { conversationId },
  });
}

/**
 * The guardianship ended by the parent: "not my child" before agreeing, or the consent withdrawn
 * after; either way the child's account is deleted, as anyone's is (lib/account-deletion.ts).
 */
export async function endByGuardian(
  ctx: AppContext,
  guardianId: string,
  childId: string,
  why: 'not_mine' | 'withdrawn',
): Promise<void> {
  const r = await ctx.db
    .updateTable('guardianships')
    .set({ ended_at: ctx.now(), ended_why: why })
    .where('child_id', '=', childId)
    .where('guardian_id', '=', guardianId)
    .where('ended_at', 'is', null)
    .where((eb) =>
      why === 'not_mine' ? eb('consented_at', 'is', null) : eb('consented_at', 'is not', null),
    )
    .executeTakeFirst();
  if (Number(r.numUpdatedRows) !== 1) throw notFound(tr('That child'));
  await audit(ctx.db, {
    actorId: guardianId,
    action: why === 'not_mine' ? 'family.refused' : 'family.withdrawn',
    target: childId,
  });
  ctx.metrics.family.inc({ step: why });
  await deleteAccount(ctx, childId);
  await ctx.bus.publish([guardianId], { type: 'family.changed', data: {} });
}

/** The daily sweep: an account its parent never agreed to within `CONSENT_DAYS` is deleted. */
export async function lapseUnanswered(ctx: AppContext): Promise<number> {
  const due = await ctx.db
    .updateTable('guardianships')
    .set({ ended_at: ctx.now(), ended_why: 'lapsed' })
    .where('ended_at', 'is', null)
    .where('consented_at', 'is', null)
    .where('asked_at', '<', new Date(ctx.now().getTime() - CONSENT_DAYS * 86_400_000))
    .returning(['child_id', 'guardian_id'])
    .execute();
  for (const g of due) {
    ctx.metrics.family.inc({ step: 'lapsed' });
    await deleteAccount(ctx, g.child_id);
    if (g.guardian_id) await ctx.bus.publish([g.guardian_id], { type: 'family.changed', data: {} });
  }
  return due.length;
}

/**
 * The signed-in person's own view, saying whether their account waits for their parent (R122):
 * from the request's own session where it says (`waiting`), else asked.
 */
export async function meViewFor(
  ctx: AppContext,
  user: UserRow,
  waiting?: boolean,
): Promise<MeView> {
  const view = meView(user, ctx.now(), ctx.config);
  const waits = waiting ?? (await waitsForConsent(ctx.db, user.id));
  return waits ? { ...view, waitsForParent: true } : view;
}

/** Whether this account waits for its parent to agree (the auth plugin limits it while it does). */
export async function waitsForConsent(db: Db, userId: string): Promise<boolean> {
  const row = await db
    .selectFrom('guardianships')
    .select('id')
    .where('child_id', '=', userId)
    .where('ended_at', 'is', null)
    .where('consented_at', 'is', null)
    .executeTakeFirst();
  return Boolean(row);
}

/**
 * Whose supervision someone is under now: their parent's, while a consented guardianship holds
 * and they're under the age where they live (the law's minimum there, else 18), and the parent's
 * own account is here and not suspended. Null otherwise.
 */
export async function supervisorOf(
  db: Db,
  userId: string,
  now: Date,
  opts: { asked?: boolean } = {},
): Promise<string | null> {
  const row = await db
    .selectFrom('guardianships as g')
    .innerJoin('users as u', 'u.id', 'g.child_id')
    // A parent whose account is gone or suspended looks after nobody here; the child keeps every
    // rule for someone under 18 (R29).
    .innerJoin('users as p', 'p.id', 'g.guardian_id')
    .select(['g.guardian_id', 'u.birth_date', 'u.time_zone', 'u.country'])
    .where('g.child_id', '=', userId)
    .where('g.ended_at', 'is', null)
    // A request routed to a parent counts one not yet agreed to as well (`asked`).
    .$if(!opts.asked, (q) => q.where('g.consented_at', 'is not', null))
    .where('p.deleted_at', 'is', null)
    .where('p.suspended_at', 'is', null)
    .executeTakeFirst();
  if (!row?.guardian_id || !row.birth_date) return null;
  const until = countryFacts(row.country).minimumAge ?? ADULT_AGE;
  return ageOn(row.birth_date, now, row.time_zone) < until ? row.guardian_id : null;
}

// --- Requests a parent says yes to -----------------------------------------------------------

type RequestRow = {
  id: string;
  from_user: string;
  to_user: string;
  note: string | null;
  context_sphere: string | null;
  context_org_name: string | null;
};

/**
 * Whose yes a request between two people waits on, in order: the asker's parent while they look
 * after the asker, then the one asked's (two children of different parents need both; siblings,
 * one). A parent is never asked about themselves. After `answered` said yes, the next one, or
 * null once nobody's yes is still owed.
 */
export async function guardianToAsk(
  db: Db,
  from: string,
  to: string,
  now: Date,
  answered?: string,
): Promise<string | null> {
  const [a, b] = await Promise.all([
    supervisorOf(db, from, now, { asked: true }),
    supervisorOf(db, to, now, { asked: true }),
  ]);
  const order = [
    ...new Set([a !== to ? a : null, b !== from ? b : null].filter(Boolean)),
  ] as string[];
  if (!answered) return order[0] ?? null;
  const at = order.indexOf(answered);
  return at < 0 ? (order[0] ?? null) : (order[at + 1] ?? null);
}

/** The parent is asked: their child wants to connect with someone, or someone with their child. */
export async function tellGuardianRequest(
  ctx: AppContext,
  guardianId: string,
  r: RequestRow,
): Promise<void> {
  const [childId, otherId] =
    (await supervisorOf(ctx.db, r.from_user, ctx.now(), { asked: true })) === guardianId
      ? [r.from_user, r.to_user]
      : [r.to_user, r.from_user];
  const names = await ctx.db
    .selectFrom('users')
    .select(['id', 'display_name'])
    .where('id', 'in', [childId, otherId])
    .execute();
  const child = names.find((n) => n.id === childId)?.display_name ?? '';
  const other = names.find((n) => n.id === otherId)?.display_name ?? '';
  await notify(ctx, {
    userId: guardianId,
    kind: 'family',
    level: 'attention',
    title: () =>
      childId === r.from_user
        ? tr('{child} wants to connect with {name}', { child, name: other })
        : tr('{name} wants to connect with {child}', { child, name: other }),
    body: () => tr('It waits for your yes.'),
    data: { family: childId, requestId: r.id },
  });
  await ctx.bus.publish([guardianId], { type: 'family.changed', data: {} });
}

/**
 * A request the parent answers. Yes passes it on (to the other child's parent where there is one,
 * else to the one asked, told as any request is); no declines it, and the child is told, as they
 * see what their parent sees. The one who asked, if not the child, is told nothing, as with any
 * request declined.
 */
export async function answerGuardianRequest(
  ctx: AppContext,
  guardianId: string,
  requestId: string,
  yes: boolean,
): Promise<void> {
  const now = ctx.now();
  const r = await ctx.db
    .selectFrom('connection_requests')
    .select(['id', 'from_user', 'to_user', 'note', 'context_sphere', 'context_org_name'])
    .where('id', '=', requestId)
    .where('waits_on_guardian', '=', guardianId)
    .where('status', '=', 'pending')
    .executeTakeFirst();
  if (!r) throw notFound(tr('That request'));
  const next = yes ? await guardianToAsk(ctx.db, r.from_user, r.to_user, now, guardianId) : null;
  const moved = await ctx.db
    .updateTable('connection_requests')
    .set(
      yes
        ? { waits_on_guardian: next }
        : { status: 'declined', responded_at: now, waits_on_guardian: null },
    )
    .where('id', '=', requestId)
    .where('waits_on_guardian', '=', guardianId)
    .where('status', '=', 'pending')
    .executeTakeFirst();
  // Answered twice at once: the first answer stands.
  if (Number(moved.numUpdatedRows) !== 1) throw notFound(tr('That request'));
  await audit(ctx.db, {
    actorId: guardianId,
    action: yes ? 'family.request_allowed' : 'family.request_declined',
    target: requestId,
  });
  await ctx.bus.publish([guardianId], { type: 'family.changed', data: {} });
  const childId =
    (await supervisorOf(ctx.db, r.from_user, now, { asked: true })) === guardianId
      ? r.from_user
      : r.to_user;
  if (!yes) {
    const other = await ctx.db
      .selectFrom('users')
      .select('display_name')
      .where('id', '=', childId === r.from_user ? r.to_user : r.from_user)
      .executeTakeFirst();
    await notify(ctx, {
      userId: childId,
      kind: 'family',
      level: 'activity',
      title: () =>
        tr('Your parent said no to connecting with {name}', { name: other?.display_name ?? '' }),
      body: null,
      data: { family: guardianId },
    });
    await ctx.bus.publish([r.from_user], {
      type: 'connection.request.resolved',
      data: { requestId },
    });
    return;
  }
  if (next) return tellGuardianRequest(ctx, next, r);
  const from = await ctx.db
    .selectFrom('users')
    .select('display_name')
    .where('id', '=', r.from_user)
    .executeTakeFirstOrThrow();
  await tellRequested(ctx, r, from.display_name);
}

/**
 * The daily sweep's second part: a request still waiting on a parent who no longer looks after
 * either side (the child reached the age where they live, the parent's account suspended) goes on
 * as if they'd said yes, to the next parent owed or to the one asked.
 */
export async function releaseUnsupervised(ctx: AppContext): Promise<number> {
  const now = ctx.now();
  const waiting = await ctx.db
    .selectFrom('connection_requests')
    .select([
      'id',
      'from_user',
      'to_user',
      'note',
      'context_sphere',
      'context_org_name',
      'waits_on_guardian',
    ])
    .where('status', '=', 'pending')
    .where('waits_on_guardian', 'is not', null)
    .orderBy('created_at')
    .limit(500)
    .execute();
  let released = 0;
  for (const r of waiting) {
    const owed = await guardianToAsk(ctx.db, r.from_user, r.to_user, now);
    if (owed === r.waits_on_guardian) continue;
    await ctx.db
      .updateTable('connection_requests')
      .set({ waits_on_guardian: owed })
      .where('id', '=', r.id)
      .where('waits_on_guardian', '=', r.waits_on_guardian)
      .execute();
    released++;
    if (owed) await tellGuardianRequest(ctx, owed, r);
    else {
      const from = await ctx.db
        .selectFrom('users')
        .select('display_name')
        .where('id', '=', r.from_user)
        .executeTakeFirstOrThrow();
      await tellRequested(ctx, r, from.display_name);
    }
  }
  return released;
}
