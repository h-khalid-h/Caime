/**
 * Join links (M16 C3e, review 2026-10-17 §1 H5): a group's or a space's owner or admins hand out
 * a link, and whoever opens it is let in, so a group moves over from another app in one message
 * rather than each person being added by someone they're connected with. The token is shown once,
 * when it's made, and kept only as its hash (`/g/<token>`); a link is open until it runs out, is
 * taken back, or its maker stops running the place it leads to.
 *
 * Whoever comes in by a link is a stranger to the people there, as a meeting's guest is, so the
 * under-18 rules (R29) are a guest's: only an adult makes one, none while anyone under 18 is in
 * it, only adults come in by one, and while one is open nobody under 18 is added by any path
 * (`assertNoMinorWhileLinkOpen`, read under the place's lock by every way in). A link that asks
 * (C3h, `lib/join-requests.ts`) lets nobody in by itself: each person is an adult's decision, so
 * it may stand where someone under 18 is, and those rules are its own. A refusal says the same
 * words whatever the reason, so nobody learns who is under 18 or who blocked whom.
 */
import type { JoinLinkOpenView, JoinLinkView } from '@caime/core';
import {
  canAddToGroup,
  canManageSpace,
  JOIN_LINK_DAYS,
  JOIN_LINK_ROOM,
  JOIN_LINKS_OPEN,
  joinLinkFits,
  uuidv7,
} from '@caime/core';
import { tr } from '@caime/core/i18n';
import { type Kysely, type Selectable, sql, type Transaction } from 'kysely';
import type { AppContext } from '../context';
import { type Database, type JoinLinksTable, ORG_COLUMNS } from '../db/schema';
import { orgRef } from './business';
import { hashToken, newToken } from './crypto';
import { badRequest, forbidden, notFound } from './errors';
import { anyMinor } from './users';

type Q = Kysely<Database> | Transaction<Database>;
type Link = Selectable<JoinLinksTable>;

/** A token as the link carries it (`g_` and 43 characters), and nothing else. */
export const JOIN_TOKEN = /^g_[A-Za-z0-9_-]{43}$/;

/** Where a link leads: a group, or a space (its General is where one lands). */
export type JoinTarget = { kind: 'group'; id: string } | { kind: 'space'; id: string };

export const targetOf = (l: Pick<Link, 'conversation_id' | 'space_id'>): JoinTarget =>
  l.conversation_id
    ? { kind: 'group', id: l.conversation_id }
    : { kind: 'space', id: l.space_id as string };

export const joinLinkUrl = (ctx: AppContext, token: string) =>
  `${ctx.config.PUBLIC_URL}/g/${token}`;

export function joinLinkView(l: Link, by: string | null): JoinLinkView {
  return {
    id: l.id,
    uses: l.uses,
    expiresAt: l.expires_at.toISOString(),
    createdAt: l.created_at.toISOString(),
    by,
    approval: l.approval,
  };
}

/** Refused in the same words whatever the reason (R29: never who is under 18). */
export const linksNotHere = () => forbidden(tr('Join links aren’t available here.'));

/** The place under its row lock, so who is in it holds while a link is made or used. */
export async function lockTarget(trx: Transaction<Database>, t: JoinTarget): Promise<void> {
  if (t.kind === 'group')
    await trx.selectFrom('conversations').select('id').where('id', '=', t.id).forUpdate().execute();
  else await trx.selectFrom('spaces').select('id').where('id', '=', t.id).forUpdate().execute();
}

/** Who is in it now. */
export async function peopleIn(db: Q, t: JoinTarget): Promise<string[]> {
  const rows =
    t.kind === 'group'
      ? await db
          .selectFrom('participants')
          .select('user_id')
          .where('conversation_id', '=', t.id)
          .where('left_at', 'is', null)
          .execute()
      : await db
          .selectFrom('space_members')
          .select('user_id')
          .where('space_id', '=', t.id)
          .where('left_at', 'is', null)
          .execute();
  return rows.map((r) => r.user_id);
}

/** Their seat in it now (a group's or a space's role), or null when they aren't in it. */
export async function roleIn(db: Q, t: JoinTarget, userId: string): Promise<string | null> {
  if (t.kind === 'group') {
    const seat = await db
      .selectFrom('participants')
      .select('role')
      .where('conversation_id', '=', t.id)
      .where('user_id', '=', userId)
      .where('left_at', 'is', null)
      .executeTakeFirst();
    return seat?.role ?? null;
  }
  const seat = await db
    .selectFrom('space_members as m')
    .innerJoin('spaces as s', 's.id', 'm.space_id')
    .select('m.role')
    .where('m.space_id', '=', t.id)
    .where('m.user_id', '=', userId)
    .where('m.left_at', 'is', null)
    .where('s.archived_at', 'is', null)
    .executeTakeFirst();
  return seat?.role ?? null;
}

/** Whether a seat runs the place: a group's or a space's owner or admins. */
export const runs = (t: JoinTarget, role: string | null): boolean =>
  t.kind === 'group'
    ? canAddToGroup(role ?? undefined)
    : canManageSpace((role ?? undefined) as 'owner' | 'admin' | 'member' | undefined);

/** Whether this person runs it now. */
export async function runsTarget(db: Q, t: JoinTarget, userId: string): Promise<boolean> {
  return runs(t, await roleIn(db, t, userId));
}

/**
 * Only its owner and admins make, see or take back its links: anyone in it who doesn't run it is
 * told so, and anyone else is answered as if it isn't there.
 */
export async function assertRunsTarget(db: Q, t: JoinTarget, userId: string): Promise<void> {
  const role = await roleIn(db, t, userId);
  if (role === null)
    throw notFound(t.kind === 'group' ? tr('That conversation') : tr('That space'));
  if (!runs(t, role))
    throw forbidden(
      t.kind === 'group'
        ? tr('Only admins can add people.')
        : tr('Only the space’s owner and admins add people.'),
    );
}

/**
 * Whether a group takes a link of its own (core `joinLinkFits`), and never a meeting's space,
 * which holds its guests. A space takes one while it's open.
 */
export async function targetFits(db: Q, t: JoinTarget): Promise<boolean> {
  if (t.kind === 'space') {
    const space = await db
      .selectFrom('spaces')
      .select('id')
      .where('id', '=', t.id)
      .where('archived_at', 'is', null)
      .executeTakeFirst();
    return Boolean(space);
  }
  const c = await db
    .selectFrom('conversations')
    .select(['kind', 'privacy_class', 'parent_id', 'space_id'])
    .where('id', '=', t.id)
    .executeTakeFirst();
  if (
    !c ||
    !joinLinkFits({
      kind: c.kind,
      privacyClass: c.privacy_class,
      parentId: c.parent_id,
      spaceId: c.space_id,
    })
  )
    return false;
  const meeting = await db
    .selectFrom('meeting_spaces')
    .select('message_id')
    .where('conversation_id', '=', t.id)
    .executeTakeFirst();
  return !meeting;
}

/** The column of `join_links` that names a place of this kind. */
const targetColumn = (t: JoinTarget): 'conversation_id' | 'space_id' =>
  t.kind === 'group' ? 'conversation_id' : 'space_id';

/**
 * A new link; the token comes back this once. Under the place's lock: whoever makes it runs it
 * (the route has checked they're an adult), it takes links, fewer than `JOIN_LINKS_OPEN` are
 * open, and, for one that lets people in by itself, nobody under 18 is in it (one that asks may
 * stand where someone is: each person it brings is let in by an adult who runs the place).
 */
export async function makeJoinLink(
  ctx: AppContext,
  t: JoinTarget,
  byUserId: string,
  approval = false,
): Promise<{ link: Link; token: string }> {
  return ctx.db.transaction().execute(async (trx) => {
    await lockTarget(trx, t);
    await assertRunsTarget(trx, t, byUserId);
    if (!(await targetFits(trx, t))) throw linksNotHere();
    if (!approval && (await anyMinor(trx, await peopleIn(trx, t), ctx.now()))) throw linksNotHere();
    const open = await trx
      .selectFrom('join_links')
      .select(sql<number>`count(*)::int`.as('n'))
      .where(targetColumn(t), '=', t.id)
      .where('revoked_at', 'is', null)
      .where('expires_at', '>', ctx.now())
      .executeTakeFirstOrThrow();
    if (open.n >= JOIN_LINKS_OPEN)
      throw badRequest(tr('{n} links are open: take one back first.', { n: JOIN_LINKS_OPEN }));
    const token = newToken('g');
    const link = await trx
      .insertInto('join_links')
      .values({
        id: uuidv7(),
        conversation_id: t.kind === 'group' ? t.id : null,
        space_id: t.kind === 'space' ? t.id : null,
        token_hash: hashToken(token),
        created_by: byUserId,
        expires_at: new Date(ctx.now().getTime() + JOIN_LINK_DAYS * 86_400_000),
        created_at: ctx.now(),
        approval,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return { link, token };
  });
}

/** The place's links still open, newest first, with who made each. */
export async function openJoinLinks(ctx: AppContext, t: JoinTarget): Promise<JoinLinkView[]> {
  const rows = await ctx.db
    .selectFrom('join_links as l')
    .leftJoin('users as u', (j) =>
      j.onRef('u.id', '=', 'l.created_by').on('u.deleted_at', 'is', null),
    )
    .selectAll('l')
    .select('u.display_name as by')
    .where(t.kind === 'group' ? 'l.conversation_id' : 'l.space_id', '=', t.id)
    .where('l.revoked_at', 'is', null)
    .where('l.expires_at', '>', ctx.now())
    .orderBy('l.created_at', 'desc')
    .limit(JOIN_LINKS_OPEN)
    .execute();
  return rows.map((r) => joinLinkView(r, r.by ?? null));
}

/** Taken back: its link opens nothing from now on. */
export async function revokeJoinLink(ctx: AppContext, t: JoinTarget, id: string): Promise<boolean> {
  const done = await ctx.db
    .updateTable('join_links')
    .set({ revoked_at: ctx.now() })
    .where('id', '=', id)
    .where(targetColumn(t), '=', t.id)
    .where('revoked_at', 'is', null)
    .executeTakeFirst();
  return Number(done.numUpdatedRows) > 0;
}

/**
 * The link a token stands for while it's open: not taken back or run out, the place still taking
 * links, and its maker still running it. Null for anything else, so a dead link reads as one.
 */
export async function liveJoinLink(
  ctx: AppContext,
  token: string,
): Promise<{ link: Link; target: JoinTarget } | null> {
  if (!JOIN_TOKEN.test(token)) return null;
  const link = await ctx.db
    .selectFrom('join_links')
    .selectAll()
    .where('token_hash', '=', hashToken(token))
    .where('revoked_at', 'is', null)
    .where('expires_at', '>', ctx.now())
    .executeTakeFirst();
  if (!link?.created_by) return null;
  const target = targetOf(link);
  if (!(await targetFits(ctx.db, target))) return null;
  if (!(await runsTarget(ctx.db, target, link.created_by))) return null;
  return { link, target };
}

/**
 * Taken by someone joining, under the place's lock and the link's row: still open and its
 * maker's, room for one more, and still nobody under 18 in it (R29), then counted.
 */
export async function claimJoinLink(
  trx: Transaction<Database>,
  linkId: string,
  inIt: string[],
  now: Date,
): Promise<void> {
  const link = await trx
    .selectFrom('join_links')
    .selectAll()
    .where('id', '=', linkId)
    .forUpdate()
    .executeTakeFirst();
  if (!link?.created_by || link.revoked_at || link.expires_at <= now)
    throw notFound(tr('That link'));
  if (!(await runsTarget(trx, targetOf(link), link.created_by))) throw notFound(tr('That link'));
  if (inIt.length + 1 > JOIN_LINK_ROOM)
    throw forbidden(tr('It’s full: {n} people are in it.', { n: JOIN_LINK_ROOM }));
  if (await anyMinor(trx, inIt, now)) throw linksNotHere();
  await trx
    .updateTable('join_links')
    .set((eb) => ({ uses: eb('uses', '+', 1) }))
    .where('id', '=', linkId)
    .execute();
}

/**
 * Whether a link may not let this person in, for a block: either way with whoever made it or
 * owns the place, or by anyone in it (their wish is theirs to keep). One sentence for every case.
 */
export async function blockedFromJoining(
  db: Q,
  link: Pick<Link, 'created_by'>,
  t: JoinTarget,
  userId: string,
): Promise<boolean> {
  const owner =
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
  const heads = [link.created_by, owner?.user_id].filter((x): x is string => Boolean(x));
  // Never empty: the link's maker runs the place, so it holds them at least.
  const blockers = [...new Set([...(await peopleIn(db, t)), ...heads])];
  if (!blockers.length) return false;
  const row = await db
    .selectFrom('blocks')
    .select('blocker_id')
    .where((eb) =>
      eb.or([
        // Anyone in it, or whoever made the link or owns it, who blocked them.
        eb.and([eb('blocked_id', '=', userId), eb('blocker_id', 'in', blockers)]),
        // Whoever made the link or owns the place, whom they blocked.
        ...(heads.length
          ? [eb.and([eb('blocker_id', '=', userId), eb('blocked_id', 'in', heads)])]
          : []),
      ]),
    )
    .executeTakeFirst();
  return Boolean(row);
}

/**
 * Under 18 (R29): while a link that lets people in by itself is open, it lets strangers in, so
 * nobody under 18 is added to the place by any path (a link that asks lets nobody in by itself).
 * Read under the place's lock by the group and space add paths.
 */
export async function assertNoMinorWhileLinkOpen(
  db: Q,
  t: JoinTarget,
  joining: string[],
  now: Date,
): Promise<void> {
  if (!joining.length) return;
  const open = await db
    .selectFrom('join_links')
    .select('id')
    .where(targetColumn(t), '=', t.id)
    .where('approval', '=', false)
    .where('revoked_at', 'is', null)
    .where('expires_at', '>', now)
    .executeTakeFirst();
  if (open && (await anyMinor(db, joining, now)))
    throw forbidden(tr('They can’t join while a link to it is open.'));
}

/**
 * What a live link leads to, as whoever opens it may read it (the signed-in open route and the
 * visitor's page alike): the place's name, what it's for and its kind, how many are in it, the
 * organization a space is its own, and who made the link. Never who is in it.
 */
export async function joinLinkOpening(
  ctx: AppContext,
  live: { link: Link; target: JoinTarget },
): Promise<Omit<JoinLinkOpenView, 'member' | 'asked'> & { people: string[] }> {
  const { link, target } = live;
  const people = await peopleIn(ctx.db, target);
  const inviter = await ctx.db
    .selectFrom('users')
    .select('display_name')
    .where('id', '=', link.created_by as string)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
  const place: {
    name: string;
    purpose: string | null;
    kind: string | null;
    org_id: string | null;
  } =
    target.kind === 'group'
      ? await ctx.db
          .selectFrom('conversations')
          .select(['title', 'purpose'])
          .where('id', '=', target.id)
          .executeTakeFirstOrThrow()
          .then((c) => ({ name: c.title ?? '', purpose: c.purpose, kind: null, org_id: null }))
      : await ctx.db
          .selectFrom('spaces')
          .select(['name', 'purpose', 'kind', 'org_id'])
          .where('id', '=', target.id)
          .executeTakeFirstOrThrow();
  const org = place.org_id
    ? await ctx.db
        .selectFrom('organizations')
        .select(ORG_COLUMNS)
        .where('id', '=', place.org_id)
        .where('archived_at', 'is', null)
        .executeTakeFirst()
    : undefined;
  return {
    target: target.kind,
    name: place.name,
    purpose: place.purpose,
    spaceKind: target.kind === 'space' ? place.kind : null,
    memberCount: people.length,
    org: org ? orgRef(org) : null,
    invitedBy: inviter?.display_name ?? null,
    expiresAt: link.expires_at.toISOString(),
    approval: link.approval,
    people,
  };
}
