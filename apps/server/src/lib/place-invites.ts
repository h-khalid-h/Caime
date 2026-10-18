/**
 * Asked before being added (M16 B4, review 2026-10-17 §2 M, R97 (3)): an owner or admin who adds
 * people to a group or a space puts in directly only those who let their connections add them
 * (`privacy.groupAdds`, `connections` by default) and, under 18 (R29), only where everyone else
 * there is someone they're connected with; anyone else is invited, and comes in only by saying yes.
 * Someone who blocked the one adding them, or was blocked by them, is neither: the adder reads them
 * as invited, and nothing reaches them (blocking is silent, PRD §55).
 *
 * An invitation shows nothing of the place but its name, its kind, how many are in it and who
 * asked (as a join link's page does), lasts `PLACE_INVITE_DAYS`, and is open only while its
 * inviter still runs the place. Accepting goes through `addToGroup` or `addToSpace`, with the
 * invitation claimed under the place's lock as the vouch; declining tells nobody.
 */
import type { PlaceInvitationView } from '@caime/core';
import { MANAGING_ROLES, PLACE_INVITE_DAYS, uuidv7 } from '@caime/core';
import { tr } from '@caime/core/i18n';
import { type Kysely, sql, type Transaction } from 'kysely';
import type { AppContext } from '../context';
import type { Database } from '../db/schema';
import { eachLimit } from './batch';
import { forbidden, notFound } from './errors';
import { addToGroup } from './group-members';
import { assertNoMinorWhileLinkOpen, type JoinTarget, peopleIn, roleIn, runs } from './join-links';
import { assertNoMinorWithGuests } from './meeting-guests';
import { notify } from './notify';
import { personViewsFor } from './people-batch';
import { addToSpace } from './space-members';
import { minorOf, privacyOf } from './users';

type Q = Kysely<Database> | Transaction<Database>;

const column = (t: JoinTarget): 'conversation_id' | 'space_id' =>
  t.kind === 'group' ? 'conversation_id' : 'space_id';

/** Who of those about to be put in a place is asked instead, and who of those is told nothing. */
export interface Asked {
  ask: Set<string>;
  /** Blocked either way with the one adding them: answered as invited, never invited. */
  silent: Set<string>;
}

/**
 * Of the people about to be put in a place (`t`, or null for one being made, which holds only its
 * maker so far), those to be asked first: whoever's setting says so, anyone under 18 where someone
 * else there or coming with them isn't their connection, and, silently, anyone blocked either way
 * with the adder. Those already in it are nobody's to ask.
 */
export async function whoMustBeAsked(
  db: Q,
  t: JoinTarget | null,
  candidates: string[],
  adderId: string,
  now: Date,
): Promise<Asked> {
  const inIt = new Set(t ? await peopleIn(db, t) : []);
  const ids = [...new Set(candidates)].filter((id) => id !== adderId && !inIt.has(id));
  const asked: Asked = { ask: new Set(), silent: new Set() };
  if (ids.length === 0) return asked;
  const [users, blocked] = await Promise.all([
    db
      .selectFrom('users')
      .select(['id', 'privacy', 'birth_date', 'time_zone'])
      .where('id', 'in', ids)
      .execute(),
    db
      .selectFrom('blocks')
      .select(['blocker_id', 'blocked_id'])
      .where((eb) =>
        eb.or([
          eb.and([eb('blocker_id', '=', adderId), eb('blocked_id', 'in', ids)]),
          eb.and([eb('blocker_id', 'in', ids), eb('blocked_id', '=', adderId)]),
        ]),
      )
      .execute(),
  ]);
  for (const b of blocked) {
    const other = b.blocker_id === adderId ? b.blocked_id : b.blocker_id;
    asked.ask.add(other);
    asked.silent.add(other);
  }
  const minors: string[] = [];
  for (const u of users) {
    if (asked.ask.has(u.id)) continue;
    if (privacyOf(u, now).groupAdds === 'ask') asked.ask.add(u.id);
    else if (minorOf(u, now)) minors.push(u.id);
  }
  if (minors.length === 0) return asked;
  // Under 18, put in only among people they know: everyone there, the adder, and whoever comes
  // in with them.
  const there = [...new Set([...inIt, adderId, ...ids])];
  const known = await db
    .selectFrom('connection_sides as s')
    .innerJoin('connections as c', 'c.id', 's.connection_id')
    .select(['s.owner_id', 's.other_id'])
    .where('s.owner_id', 'in', minors)
    .where('s.other_id', 'in', there)
    .where('c.status', '=', 'active')
    .execute();
  for (const minor of minors) {
    const theirs = new Set(known.filter((k) => k.owner_id === minor).map((k) => k.other_id));
    if (there.some((p) => p !== minor && !theirs.has(p))) asked.ask.add(minor);
  }
  return asked;
}

/**
 * Where nobody under 18 comes in by any way (a conversation that holds a meeting's guests, a place
 * with an open link that lets people in by itself), anyone under 18 among those being added is
 * refused as the way in would refuse them, before anyone is asked: never an invitation they could
 * never accept. The way in reads the same under the place's lock.
 */
export async function assertNoMinorWhereNoneMay(
  db: Q,
  t: JoinTarget,
  userIds: string[],
  now: Date,
): Promise<void> {
  const inIt = new Set(await peopleIn(db, t));
  const coming = [...new Set(userIds)].filter((id) => !inIt.has(id));
  if (coming.length === 0) return;
  if (t.kind === 'group') await assertNoMinorWithGuests(db, t.id, coming, now);
  await assertNoMinorWhileLinkOpen(db, t, coming, now);
}

/** The place's name as an invitation says it: a group's title, or a space's name. */
async function placeNameOf(db: Q, t: JoinTarget): Promise<string> {
  const row =
    t.kind === 'group'
      ? await db
          .selectFrom('conversations')
          .select('title as name')
          .where('id', '=', t.id)
          .executeTakeFirst()
      : await db.selectFrom('spaces').select('name').where('id', '=', t.id).executeTakeFirst();
  return row?.name ?? '';
}

/**
 * Invites each of them, from someone who runs the place (asking twice is once; one run out is
 * asked afresh), and tells each the first time. Answers who was newly invited.
 */
export async function invitePeople(
  ctx: AppContext,
  t: JoinTarget,
  userIds: string[],
  inviterId: string,
): Promise<string[]> {
  if (userIds.length === 0) return [];
  const now = ctx.now();
  const expires = new Date(now.getTime() + PLACE_INVITE_DAYS * 86_400_000);
  const made = await ctx.db
    .insertInto('place_invites')
    .values(
      userIds.map((userId) => ({
        id: uuidv7(),
        conversation_id: t.kind === 'group' ? t.id : null,
        space_id: t.kind === 'space' ? t.id : null,
        user_id: userId,
        invited_by: inviterId,
        created_at: now,
        expires_at: expires,
      })),
    )
    .onConflict((oc) =>
      oc
        .columns([column(t), 'user_id'])
        .where('decided_at', 'is', null)
        .where(column(t), 'is not', null)
        .doUpdateSet({ invited_by: inviterId, created_at: now, expires_at: expires })
        // Still open, it stands as it is: nobody is told twice.
        .where('place_invites.expires_at', '<=', now),
    )
    .returning(['id', 'user_id'])
    .execute();
  if (made.length === 0) return [];
  const [place, inviter] = await Promise.all([
    placeNameOf(ctx.db, t),
    ctx.db
      .selectFrom('users')
      .select('display_name')
      .where('id', '=', inviterId)
      .executeTakeFirstOrThrow(),
  ]);
  await eachLimit(made, 4, (row) =>
    notify(ctx, {
      userId: row.user_id,
      kind: 'place_invite',
      level: 'attention',
      title: () => tr('{name} invited you to “{place}”', { name: inviter.display_name, place }),
      body: () => tr('Join it, or not, from Attention.'),
      data: { invitation: row.id },
      groupKey: `invite:${t.id}`,
    }).then(() => undefined),
  );
  await ctx.bus.publish(
    made.map((r) => r.user_id),
    { type: 'invites.changed', data: {} },
  );
  return made.map((r) => r.user_id);
}

/**
 * Someone's open invitations, newest first: still pending, not run out, and from someone who still
 * runs the place (an invitation dies with its inviter's seat, as a join link does).
 */
export async function placeInvitationsFor(
  ctx: AppContext,
  userId: string,
): Promise<PlaceInvitationView[]> {
  const now = ctx.now();
  const rows = await ctx.db
    .selectFrom('place_invites as i')
    .leftJoin('conversations as c', 'c.id', 'i.conversation_id')
    .leftJoin('spaces as s', 's.id', 'i.space_id')
    .leftJoin('participants as p', (j) =>
      j
        .onRef('p.conversation_id', '=', 'i.conversation_id')
        .onRef('p.user_id', '=', 'i.invited_by')
        .on('p.left_at', 'is', null),
    )
    .leftJoin('space_members as m', (j) =>
      j
        .onRef('m.space_id', '=', 'i.space_id')
        .onRef('m.user_id', '=', 'i.invited_by')
        .on('m.left_at', 'is', null),
    )
    .select([
      'i.id',
      'i.conversation_id',
      'i.space_id',
      'i.invited_by',
      'i.created_at',
      'i.expires_at',
      'c.title',
      's.name',
    ])
    .where('i.user_id', '=', userId)
    .where('i.decided_at', 'is', null)
    .where('i.expires_at', '>', now)
    .where((eb) =>
      eb.or([
        eb('p.role', 'in', [...MANAGING_ROLES]),
        eb.and([eb('m.role', 'in', [...MANAGING_ROLES]), eb('s.archived_at', 'is', null)]),
      ]),
    )
    .orderBy('i.created_at', 'desc')
    .limit(50)
    .execute();
  if (rows.length === 0) return [];
  const groupIds = rows.flatMap((r) => (r.conversation_id ? [r.conversation_id] : []));
  const spaceIds = rows.flatMap((r) => (r.space_id ? [r.space_id] : []));
  const [groupCounts, spaceCounts, people] = await Promise.all([
    groupIds.length
      ? ctx.db
          .selectFrom('participants')
          .select(['conversation_id as id', sql<number>`count(*)::int`.as('n')])
          .where('conversation_id', 'in', groupIds)
          .where('left_at', 'is', null)
          .groupBy('conversation_id')
          .execute()
      : [],
    spaceIds.length
      ? ctx.db
          .selectFrom('space_members')
          .select(['space_id as id', sql<number>`count(*)::int`.as('n')])
          .where('space_id', 'in', spaceIds)
          .where('left_at', 'is', null)
          .groupBy('space_id')
          .execute()
      : [],
    personViewsFor(
      ctx,
      userId,
      rows.flatMap((r) => (r.invited_by ? [r.invited_by] : [])),
    ),
  ]);
  const counts = new Map([...groupCounts, ...spaceCounts].map((c) => [c.id, c.n]));
  return rows.map((r) => {
    const placeId = (r.conversation_id ?? r.space_id) as string;
    return {
      id: r.id,
      kind: r.conversation_id ? 'group' : 'space',
      placeId,
      name: (r.conversation_id ? r.title : r.name) ?? '',
      people: counts.get(placeId) ?? 0,
      by: (r.invited_by && people.get(r.invited_by)) || null,
      createdAt: r.created_at.toISOString(),
      expiresAt: r.expires_at.toISOString(),
    };
  });
}

/** Refused in one way whatever the reason: run out, answered, or its inviter gone. */
const notOpen = () => notFound(tr('That invitation'));

/**
 * The person's answer. Declined, it's done and nobody is told. Accepted, they come in through the
 * place's one way in, the invitation claimed under its lock and its inviter still running it;
 * answers where they landed.
 */
export async function answerPlaceInvite(
  ctx: AppContext,
  userId: string,
  inviteId: string,
  accept: boolean,
): Promise<JoinTarget | null> {
  const row = await ctx.db
    .selectFrom('place_invites')
    .select(['id', 'conversation_id', 'space_id', 'invited_by'])
    .where('id', '=', inviteId)
    .where('user_id', '=', userId)
    .where('decided_at', 'is', null)
    .where('expires_at', '>', ctx.now())
    .executeTakeFirst();
  if (!row) throw notOpen();
  const t: JoinTarget = row.conversation_id
    ? { kind: 'group', id: row.conversation_id }
    : { kind: 'space', id: row.space_id as string };
  if (!accept) {
    await ctx.db
      .updateTable('place_invites')
      .set({ decided_at: ctx.now(), outcome: 'declined' })
      .where('id', '=', inviteId)
      .where('decided_at', 'is', null)
      .execute();
    await ctx.bus.publish([userId], { type: 'invites.changed', data: {} });
    return null;
  }
  const vouch = async (trx: Transaction<Database>) => {
    const claimed = await trx
      .updateTable('place_invites')
      .set({ decided_at: ctx.now(), outcome: 'accepted' })
      .where('id', '=', inviteId)
      .where('decided_at', 'is', null)
      .returning('invited_by')
      .executeTakeFirst();
    if (!claimed?.invited_by) throw notOpen();
    if (!runs(t, await roleIn(trx, t, claimed.invited_by)))
      throw forbidden(tr('That invitation isn’t open any more.'));
  };
  const by = row.invited_by ?? userId;
  if (t.kind === 'group')
    await addToGroup(ctx, t.id, [userId], { actorId: by, vouch, joined: true });
  else await addToSpace(ctx, t.id, [userId], by, 'member', { vouch, joined: true });
  await ctx.bus.publish([userId], { type: 'invites.changed', data: {} });
  return t;
}
