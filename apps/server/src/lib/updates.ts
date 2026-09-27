/**
 * Organizations' updates (PRD §59): what an organization's team (or its own app) posts to
 * whoever follows it. Public communication, kept apart from personal connections: following is
 * neither a connection nor a conversation, nobody sees who else follows, and the team sees how
 * many do, never who. Everyone but the team reads an update as the organization's.
 */
import type { FollowingView, OrgRef, OrgUpdateView } from '@caishy/core';
import { sql } from 'kysely';
import type { AppContext } from '../context';
import type { Organization, OrgUpdate } from '../db/schema';
import { orgRef } from './business';
import { notify } from './notify';

export function updateView(
  u: Pick<OrgUpdate, 'id' | 'body' | 'created_at' | 'edited_at'>,
  org: OrgRef,
  postedBy: OrgUpdateView['postedBy'] = null,
): OrgUpdateView {
  return {
    id: u.id,
    org,
    body: u.body,
    createdAt: u.created_at.toISOString(),
    editedAt: u.edited_at?.toISOString() ?? null,
    postedBy,
  };
}

/** A notification's line: the start of what it says. */
export const updatePreview = (body: string) =>
  body.length > 140 ? `${body.slice(0, 139).trimEnd()}…` : body;

/** Whoever hears that its updates changed: those who follow it, and its team. */
async function audience(ctx: AppContext, orgId: string): Promise<string[]> {
  const [followers, team] = await Promise.all([
    ctx.db.selectFrom('org_follows').select('user_id').where('org_id', '=', orgId).execute(),
    ctx.db
      .selectFrom('org_members')
      .select('user_id')
      .where('org_id', '=', orgId)
      .where('left_at', 'is', null)
      .execute(),
  ]);
  return [...followers, ...team].map((r) => r.user_id);
}

/**
 * After an update is posted, changed or taken back: every follower's and the team's Updates
 * refresh; a new one is also a notification for each follower who asked to be told (never
 * whoever posted it). Its words go to them only as the organization's.
 */
export async function tellOfUpdate(
  ctx: AppContext,
  org: Organization,
  update: OrgUpdate,
  posted: boolean,
): Promise<void> {
  await ctx.bus.publish(await audience(ctx, org.id), {
    type: 'updates.changed',
    data: { orgId: org.id },
  });
  if (!posted) return;
  const told = await ctx.db
    .selectFrom('org_follows')
    .select('user_id')
    .where('org_id', '=', org.id)
    .where('notify', '=', true)
    .$if(update.posted_by !== null, (qb) => qb.where('user_id', '<>', update.posted_by as string))
    .execute();
  for (const { user_id } of told)
    await notify(ctx, {
      userId: user_id,
      kind: 'update',
      level: 'activity',
      title: org.name,
      body: updatePreview(update.body),
      data: { orgId: org.id, handle: org.handle, updateId: update.id },
      groupKey: `update:${org.id}`,
      delivery: 'push',
    });
}

/** The organizations someone follows, the latest from each first, with what's new since they looked. */
export async function followingOf(ctx: AppContext, userId: string): Promise<FollowingView[]> {
  const rows = await ctx.db
    .selectFrom('org_follows as f')
    .innerJoin('organizations as o', 'o.id', 'f.org_id')
    .selectAll('o')
    .select([
      'f.notify',
      sql<number>`(select count(*) from org_updates u where u.org_id = f.org_id and u.deleted_at is null and u.created_at > f.read_at)::int`.as(
        'unread',
      ),
      sql<
        string | null
      >`(select u.id from org_updates u where u.org_id = f.org_id and u.deleted_at is null order by u.id desc limit 1)`.as(
        'latest_id',
      ),
    ])
    .where('f.user_id', '=', userId)
    .where('o.archived_at', 'is', null)
    .execute();
  const latestIds = rows.flatMap((r) => (r.latest_id ? [r.latest_id] : []));
  const latest = latestIds.length
    ? await ctx.db
        .selectFrom('org_updates')
        .select(['id', 'body', 'created_at', 'edited_at'])
        .where('id', 'in', latestIds)
        .execute()
    : [];
  const byId = new Map(latest.map((u) => [u.id, u]));
  return rows
    .map(({ notify, unread, latest_id, ...org }) => {
      const ref = orgRef(org);
      const u = latest_id ? byId.get(latest_id) : undefined;
      return { org: ref, latest: u ? updateView(u, ref) : null, unread, notify };
    })
    .sort(
      (a, b) =>
        (b.latest?.createdAt ?? '').localeCompare(a.latest?.createdAt ?? '') ||
        a.org.name.localeCompare(b.org.name),
    );
}
