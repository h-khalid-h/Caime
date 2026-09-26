/**
 * Relationship policies (PRODUCT-REVIEW R11): one screen answers "how should Caishy treat my
 * customers?" for notifications, inbox priority, privacy, tone and follow-up.
 */

import type { PolicyView } from '@caishy/core';
import { defaultWorkweek, describePolicy, PolicyBody, resolvePolicy, uuidv7 } from '@caishy/core';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context';
import { notFound } from '../lib/errors';
import { activeRelationships, between, loadPolicies, policyTargetFor } from '../lib/relations';
import { seedDefaults } from '../lib/users';
import { parse } from '../lib/validate';
import { requireAuth } from '../plugins/auth';

export async function policyRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get('/policies', async (req): Promise<{ policies: PolicyView[] }> => {
    const auth = requireAuth(req);
    const policies = await loadPolicies(ctx.db, auth.userId);
    return {
      policies: policies.map((p) => ({
        ...p,
        description: describePolicy(
          resolvePolicy([p], {
            sphere: p.scope.sphere ?? null,
            role: p.scope.role,
            orgId: p.scope.orgId,
            connectionId: p.scope.connectionId,
          }),
        ),
      })),
    };
  });

  app.post('/policies', async (req, reply) => {
    const auth = requireAuth(req);
    const body = parse(PolicyBody, req.body);
    const id = uuidv7();
    await ctx.db
      .insertInto('relationship_policies')
      .values({
        id,
        user_id: auth.userId,
        name: body.name ?? null,
        scope_sphere: body.scope.sphere ?? null,
        scope_role: body.scope.role ?? null,
        scope_org_id: body.scope.orgId ?? null,
        scope_connection_id: body.scope.connectionId ?? null,
        settings: JSON.stringify(body.settings),
      })
      .execute();
    await ctx.bus.publish([auth.userId], { type: 'policies.changed', data: {} });
    reply.status(201);
    return { id };
  });

  app.patch('/policies/:id', async (req) => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const body = parse(PolicyBody.partial(), req.body);
    const existing = await ctx.db
      .selectFrom('relationship_policies')
      .selectAll()
      .where('id', '=', id)
      .where('user_id', '=', auth.userId)
      .executeTakeFirst();
    if (!existing) throw notFound('That rule');
    await ctx.db
      .updateTable('relationship_policies')
      .set({
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.scope
          ? {
              scope_sphere: body.scope.sphere ?? null,
              scope_role: body.scope.role ?? null,
              scope_org_id: body.scope.orgId ?? null,
              scope_connection_id: body.scope.connectionId ?? null,
            }
          : {}),
        ...(body.settings
          ? { settings: JSON.stringify({ ...(existing.settings as object), ...body.settings }) }
          : {}),
        updated_at: ctx.now(),
      })
      .where('id', '=', id)
      .execute();
    await ctx.bus.publish([auth.userId], { type: 'policies.changed', data: {} });
    return { ok: true };
  });

  app.delete('/policies/:id', async (req) => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const res = await ctx.db
      .deleteFrom('relationship_policies')
      .where('id', '=', id)
      .where('user_id', '=', auth.userId)
      .executeTakeFirst();
    if (Number(res.numDeletedRows) === 0) throw notFound('That rule');
    await ctx.bus.publish([auth.userId], { type: 'policies.changed', data: {} });
    return { ok: true };
  });

  app.post('/policies/reset', async (req) => {
    const auth = requireAuth(req);
    const me = await ctx.db
      .selectFrom('users')
      .select(['workweek', 'region', 'locale'])
      .where('id', '=', auth.userId)
      .executeTakeFirstOrThrow();
    await ctx.db.transaction().execute(async (trx) => {
      await trx
        .deleteFrom('relationship_policies')
        .where('user_id', '=', auth.userId)
        .where('scope_connection_id', 'is', null)
        .execute();
      await seedDefaults(
        trx,
        auth.userId,
        me.workweek?.length ? me.workweek : defaultWorkweek(me.region ?? me.locale),
      );
    });
    await ctx.bus.publish([auth.userId], { type: 'policies.changed', data: {} });
    return { ok: true };
  });

  /** How Caishy treats one person right now, with the rules it came from (R7 explainability). */
  app.get('/policies/for/:userId', async (req) => {
    const auth = requireAuth(req);
    const { userId } = parse(z.object({ userId: z.string().uuid() }), req.params);
    const [policies, rels, b] = await Promise.all([
      loadPolicies(ctx.db, auth.userId),
      activeRelationships(ctx.db, auth.userId, [userId]),
      between(ctx.db, auth.userId, userId),
    ]);
    const effective = resolvePolicy(policies, policyTargetFor(rels[0], b.connectionId));
    return { policy: effective, description: describePolicy(effective) };
  });
}
