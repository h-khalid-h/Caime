/**
 * Organizations' updates (PRD §59): an organization posts, and whoever follows it reads them in
 * Updates, apart from their conversations (lib/updates.ts). Anyone signed in can read an
 * organization's updates on its page, as they can the page; following is a choice of their own
 * that nobody else sees, and ends when they block it.
 */
import type { FollowingView, OrgUpdatesView, OrgUpdateView } from '@caishy/core';
import { canManageOrg, FollowOrgBody, PostUpdateBody, uuidv7 } from '@caishy/core';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { sql } from 'kysely';
import { z } from 'zod';
import type { AppContext } from '../context';
import { audit } from '../lib/audit';
import { orgBlocked } from '../lib/blocks';
import { orgRef } from '../lib/business';
import { AppError, forbidden, notFound } from '../lib/errors';
import { orgById, orgSeat } from '../lib/orgs';
import { personViewsFor } from '../lib/people-batch';
import { followingOf, tellOfUpdate, updateView } from '../lib/updates';
import { parse } from '../lib/validate';
import { requireAuth } from '../plugins/auth';

export async function updateRoutes(app: FastifyInstance, ctx: AppContext) {
  const idParam = z.object({ id: z.string().uuid() });
  const updateParam = z.object({ id: z.string().uuid(), updateId: z.string().uuid() });

  /** Who posts for it: its owner and admins, or its own app (with "updates"). */
  async function poster(req: FastifyRequest, orgId: string): Promise<string> {
    const auth = requireAuth(req);
    if (auth.app) {
      if (auth.app.orgId !== orgId) throw notFound('That organization');
      return auth.userId;
    }
    const seat = await orgSeat(ctx.db, auth.userId, orgId);
    if (!seat || !canManageOrg(seat.role))
      throw forbidden('Only the organization’s owner and admins post its updates.');
    return auth.userId;
  }

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
    if (auth.app && auth.app.orgId !== id) throw notFound('That organization');
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
    // Only the team sees who on it posted each one: as each is shown to the viewer, and the
    // viewer as themselves.
    const ids = [...new Set(page.flatMap((u) => (u.posted_by ? [u.posted_by] : [])))];
    const posters = new Map<string, { id: string; displayName: string }>();
    if (team && ids.length) {
      for (const [id, p] of await personViewsFor(ctx, auth.userId, ids))
        posters.set(id, { id, displayName: p.displayName });
      if (ids.includes(auth.userId)) {
        const me = await ctx.db
          .selectFrom('users')
          .select('display_name')
          .where('id', '=', auth.userId)
          .executeTakeFirstOrThrow();
        posters.set(auth.userId, { id: auth.userId, displayName: me.display_name });
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

  app.post('/orgs/:id/updates', async (req, reply): Promise<{ update: OrgUpdateView }> => {
    const auth = requireAuth(req);
    const { id } = parse(idParam, req.params);
    const org = await orgById(ctx.db, id);
    const by = await poster(req, id);
    const body = parse(PostUpdateBody, req.body);
    ctx.limiter.hit(`org-updates:${id}`, ctx.config.isTest ? 1000 : 30, 3_600_000);
    const row = await ctx.db
      .insertInto('org_updates')
      .values({ id: uuidv7(), org_id: id, posted_by: by, body: body.body, created_at: ctx.now() })
      .returningAll()
      .executeTakeFirstOrThrow();
    await audit(ctx.db, {
      actorId: auth.userId,
      action: 'org.update_posted',
      target: id,
      metadata: { updateId: row.id },
    });
    ctx.defer('updates', () => tellOfUpdate(ctx, org, row, true));
    reply.status(201);
    return { update: updateView(row, orgRef(org)) };
  });

  app.patch('/orgs/:id/updates/:updateId', async (req): Promise<{ update: OrgUpdateView }> => {
    const auth = requireAuth(req);
    const { id, updateId } = parse(updateParam, req.params);
    const org = await orgById(ctx.db, id);
    await poster(req, id);
    const body = parse(PostUpdateBody, req.body);
    const row = await ctx.db
      .updateTable('org_updates')
      .set({ body: body.body, edited_at: ctx.now() })
      .where('id', '=', updateId)
      .where('org_id', '=', id)
      .where('deleted_at', 'is', null)
      .returningAll()
      .executeTakeFirst();
    if (!row) throw notFound('That update');
    await audit(ctx.db, {
      actorId: auth.userId,
      action: 'org.update_edited',
      target: id,
      metadata: { updateId },
    });
    ctx.defer('updates', () => tellOfUpdate(ctx, org, row, false));
    return { update: updateView(row, orgRef(org)) };
  });

  app.delete('/orgs/:id/updates/:updateId', async (req) => {
    const auth = requireAuth(req);
    const { id, updateId } = parse(updateParam, req.params);
    const org = await orgById(ctx.db, id);
    await poster(req, id);
    // Taken back: its words go; that there was one stays, for the audit log.
    const row = await ctx.db
      .updateTable('org_updates')
      .set({ body: '', deleted_at: ctx.now() })
      .where('id', '=', updateId)
      .where('org_id', '=', id)
      .where('deleted_at', 'is', null)
      .returningAll()
      .executeTakeFirst();
    if (!row) throw notFound('That update');
    await audit(ctx.db, {
      actorId: auth.userId,
      action: 'org.update_removed',
      target: id,
      metadata: { updateId },
    });
    ctx.defer('updates', () => tellOfUpdate(ctx, org, row, false));
    return { ok: true };
  });

  /** Follow (or change whether each update is a notification), from its page. */
  app.put('/orgs/:id/follow', async (req): Promise<{ following: { notify: boolean } }> => {
    const auth = requireAuth(req);
    const { id } = parse(idParam, req.params);
    const { notify } = parse(FollowOrgBody, req.body ?? {});
    await orgById(ctx.db, id);
    if (await orgBlocked(ctx.db, auth.userId, id))
      throw new AppError(409, 'blocked', 'You’ve blocked it. Unblock it to follow its updates.');
    const row = await ctx.db
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
    await ctx.bus.publish([auth.userId], { type: 'updates.changed', data: { orgId: id } });
    return { following: { notify: row.notify } };
  });

  app.delete('/orgs/:id/follow', async (req) => {
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

  /** Seen: what it has posted so far isn't new to them any more. */
  app.post('/orgs/:id/updates/read', async (req) => {
    const auth = requireAuth(req);
    const { id } = parse(idParam, req.params);
    const done = await ctx.db
      .updateTable('org_follows')
      .set({ read_at: ctx.now() })
      .where('user_id', '=', auth.userId)
      .where('org_id', '=', id)
      .returning('org_id')
      .executeTakeFirst();
    if (done)
      await ctx.bus.publish([auth.userId], { type: 'updates.changed', data: { orgId: id } });
    return { ok: true };
  });

  /** Updates: the organizations they follow, newest first. */
  app.get('/updates', async (req): Promise<{ following: FollowingView[] }> => {
    const auth = requireAuth(req);
    return { following: await followingOf(ctx, auth.userId) };
  });
}
