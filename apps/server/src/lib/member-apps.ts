/**
 * An organization's say over its members' own apps (M16 G3, review 2026-10-17 §8 H4). Unless its
 * owner or admins let them in (`organizations.member_apps`), a token acting as someone on its
 * team who doesn't run it (a personal token, a bridge, an app they let in) doesn't reach its
 * conversations: the team's side of its customer threads, its spaces' conversations, and a thread
 * where they write as its customer (R64). Their own conversations, and their side as anyone's
 * customer, stay theirs; its owner and admins are those who decide, so their own apps are their
 * choice. The conversation and action routes refuse such a request (`org_apps_closed`); the inbox,
 * search and the actions list leave those conversations out of what a token reads, and their own
 * calendars (the feed, the plans written to a connected one) show their cards and actions as the
 * organization and the time (G3b). A session in Caime's own app is never asked: the rule is about
 * what leaves through someone's own apps.
 */
import { tr } from '@caime/core/i18n';
import { MANAGING_ROLES } from '@caime/core/permissions';
import { type RawBuilder, sql } from 'kysely';
import type { AppContext, Auth } from '../context';
import { AppError } from './errors';

type Ctx = Pick<AppContext, 'db'>;

/**
 * The organizations that keep their conversations from this person's own apps: those on whose
 * team they are without running it, closed to their apps. One query, by the person's own seats.
 */
async function closedOrgsOf(ctx: Ctx, userId: string): Promise<string[]> {
  const rows = await ctx.db
    .selectFrom('org_members as m')
    .innerJoin('organizations as o', 'o.id', 'm.org_id')
    .select('o.id')
    .where('m.user_id', '=', userId)
    .where('m.left_at', 'is', null)
    .where('m.role', 'not in', [...MANAGING_ROLES])
    .where('o.member_apps', '=', false)
    .execute();
  return rows.map((r) => r.id);
}

/**
 * The organizations whose conversations this request may not reach: none for a session in
 * Caime's own app, else those that keep theirs from the person's own apps.
 */
export async function orgsClosedToApps(
  ctx: Ctx,
  auth: Pick<Auth, 'userId' | 'grant'>,
): Promise<string[]> {
  return auth.grant ? closedOrgsOf(ctx, auth.userId) : [];
}

/**
 * Of these conversations, those an organization keeps from this person's own apps, with its name
 * (M16 G3b). A calendar of theirs that Caime writes to or that reads their feed is one of their
 * apps: what it shows of such a conversation's cards and actions is the organization and the time,
 * never who or what. Two queries at most, one when they're on no team that keeps them.
 */
export async function keptFromApps(
  ctx: Ctx,
  userId: string,
  conversationIds: ReadonlyArray<string | null>,
): Promise<Map<string, string>> {
  const ids = [...new Set(conversationIds.filter((c): c is string => Boolean(c)))];
  if (ids.length === 0) return new Map();
  const orgs = await closedOrgsOf(ctx, userId);
  if (orgs.length === 0) return new Map();
  const { rows } = await sql<{ id: string; name: string }>`
    select cx.id, ox.name
    from conversations cx
    join organizations ox on ox.id = any(${orgs}::uuid[])
    where cx.id = any(${ids}::uuid[])
      and (
        (cx.kind = 'business' and cx.org_id = ox.id
          and not exists (
            select 1 from business_threads bx
            where bx.conversation_id = cx.id and bx.customer_id = ${userId}
          ))
        or cx.space_id in (select sx.id from spaces sx where sx.org_id = ox.id)
        or exists (
          select 1 from business_threads bx
          where bx.conversation_id = cx.id and bx.customer_id = ${userId}
            and bx.customer_org_id = ox.id
        )
      )`.execute(ctx.db);
  return new Map(rows.map((r) => [r.id, r.name]));
}

/** Whether a conversation (an id, or a column holding one) belongs to one of `orgs` for them. */
export const closedIn = (
  userId: string,
  orgs: readonly string[],
  conversation: string | RawBuilder<unknown>,
): RawBuilder<boolean> => sql<boolean>`(
  exists (
    select 1 from conversations cx
    where cx.id = ${conversation}
      and (
        (cx.kind = 'business' and cx.org_id = any(${orgs}::uuid[])
          and not exists (
            select 1 from business_threads bx
            where bx.conversation_id = cx.id and bx.customer_id = ${userId}
          ))
        or cx.space_id in (select sx.id from spaces sx where sx.org_id = any(${orgs}::uuid[]))
      )
  )
  or exists (
    select 1 from business_threads bx
    where bx.conversation_id = ${conversation} and bx.customer_id = ${userId}
      and bx.customer_org_id = any(${orgs}::uuid[])
  )
)`;

/** What a list a token reads keeps: conversations none of `orgs` keeps from it. */
export const openIn = (
  userId: string,
  orgs: readonly string[],
  conversation: RawBuilder<unknown>,
): RawBuilder<boolean> => sql<boolean>`not ${closedIn(userId, orgs, conversation)}`;

const refusal = () =>
  new AppError(
    403,
    'org_apps_closed',
    tr('This organization keeps its conversations from its members’ own apps.'),
  );

/** What a token's list of actions keeps: those of no conversation, or of one open to it. */
export const actionOpenIn = (userId: string, orgs: readonly string[]): RawBuilder<boolean> =>
  sql<boolean>`(tasks.conversation_id is null or ${openIn(
    userId,
    orgs,
    sql.ref('tasks.conversation_id'),
  )})`;

/**
 * A token's request for a conversation an organization keeps from it is refused. One the person
 * isn't in is left to the route's own answer, so the refusal says nothing of a conversation they
 * couldn't open anyway, unless it's `known` to them already (an action of theirs from it).
 */
export async function assertOpenToApps(
  ctx: Ctx,
  auth: Pick<Auth, 'userId' | 'grant'>,
  conversationId: string,
  opts: { known?: boolean } = {},
): Promise<void> {
  const orgs = await orgsClosedToApps(ctx, auth);
  if (orgs.length === 0) return;
  const inIt = opts.known
    ? sql<boolean>`true`
    : sql<boolean>`exists (
        select 1 from participants pz
        where pz.conversation_id = ${conversationId} and pz.user_id = ${auth.userId}
          and pz.left_at is null
      )`;
  const { rows } = await sql<{ closed: boolean }>`select (
    ${inIt} and ${closedIn(auth.userId, orgs, conversationId)}
  ) as closed`.execute(ctx.db);
  if (rows[0]?.closed) throw refusal();
}
