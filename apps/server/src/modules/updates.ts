/**
 * Organizations' updates (PRD §59): an organization posts, and whoever follows it reads them in
 * Updates, apart from their conversations (lib/updates.ts). Anyone signed in can read an
 * organization's updates on its page, as they can the page; following is a choice of their own
 * that nobody else sees, and ends when they block it.
 */
import type { OrgUpdatesView, OrgUpdateView } from '@caime/core';
import { canManageOrg, EditUpdateBody, FollowOrgBody, PostUpdateBody, uuidv7 } from '@caime/core';
import type {
  FollowingResponse,
  FollowResponse,
  OkResponse,
  OrgUpdateResponse,
} from '@caime/core/api';
import { tr } from '@caime/core/i18n';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { sql } from 'kysely';
import { z } from 'zod';
import type { AppContext } from '../context';
import type { OrgUpdate } from '../db/schema';
import { audit } from '../lib/audit';
import { orgBlocked } from '../lib/blocks';
import { orgRef } from '../lib/business';
import { AppError, forbidden, notFound } from '../lib/errors';
import { takeBackUpdate } from '../lib/moderation';
import { orgById, orgSeat } from '../lib/orgs';
import { personViewsFor } from '../lib/people-batch';
import {
  announceUpdate,
  followingOf,
  readUpdates,
  retellUpdate,
  tellUpdatesChanged,
  updateView,
} from '../lib/updates';
import { parse } from '../lib/validate';
import { requireAuth } from '../plugins/auth';

export async function updateRoutes(app: FastifyInstance, ctx: AppContext) {
  const idParam = z.object({ id: z.string().uuid() });
  const updateParam = z.object({ id: z.string().uuid(), updateId: z.string().uuid() });

  /** Who posts for it: its owner and admins, or its own app (with "updates"). */
  async function poster(req: FastifyRequest, orgId: string): Promise<string> {
    const auth = requireAuth(req);
    if (auth.app) {
      if (auth.app.orgId !== orgId) throw notFound(tr('That organization'));
      return auth.userId;
    }
    const seat = await orgSeat(ctx.db, auth.userId, orgId);
    if (!seat || !canManageOrg(seat.role))
      throw forbidden(tr('Only the organization’s owner and admins post its updates.'));
    return auth.userId;
  }

  /** Whoever just posted or changed one, as they see themselves (a bot says it's automated). */
  async function postedByOf(userId: string): Promise<OrgUpdateView['postedBy']> {
    const u = await ctx.db
      .selectFrom('users')
      .select(['display_name', 'kind'])
      .where('id', '=', userId)
      .executeTakeFirst();
    return u ? { id: userId, displayName: u.display_name, automated: u.kind !== 'human' } : null;
  }

  /**
   * Changing and taking back reach every follower too, so they're limited like posting (each
   * organization's own allowance, shared by its team and its apps).
   */
  const limitChanges = (orgId: string) =>
    ctx.limiter.hit(`org-update-changes:${orgId}`, ctx.config.isTest ? 1000 : 60, 3_600_000);

  app.get('/orgs/:id/updates', async (req): Promise<OrgUpdatesView> => {
    const auth = requireAuth(req);
    const { id } = parse(idParam, req.params);
    const { before, limit } = parse(
      z.object({
        before: z.string().uuid().optional(),
        limit: z.coerce.number().int().min(1).max(50).default(20),
      }),
      req.query,
    );
    if (auth.app && auth.app.orgId !== id) throw notFound(tr('That organization'));
    const org = await orgById(ctx.db, id);
    const seat = auth.app ? null : await orgSeat(ctx.db, auth.userId, id);
    const team = Boolean(seat) || Boolean(auth.app);
    const rows = await ctx.db
      .selectFrom('org_updates')
      .select(['id', 'body', 'created_at', 'edited_at', 'posted_by'])
      .where('org_id', '=', id)
      .where('deleted_at', 'is', null)
      .$if(Boolean(before), (qb) => qb.where('id', '<', before as string))
      .orderBy('id', 'desc')
      .limit(limit + 1)
      .execute();
    const page = rows.slice(0, limit);
    // Only the team (and its own apps) see who posted each one: as each is shown to the viewer,
    // the viewer as themselves, and an app's bot marked as automated (R16).
    const ids = [...new Set(page.flatMap((u) => (u.posted_by ? [u.posted_by] : [])))];
    const posters = new Map<string, NonNullable<OrgUpdateView['postedBy']>>();
    if (team && ids.length) {
      for (const [id, p] of await personViewsFor(ctx, auth.userId, ids))
        posters.set(id, { id, displayName: p.displayName, automated: p.kind !== 'human' });
      if (ids.includes(auth.userId)) {
        const me = await postedByOf(auth.userId);
        if (me) posters.set(auth.userId, me);
      }
    }
    const ref = orgRef(org);
    const [follow, blockedByMe, followers] = await Promise.all([
      ctx.db
        .selectFrom('org_follows')
        .select('notify')
        .where('user_id', '=', auth.userId)
        .where('org_id', '=', id)
        .executeTakeFirst(),
      auth.app ? Promise.resolve(false) : orgBlocked(ctx.db, auth.userId, id),
      team
        ? ctx.db
            .selectFrom('org_follows')
            .select(sql<number>`count(*)::int`.as('n'))
            .where('org_id', '=', id)
            .executeTakeFirstOrThrow()
            .then((r) => r.n)
        : Promise.resolve(null),
    ]);
    return {
      updates: page.map((u) =>
        updateView(u, ref, (u.posted_by && posters.get(u.posted_by)) || null),
      ),
      nextBefore: rows.length > limit ? (page.at(-1)?.id ?? null) : null,
      following: follow ? { notify: follow.notify } : null,
      followers,
      canPost: Boolean(auth.app) || canManageOrg(seat?.role),
      blockedByMe,
    };
  });

  app.post('/orgs/:id/updates', async (req, reply): Promise<OrgUpdateResponse> => {
    const auth = requireAuth(req);
    const { id } = parse(idParam, req.params);
    const org = await orgById(ctx.db, id);
    const by = await poster(req, id);
    const body = parse(PostUpdateBody, req.body);
    const ref = orgRef(org);
    // Sent again after an answer that never came: it's the same update, posted once.
    const again = async (): Promise<OrgUpdate | undefined> =>
      body.clientId
        ? ctx.db
            .selectFrom('org_updates')
            .selectAll()
            .where('org_id', '=', id)
            .where('client_id', '=', body.clientId)
            .executeTakeFirst()
        : undefined;
    const earlier = await again();
    if (earlier) return { update: updateView(earlier, ref, await postedByOf(by)) };
    ctx.limiter.hit(`org-updates:${id}`, ctx.config.isTest ? 1000 : 30, 3_600_000);
    const row = await ctx.db
      .insertInto('org_updates')
      .values({
        id: uuidv7(),
        org_id: id,
        posted_by: by,
        body: body.body,
        client_id: body.clientId ?? null,
        created_at: ctx.now(),
      })
      .onConflict((oc) =>
        oc.columns(['org_id', 'client_id']).where('client_id', 'is not', null).doNothing(),
      )
      .returningAll()
      .executeTakeFirst();
    if (!row) {
      const raced = await again();
      if (!raced) throw new AppError(409, 'conflict', tr('That update is being posted already.'));
      return { update: updateView(raced, ref, await postedByOf(by)) };
    }
    await audit(ctx.db, {
      actorId: auth.userId,
      action: 'org.update_posted',
      target: id,
      metadata: { updateId: row.id },
    });
    // Told to followers by a job, so a restart loses nobody (lib/updates.ts).
    await announceUpdate(ctx, row.id);
    ctx.defer('updates', () => tellUpdatesChanged(ctx, id));
    reply.status(201);
    return { update: updateView(row, ref, await postedByOf(by)) };
  });

  app.patch('/orgs/:id/updates/:updateId', async (req): Promise<OrgUpdateResponse> => {
    const auth = requireAuth(req);
    const { id, updateId } = parse(updateParam, req.params);
    const org = await orgById(ctx.db, id);
    const by = await poster(req, id);
    const body = parse(EditUpdateBody, req.body);
    const current = await ctx.db
      .selectFrom('org_updates')
      .selectAll()
      .where('id', '=', updateId)
      .where('org_id', '=', id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    if (!current) throw notFound(tr('That update'));
    // Nothing changed: nobody needs to hear of it.
    if (current.body === body.body)
      return { update: updateView(current, orgRef(org), await postedByOf(by)) };
    limitChanges(id);
    const row = await ctx.db
      .updateTable('org_updates')
      .set({ body: body.body, edited_at: ctx.now() })
      .where('id', '=', updateId)
      .where('org_id', '=', id)
      .where('deleted_at', 'is', null)
      .returningAll()
      .executeTakeFirst();
    if (!row) throw notFound(tr('That update'));
    await audit(ctx.db, {
      actorId: auth.userId,
      action: 'org.update_edited',
      target: id,
      metadata: { updateId },
    });
    await retellUpdate(ctx, updateId, row.body);
    ctx.defer('updates', () => tellUpdatesChanged(ctx, id));
    return { update: updateView(row, orgRef(org), await postedByOf(by)) };
  });

  app.delete('/orgs/:id/updates/:updateId', async (req): Promise<OkResponse> => {
    const auth = requireAuth(req);
    const { id, updateId } = parse(updateParam, req.params);
    await orgById(ctx.db, id);
    await poster(req, id);
    limitChanges(id);
    // Taken back: its words go, from its page and from every follower's notifications; that
    // there was one stays, for the audit log (lib/moderation.ts, as the operator does it).
    if (!(await takeBackUpdate(ctx, id, updateId, auth.userId))) throw notFound(tr('That update'));
    return { ok: true };
  });

  /** Follow (or change whether each update is a notification), from its page. */
  app.put('/orgs/:id/follow', async (req): Promise<FollowResponse> => {
    const auth = requireAuth(req);
    const { id } = parse(idParam, req.params);
    const { notify } = parse(FollowOrgBody, req.body ?? {});
    await orgById(ctx.db, id);
    // One at a time with blocking it (modules/business.ts), so the two never cross.
    const row = await ctx.db.transaction().execute(async (trx) => {
      await sql`select pg_advisory_xact_lock(hashtext(${`org-follow:${auth.userId}:${id}`}))`.execute(
        trx,
      );
      if (await orgBlocked(trx, auth.userId, id))
        throw new AppError(
          409,
          'blocked',
          tr('You’ve blocked it. Unblock it to follow its updates.'),
        );
      return trx
        .insertInto('org_follows')
        .values({
          user_id: auth.userId,
          org_id: id,
          notify: notify ?? false,
          read_at: ctx.now(),
          created_at: ctx.now(),
        })
        .onConflict((oc) =>
          oc.columns(['user_id', 'org_id']).doUpdateSet((eb) => ({
            notify: notify === undefined ? eb.ref('org_follows.notify') : notify,
          })),
        )
        .returning('notify')
        .executeTakeFirstOrThrow();
    });
    await ctx.bus.publish([auth.userId], { type: 'updates.changed', data: { orgId: id } });
    return { following: { notify: row.notify } };
  });

  app.delete('/orgs/:id/follow', async (req): Promise<OkResponse> => {
    const auth = requireAuth(req);
    const { id } = parse(idParam, req.params);
    await ctx.db
      .deleteFrom('org_follows')
      .where('user_id', '=', auth.userId)
      .where('org_id', '=', id)
      .execute();
    await ctx.bus.publish([auth.userId], { type: 'updates.changed', data: { orgId: id } });
    return { ok: true };
  });

  /** Seen: what it has posted so far isn't new to them any more, notifications included. */
  app.post('/orgs/:id/updates/read', async (req): Promise<OkResponse> => {
    const auth = requireAuth(req);
    const { id } = parse(idParam, req.params);
    await readUpdates(ctx, auth.userId, id);
    return { ok: true };
  });

  /** Updates: the organizations they follow, newest first. */
  app.get('/updates', async (req): Promise<FollowingResponse> => {
    const auth = requireAuth(req);
    return { following: await followingOf(ctx, auth.userId) };
  });
}
