/**
 * Organizations' updates (PRD §59): what an organization's team (or its own app) posts to
 * whoever follows it. Public communication, kept apart from personal connections: following is
 * neither a connection nor a conversation, nobody sees who else follows, and the team sees how
 * many do, never who. Everyone but the team reads an update as the organization's.
 */
import type { FollowingView, OrgRef, OrgUpdateView } from '@caime/core';
import { previewText } from '@caime/core';
import { sql } from 'kysely';
import type { AppContext } from '../context';
import type { OrgUpdate } from '../db/schema';
import { orgRef } from './business';
import { enqueue, registerJob } from './jobs';
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
export const updatePreview = (body: string) => previewText(body, 140);

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

/** After an update is posted, changed or taken back: every follower's and the team's Updates refresh. */
export async function tellUpdatesChanged(ctx: AppContext, orgId: string): Promise<void> {
  await ctx.bus.publish(await audience(ctx, orgId), {
    type: 'updates.changed',
    data: { orgId },
  });
}

const FANOUT = 'updates.fanout';
/** Followers told per step of the job. */
const BATCH = 200;

/**
 * A new update: each follower who asked is told (never whoever posted it), as the organization.
 * A job does it, one batch at a time from where the last stopped, so a restart or one follower's
 * failure loses nobody else. Each batch reads the update again (taken back, it stops; changed, it
 * says what it says now) and who still follows and asks to be told, without having blocked it;
 * anyone already told isn't told again.
 */
export async function announceUpdate(ctx: AppContext, updateId: string): Promise<void> {
  await enqueue(ctx, FANOUT, { updateId }, { dedupeKey: `${FANOUT}:${updateId}` });
}

async function fanOut(ctx: AppContext, p: Record<string, unknown>): Promise<void> {
  const updateId = String(p.updateId);
  const after = typeof p.after === 'string' ? p.after : null;
  const u = await ctx.db
    .selectFrom('org_updates as u')
    .innerJoin('organizations as o', 'o.id', 'u.org_id')
    .select([
      'u.body',
      'u.posted_by',
      'u.created_at',
      'u.deleted_at',
      'o.id',
      'o.name',
      'o.handle',
      'o.archived_at',
    ])
    .where('u.id', '=', updateId)
    .executeTakeFirst();
  if (!u || u.deleted_at || u.archived_at) return;
  const told = await ctx.db
    .selectFrom('org_follows as f')
    .select('f.user_id')
    .where('f.org_id', '=', u.id)
    .where('f.notify', '=', true)
    // Those who followed it before it was posted: to anyone later it isn't news.
    .where('f.created_at', '<', u.created_at)
    .$if(after !== null, (qb) => qb.where('f.user_id', '>', after as string))
    .$if(u.posted_by !== null, (qb) => qb.where('f.user_id', '<>', u.posted_by as string))
    .where(({ exists, not, selectFrom }) =>
      not(
        exists(
          selectFrom('org_blocks as b')
            .select('b.user_id')
            .whereRef('b.user_id', '=', 'f.user_id')
            .whereRef('b.org_id', '=', 'f.org_id'),
        ),
      ),
    )
    .where(({ exists, not, selectFrom }) =>
      not(
        exists(
          selectFrom('notifications as n')
            .select('n.id')
            .whereRef('n.user_id', '=', 'f.user_id')
            .where('n.kind', '=', 'update')
            .where(sql<string>`n.data->>'updateId'`, '=', updateId),
        ),
      ),
    )
    .orderBy('f.user_id')
    .limit(BATCH)
    .execute();
  for (const { user_id } of told) {
    try {
      await notify(ctx, {
        userId: user_id,
        kind: 'update',
        level: 'activity',
        title: u.name,
        body: updatePreview(u.body),
        data: { orgId: u.id, handle: u.handle, updateId },
        groupKey: `update:${u.id}`,
        delivery: 'push',
      });
    } catch (err) {
      // Told already (this step ran twice at once): once is enough.
      if ((err as { code?: string }).code === '23505') continue;
      // Gone meanwhile (their account deleted, say): everyone after them still hears.
      ctx.log.warn({ err, updateId }, 'an update’s notification failed');
    }
  }
  const last = told.at(-1)?.user_id;
  if (told.length === BATCH && last)
    await enqueue(
      ctx,
      FANOUT,
      { updateId, after: last },
      { dedupeKey: `${FANOUT}:${updateId}:${last}` },
    );
}

/**
 * What followers were told of an update, brought into line with it: changed, their notification
 * says what it says now; taken back, it goes. Their lists refresh.
 */
export async function retellUpdate(
  ctx: AppContext,
  updateId: string,
  body: string | null,
): Promise<void> {
  const byUpdate = sql<string>`data->>'updateId'`;
  const rows = body
    ? await ctx.db
        .updateTable('notifications')
        .set({ body: updatePreview(body) })
        .where('kind', '=', 'update')
        .where(byUpdate, '=', updateId)
        .returning(['id', 'user_id'])
        .execute()
    : await ctx.db
        .deleteFrom('notifications')
        .where('kind', '=', 'update')
        .where(byUpdate, '=', updateId)
        .returning(['id', 'user_id'])
        .execute();
  const byUser = new Map<string, string[]>();
  for (const r of rows) byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), r.id]);
  for (const [userId, ids] of byUser)
    await ctx.bus.publish([userId], { type: 'notifications.read', data: { ids, all: false } });
}

/** Read on its page: its updates aren't new any more, and neither are their notifications. */
export async function readUpdates(ctx: AppContext, userId: string, orgId: string): Promise<void> {
  const done = await ctx.db
    .updateTable('org_follows')
    .set({ read_at: ctx.now() })
    .where('user_id', '=', userId)
    .where('org_id', '=', orgId)
    .returning('org_id')
    .executeTakeFirst();
  const read = await ctx.db
    .updateTable('notifications')
    .set({ read_at: ctx.now() })
    .where('user_id', '=', userId)
    .where('group_key', '=', `update:${orgId}`)
    .where('read_at', 'is', null)
    .returning('id')
    .execute();
  if (read.length)
    await ctx.bus.publish([userId], {
      type: 'notifications.read',
      data: { ids: read.map((r) => r.id), all: false },
    });
  if (done || read.length)
    await ctx.bus.publish([userId], { type: 'updates.changed', data: { orgId } });
}

/** An organization that closed: nobody follows it any more, and their Updates say so. */
export async function endFollowsOf(ctx: AppContext, orgId: string): Promise<void> {
  const ended = await ctx.db
    .deleteFrom('org_follows')
    .where('org_id', '=', orgId)
    .returning('user_id')
    .execute();
  if (ended.length)
    await ctx.bus.publish(
      ended.map((r) => r.user_id),
      { type: 'updates.changed', data: { orgId } },
    );
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
    // Blocking ends following; this holds even if the two ever crossed.
    .where(({ exists, not, selectFrom }) =>
      not(
        exists(
          selectFrom('org_blocks as b')
            .select('b.user_id')
            .whereRef('b.user_id', '=', 'f.user_id')
            .whereRef('b.org_id', '=', 'f.org_id'),
        ),
      ),
    )
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

export function registerUpdateJobs(): void {
  registerJob(FANOUT, fanOut);
}
