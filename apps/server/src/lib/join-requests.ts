/**
 * Ask to join (M16 C3h, review 2026-10-17 §1 H5's optional half, R97 (3)): a join link may ask
 * its place's owner or admins to let each person in, rather than letting in whoever opens it. A
 * request is one person's ask through one link, pending until someone who runs the place accepts
 * or declines it, or the person takes it back; a declined one isn't asked again through that link
 * (a new link may), and decided ones are swept with spent links.
 *
 * Under 18 (R29): an open link lets strangers in, so a place with one takes nobody under 18; a link
 * that asks puts every newcomer through an adult who runs the place, so it may stand where someone
 * under 18 is, and someone under 18 may ask through one where the place is run for them by someone
 * they may trust: its organization is verified, or its owner is an adult they're connected with
 * (R98 (3), as `minorMayWriteToOrg` and the invite rule decide). Whoever answers is an adult person
 * who runs it. A refusal reads the same whatever its reason.
 */
import type { JoinRequestView } from '@caime/core';
import { JOIN_LINK_ROOM, MANAGING_ROLES, uuidv7 } from '@caime/core';
import { tr } from '@caime/core/i18n';
import type { Kysely, Transaction } from 'kysely';
import type { AppContext } from '../context';
import type { Database } from '../db/schema';
import { eachLimit } from './batch';
import { forbidden, notFound } from './errors';
import { type JoinTarget, linksNotHere, roleIn, runs } from './join-links';
import { notify } from './notify';
import { personViewsFor } from './people-batch';
import { between } from './relations';
import { minorOf } from './users';

type Q = Kysely<Database> | Transaction<Database>;

const column = (t: JoinTarget): 'conversation_id' | 'space_id' =>
  t.kind === 'group' ? 'conversation_id' : 'space_id';

/** The place's owner now (a group's or a space's), if anyone is. */
async function ownerOf(db: Q, t: JoinTarget): Promise<string | null> {
  const row =
    t.kind === 'group'
      ? await db
          .selectFrom('participants')
          .select('user_id')
          .where('conversation_id', '=', t.id)
          .where('role', '=', 'owner')
          .where('left_at', 'is', null)
          .executeTakeFirst()
      : await db
          .selectFrom('space_members')
          .select('user_id')
          .where('space_id', '=', t.id)
          .where('role', '=', 'owner')
          .where('left_at', 'is', null)
          .executeTakeFirst();
  return row?.user_id ?? null;
}

/** Whether someone under 18 may ask to join this place (R98 (3)). */
export async function minorMayAsk(
  db: Q,
  t: JoinTarget,
  userId: string,
  now: Date,
): Promise<boolean> {
  if (t.kind === 'space') {
    const org = await db
      .selectFrom('spaces as s')
      .innerJoin('organizations as o', 'o.id', 's.org_id')
      .select('o.verified_at')
      .where('s.id', '=', t.id)
      .where('o.archived_at', 'is', null)
      .executeTakeFirst();
    if (org?.verified_at) return true;
  }
  const owner = await ownerOf(db, t);
  if (!owner || owner === userId) return false;
  const person = await db
    .selectFrom('users')
    .select(['kind', 'birth_date', 'time_zone', 'age_minor_until'])
    .where('id', '=', owner)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
  if (person?.kind !== 'human' || minorOf(person, now)) return false;
  return (await between(db, owner, userId)).connected;
}

/** Whoever runs the place now: its owner and admins. */
async function runnersOf(db: Q, t: JoinTarget): Promise<string[]> {
  const rows =
    t.kind === 'group'
      ? await db
          .selectFrom('participants')
          .select('user_id')
          .where('conversation_id', '=', t.id)
          .where('role', 'in', [...MANAGING_ROLES])
          .where('left_at', 'is', null)
          .execute()
      : await db
          .selectFrom('space_members')
          .select('user_id')
          .where('space_id', '=', t.id)
          .where('role', 'in', [...MANAGING_ROLES])
          .where('left_at', 'is', null)
          .execute();
  return rows.map((r) => r.user_id);
}

/** Where an ask stands for this person and place through this link: pending, declined, or none. */
export async function askedState(
  db: Q,
  t: JoinTarget,
  linkId: string,
  userId: string,
): Promise<'pending' | 'declined' | null> {
  const rows = await db
    .selectFrom('join_requests')
    .select(['link_id', 'outcome'])
    .where(column(t), '=', t.id)
    .where('user_id', '=', userId)
    .where((eb) =>
      eb.or([
        eb('decided_at', 'is', null),
        eb.and([eb('link_id', '=', linkId), eb('outcome', '=', 'declined')]),
      ]),
    )
    .execute();
  if (rows.some((r) => r.outcome === null)) return 'pending';
  return rows.length ? 'declined' : null;
}

/**
 * Their ask through a link that asks, pending until someone who runs the place decides; asking
 * twice is once (`fresh` says whether this one was new), and its owner and admins are told the
 * first time. Declined when it was declined through this link before: not again by it.
 */
export async function askToJoin(
  ctx: AppContext,
  linkId: string,
  t: JoinTarget,
  user: { id: string; displayName: string },
  placeName: string,
): Promise<{ state: 'pending' | 'declined'; fresh: boolean }> {
  const state = await askedState(ctx.db, t, linkId, user.id);
  if (state) return { state, fresh: false };
  const made = await ctx.db
    .insertInto('join_requests')
    .values({
      id: uuidv7(),
      link_id: linkId,
      conversation_id: t.kind === 'group' ? t.id : null,
      space_id: t.kind === 'space' ? t.id : null,
      user_id: user.id,
      created_at: ctx.now(),
    })
    .onConflict((oc) =>
      oc
        .columns([column(t), 'user_id'])
        .where('decided_at', 'is', null)
        .where(column(t), 'is not', null)
        .doNothing(),
    )
    .returning('id')
    .executeTakeFirst();
  if (made) {
    const runners = await runnersOf(ctx.db, t);
    await eachLimit(runners, 4, async (userId) => {
      await notify(ctx, {
        userId,
        kind: 'join_request',
        level: 'attention',
        title: () =>
          tr('{name} asks to join “{place}”', { name: user.displayName, place: placeName }),
        body: () => tr('Let them in, or not, from its people.'),
        data: t.kind === 'group' ? { conversationId: t.id } : { spaceId: t.id },
        groupKey: `join:${t.id}`,
      });
    });
    await ctx.bus.publish(runners, { type: 'join.asked', data: { target: t.kind, id: t.id } });
  }
  return { state: 'pending', fresh: Boolean(made) };
}

/** The asks waiting on the place, oldest first, each with the person as the viewer may see them. */
export async function pendingRequests(
  ctx: AppContext,
  t: JoinTarget,
  viewerId: string,
): Promise<JoinRequestView[]> {
  const rows = await ctx.db
    .selectFrom('join_requests')
    .select(['id', 'user_id', 'created_at'])
    .where(column(t), '=', t.id)
    .where('decided_at', 'is', null)
    .orderBy('created_at', 'asc')
    .limit(JOIN_LINK_ROOM)
    .execute();
  const people = await personViewsFor(
    ctx,
    viewerId,
    rows.map((r) => r.user_id),
    { sharesConversation: false },
  );
  return rows.flatMap((r) => {
    const person = people.get(r.user_id);
    return person ? [{ id: r.id, person, createdAt: r.created_at.toISOString() }] : [];
  });
}

/** The pending ask, for the place; refused as not there for anything else. */
export async function pendingRequest(db: Q, t: JoinTarget, id: string) {
  const row = await db
    .selectFrom('join_requests')
    .selectAll()
    .where('id', '=', id)
    .where(column(t), '=', t.id)
    .where('decided_at', 'is', null)
    .executeTakeFirst();
  if (!row) throw notFound(tr('That ask'));
  return row;
}

/**
 * Accepting, under the place's lock: still pending and the place's, still run by whoever
 * answers, room for one more, and someone under 18 still the kind the place may take (R98 (3)),
 * then marked. Already in it (added meanwhile) counts as accepted.
 */
export async function claimJoinRequest(
  trx: Transaction<Database>,
  t: JoinTarget,
  id: string,
  deciderId: string,
  inIt: string[],
  now: Date,
): Promise<void> {
  const row = await trx
    .selectFrom('join_requests')
    .selectAll()
    .where('id', '=', id)
    .where(column(t), '=', t.id)
    .forUpdate()
    .executeTakeFirst();
  if (!row || row.decided_at) throw notFound(tr('That ask'));
  if (!runs(t, await roleIn(trx, t, deciderId))) throw notFound(tr('That ask'));
  if (!inIt.includes(row.user_id)) {
    if (inIt.length + 1 > JOIN_LINK_ROOM)
      throw forbidden(tr('It’s full: {n} people are in it.', { n: JOIN_LINK_ROOM }));
    const person = await trx
      .selectFrom('users')
      .select(['kind', 'birth_date', 'time_zone', 'age_minor_until'])
      .where('id', '=', row.user_id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    if (person?.kind !== 'human') throw notFound(tr('That ask'));
    if (minorOf(person, now) && !(await minorMayAsk(trx, t, row.user_id, now)))
      throw linksNotHere();
  }
  await trx
    .updateTable('join_requests')
    .set({ decided_at: now, decided_by: deciderId, outcome: 'accepted' })
    .where('id', '=', id)
    .execute();
}

/** Declined by whoever runs it (or taken back by the person): no longer waiting. */
export async function closeJoinRequest(
  db: Q,
  t: JoinTarget,
  id: string,
  by: string,
  outcome: 'declined' | 'withdrawn',
  now: Date,
): Promise<boolean> {
  const done = await db
    .updateTable('join_requests')
    .set({ decided_at: now, decided_by: by, outcome })
    .where('id', '=', id)
    .where(column(t), '=', t.id)
    .where('decided_at', 'is', null)
    .executeTakeFirst();
  return Number(done.numUpdatedRows) > 0;
}
