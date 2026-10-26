/**
 * Moderate (R122 (2), M16 B8d), who it holds for and the parent asked; what their answer does is
 * lib/family-moderate.ts (apart, so the ways in that ask import nothing of what they carry out).
 * a parent who looks after their child may also say yes to every new
 * way in, both ways: an invitation into a group or a space, an ask to join one through a link, a
 * message request the child would take, an organization the child starts writing to. Never a
 * message's words. Each waits on the parent as a request to connect does (`guardian_asks`), in
 * Family with Agree and Decline; agreed, it's done as the child would have done it, declined it's
 * let go, and the child is told either way. It holds only while the parent looks after them
 * (`supervisorOf`) with Moderate on: once they're of age where they live, the parent's account is
 * gone, or Moderate is turned off, whatever waits goes on as if agreed (`releaseModerated`).
 */
import { ADULT_AGE, ageOn, tr, uuidv7 } from '@caime/core';
import type { FamilyModerateAskView } from '@caime/core/api';
import { countryFacts } from '@caime/core/countries';
import type { Kysely, Transaction } from 'kysely';
import type { AppContext } from '../context';
import type { Database } from '../db/schema';
import { AppError } from './errors';
import { supervisorOf } from './family';
import { liveJoinLinkById, nameOf } from './join-links';
import { notify } from './notify';
import { personViewsFor } from './people-batch';

type Db = Kysely<Database> | Transaction<Database>;

export type GuardianAskWhat =
  | { kind: 'invite'; inviteId: string }
  | { kind: 'join'; linkId: string }
  | { kind: 'request'; conversationId: string }
  | { kind: 'organization'; orgId: string };

/** What a child meets where their parent says yes first: the same words whatever it was. */
export const guardianAsked = () =>
  new AppError(
    403,
    'guardian_asked',
    tr('Your parent or guardian says yes to this first. We asked them.'),
  );

/** The parent who moderates this person now: looks after them, with Moderate on. Else null. */
export async function moderatorOf(db: Db, userId: string, now: Date): Promise<string | null> {
  const g = await db
    .selectFrom('guardianships')
    .select('guardian_id')
    .where('child_id', '=', userId)
    .where('ended_at', 'is', null)
    .where('consented_at', 'is not', null)
    .where('moderates', '=', true)
    .executeTakeFirst();
  if (!g?.guardian_id) return null;
  return (await supervisorOf(db, userId, now)) === g.guardian_id ? g.guardian_id : null;
}

/** Of these people, those a parent moderates now: one query, for a whole set being added. */
export async function moderatedAmong(db: Db, ids: string[], now: Date): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const rows = await db
    .selectFrom('guardianships as g')
    .innerJoin('users as u', 'u.id', 'g.child_id')
    .innerJoin('users as p', 'p.id', 'g.guardian_id')
    .select(['g.child_id', 'u.birth_date', 'u.time_zone', 'u.country'])
    .where('g.child_id', 'in', ids)
    .where('g.ended_at', 'is', null)
    .where('g.consented_at', 'is not', null)
    .where('g.moderates', '=', true)
    .where('p.deleted_at', 'is', null)
    .where('p.suspended_at', 'is', null)
    .execute();
  // Looked after until the age where they live, as `supervisorOf` reads it.
  return new Set(
    rows
      .filter(
        (r) =>
          r.birth_date &&
          ageOn(r.birth_date, now, r.time_zone) < (countryFacts(r.country).minimumAge ?? ADULT_AGE),
      )
      .map((r) => r.child_id),
  );
}

/** What an ask is about, in the words the parent and the child read. */
export async function describe(
  db: Db,
  childId: string,
  what: GuardianAskWhat,
  now: Date,
): Promise<{ child: string; place: string | null; who: string | null; org: string | null }> {
  const child = await db
    .selectFrom('users')
    .select('display_name')
    .where('id', '=', childId)
    .executeTakeFirstOrThrow();
  const base = { child: child.display_name, place: null, who: null, org: null };
  if (what.kind === 'invite') {
    const row = await db
      .selectFrom('place_invites as i')
      .leftJoin('conversations as c', 'c.id', 'i.conversation_id')
      .leftJoin('spaces as s', 's.id', 'i.space_id')
      .leftJoin('users as u', 'u.id', 'i.invited_by')
      .select(['c.title', 's.name', 'u.display_name'])
      .where('i.id', '=', what.inviteId)
      .executeTakeFirst();
    return { ...base, place: row?.title ?? row?.name ?? null, who: row?.display_name ?? null };
  }
  if (what.kind === 'join') {
    const live = await liveJoinLinkById(db, what.linkId, now);
    return { ...base, place: live ? await nameOf(db, live.target) : null };
  }
  if (what.kind === 'request') {
    const sender = await db
      .selectFrom('participants as p')
      .innerJoin('users as u', 'u.id', 'p.user_id')
      .select('u.display_name')
      .where('p.conversation_id', '=', what.conversationId)
      .where('p.user_id', '<>', childId)
      .executeTakeFirst();
    return { ...base, who: sender?.display_name ?? null };
  }
  const org = await db
    .selectFrom('organizations')
    .select('name')
    .where('id', '=', what.orgId)
    .executeTakeFirst();
  return { ...base, org: org?.name ?? null };
}

/**
 * The parent asked, and told: their child would come into a place, take a message request, or
 * write to an organization. Asked once while it waits (asking again tells nobody again).
 */
export async function askGuardian(
  ctx: AppContext,
  guardianId: string,
  childId: string,
  what: GuardianAskWhat,
): Promise<void> {
  const inserted = await ctx.db
    .insertInto('guardian_asks')
    .values({
      id: uuidv7(),
      guardian_id: guardianId,
      child_id: childId,
      kind: what.kind,
      place_invite_id: what.kind === 'invite' ? what.inviteId : null,
      join_link_id: what.kind === 'join' ? what.linkId : null,
      conversation_id: what.kind === 'request' ? what.conversationId : null,
      org_id: what.kind === 'organization' ? what.orgId : null,
      created_at: ctx.now(),
    })
    .returning('id')
    .executeTakeFirst()
    .catch((err: { code?: string }) => {
      // One open ask a child and a thing (the partial unique index): asked already.
      if (err.code === '23505') return undefined;
      throw err;
    });
  if (!inserted) return;
  const d = await describe(ctx.db, childId, what, ctx.now());
  ctx.metrics.family.inc({ step: 'moderate_asked' });
  await notify(ctx, {
    userId: guardianId,
    kind: 'family',
    level: 'attention',
    title: () =>
      what.kind === 'invite'
        ? tr('{child} was invited to “{place}”', { child: d.child, place: d.place ?? '' })
        : what.kind === 'join'
          ? tr('{child} asks to join “{place}”', { child: d.child, place: d.place ?? '' })
          : what.kind === 'request'
            ? tr('{name} wrote to {child}', { child: d.child, name: d.who ?? '' })
            : tr('{child} wants to write to {org}', { child: d.child, org: d.org ?? '' }),
    body: () => tr('It waits for your yes, in Family.'),
    data: { family: childId },
  });
  await ctx.bus.publish([guardianId, childId], { type: 'family.changed', data: {} });
}

/**
 * For a child looking at a message request (R122 (2)): whether taking it asks their parent
 * (`ask`), or asked them already (`asked`). Null where nobody moderates them.
 */
export async function parentSaysOn(
  ctx: AppContext,
  childId: string,
  conversationId: string,
): Promise<'ask' | 'asked' | null> {
  if (!(await moderatorOf(ctx.db, childId, ctx.now()))) return null;
  const open = await ctx.db
    .selectFrom('guardian_asks')
    .select('id')
    .where('child_id', '=', childId)
    .where('kind', '=', 'request')
    .where('conversation_id', '=', conversationId)
    .where('answered_at', 'is', null)
    .executeTakeFirst();
  return open ? 'asked' : 'ask';
}

/** Whether a child's ask through this link waits on their parent (R122 (2)). */
export async function parentAskedToJoin(db: Db, childId: string, linkId: string): Promise<boolean> {
  const open = await db
    .selectFrom('guardian_asks')
    .select('id')
    .where('child_id', '=', childId)
    .where('kind', '=', 'join')
    .where('join_link_id', '=', linkId)
    .where('answered_at', 'is', null)
    .executeTakeFirst();
  return Boolean(open);
}

/** The child let it go themselves (a request declined, an invitation turned down): nothing waits. */
export async function withdrawGuardianAsk(
  ctx: AppContext,
  childId: string,
  what: GuardianAskWhat,
): Promise<void> {
  const gone = await ctx.db
    .deleteFrom('guardian_asks')
    .where('child_id', '=', childId)
    .where('answered_at', 'is', null)
    .where('kind', '=', what.kind)
    .where(
      what.kind === 'invite'
        ? 'place_invite_id'
        : what.kind === 'join'
          ? 'join_link_id'
          : what.kind === 'request'
            ? 'conversation_id'
            : 'org_id',
      '=',
      what.kind === 'invite'
        ? what.inviteId
        : what.kind === 'join'
          ? what.linkId
          : what.kind === 'request'
            ? what.conversationId
            : what.orgId,
    )
    .returning('guardian_id')
    .executeTakeFirst();
  if (gone)
    await ctx.bus.publish([gone.guardian_id, childId], { type: 'family.changed', data: {} });
}

/**
 * What waits on a parent's yes, oldest first: the parent's own list (`guardianId`), or what a
 * child's parent was asked for them (`childId`). Who and where, as the viewer may see them; never
 * a message's words.
 */
export async function guardianAskViews(
  ctx: AppContext,
  viewerId: string,
  who: { guardianId: string } | { childId: string },
): Promise<FamilyModerateAskView[]> {
  const rows = await ctx.db
    .selectFrom('guardian_asks as a')
    .leftJoin('place_invites as i', 'i.id', 'a.place_invite_id')
    .leftJoin('conversations as ic', 'ic.id', 'i.conversation_id')
    .leftJoin('spaces as isp', 'isp.id', 'i.space_id')
    .leftJoin('join_links as l', 'l.id', 'a.join_link_id')
    .leftJoin('conversations as lc', 'lc.id', 'l.conversation_id')
    .leftJoin('spaces as lsp', 'lsp.id', 'l.space_id')
    .leftJoin('organizations as o', 'o.id', 'a.org_id')
    .select([
      'a.id',
      'a.kind',
      'a.child_id',
      'a.conversation_id',
      'a.created_at',
      'i.invited_by',
      'ic.title as invite_group',
      'isp.name as invite_space',
      'lc.title as link_group',
      'lsp.name as link_space',
      'o.name as org_name',
      'o.handle as org_handle',
    ])
    .where('a.answered_at', 'is', null)
    .$if('guardianId' in who, (q) =>
      q.where('a.guardian_id', '=', 'guardianId' in who ? who.guardianId : ''),
    )
    .$if('childId' in who, (q) => q.where('a.child_id', '=', 'childId' in who ? who.childId : ''))
    .orderBy('a.created_at')
    .limit(100)
    .execute();
  if (!rows.length) return [];
  // Who wrote, for a message request: whoever else is in it, one query for the set.
  const asked = rows.flatMap((r) => (r.kind === 'request' && r.conversation_id ? [r] : []));
  const writers = asked.length
    ? await ctx.db
        .selectFrom('participants')
        .select(['conversation_id', 'user_id'])
        .where(
          'conversation_id',
          'in',
          asked.map((r) => r.conversation_id ?? ''),
        )
        .where('left_at', 'is', null)
        .execute()
    : [];
  const writerOf = (r: (typeof rows)[number]) =>
    writers.find((w) => w.conversation_id === r.conversation_id && w.user_id !== r.child_id)
      ?.user_id ?? null;
  const personOf = (r: (typeof rows)[number]) =>
    r.kind === 'invite' ? r.invited_by : r.kind === 'request' ? writerOf(r) : null;
  const people = await personViewsFor(
    ctx,
    viewerId,
    [...rows.map((r) => r.child_id), ...rows.flatMap((r) => personOf(r) ?? [])],
    { sharesConversation: false },
  );
  return rows.flatMap((r) => {
    const child = r.child_id === viewerId ? null : (people.get(r.child_id) ?? null);
    if (!child && r.child_id !== viewerId) return [];
    const person = personOf(r);
    return [
      {
        id: r.id,
        kind: r.kind,
        child,
        person: person ? (people.get(person) ?? null) : null,
        place: r.invite_group ?? r.invite_space ?? r.link_group ?? r.link_space ?? null,
        org: r.org_name && r.org_handle ? { name: r.org_name, handle: r.org_handle } : null,
        createdAt: r.created_at.toISOString(),
      },
    ];
  });
}

/**
 * The parent turns Moderate on or off for a child they look after; turned off, whatever waited on
 * them goes on (`releaseModerated`, called by the route). The child is told either way.
 */
export async function setModerates(
  ctx: AppContext,
  guardianId: string,
  childId: string,
  moderates: boolean,
): Promise<boolean> {
  const changed = await ctx.db
    .updateTable('guardianships')
    .set({ moderates })
    .where('guardian_id', '=', guardianId)
    .where('child_id', '=', childId)
    .where('ended_at', 'is', null)
    .where('consented_at', 'is not', null)
    .where('moderates', '<>', moderates)
    .executeTakeFirst();
  if (Number(changed.numUpdatedRows) !== 1) return false;
  await ctx.bus.publish([guardianId, childId], { type: 'family.changed', data: {} });
  await notify(ctx, {
    userId: childId,
    kind: 'family',
    level: 'activity',
    title: () =>
      moderates
        ? tr('Your parent says yes to new groups, spaces and people writing to you first')
        : tr('Your parent no longer says yes to new groups, spaces and people first'),
    body: null,
    data: { family: guardianId },
  });
  return true;
}
