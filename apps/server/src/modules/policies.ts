/**
 * Relationship policies (PRODUCT-REVIEW R11): one screen answers "how should Caime treat my
 * customers?" for notifications, inbox priority, privacy, tone and follow-up.
 */

import type { PolicyView } from '@caime/core';
import { defaultWorkweek, describePolicy, PolicyBody, resolvePolicy, uuidv7 } from '@caime/core';
import { tr } from '@caime/core/i18n';
import type { FastifyInstance } from 'fastify';
import { sql, type Transaction } from 'kysely';
import { z } from 'zod';
import type { AppContext } from '../context';
import type { Database } from '../db/schema';
import { conflict, notFound } from '../lib/errors';
import { activeRelationships, between, loadPolicies, policyTargetFor } from '../lib/relations';
import { seedDefaults } from '../lib/users';
import { parse } from '../lib/validate';
import { requireAuth } from '../plugins/auth';

type Scope = z.infer<typeof PolicyBody>['scope'];

/** One person's rules are changed one write at a time: their row is the lock. */
async function lockRules(trx: Transaction<Database>, userId: string): Promise<void> {
  await trx.selectFrom('users').select('id').where('id', '=', userId).forUpdate().execute();
}

const sameScope = (a: Scope, b: Scope) =>
  (a.sphere ?? null) === (b.sphere ?? null) &&
  (a.role ?? null) === (b.role ?? null) &&
  (a.orgId ?? null) === (b.orgId ?? null) &&
  (a.connectionId ?? null) === (b.connectionId ?? null);

/** A rule for one person is for one of your own connections. */
async function assertOwnConnection(ctx: AppContext, userId: string, scope: Scope) {
  if (!scope.connectionId) return;
  const conn = await ctx.db
    .selectFrom('connections')
    .select('id')
    .where('id', '=', scope.connectionId)
    .where((w) => w.or([w('user_a', '=', userId), w('user_b', '=', userId)]))
    .executeTakeFirst();
  if (!conn) throw notFound(tr('That connection'));
}

export async function policyRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get('/policies', async (req): Promise<{ policies: PolicyView[] }> => {
    const auth = requireAuth(req);
    const policies = await loadPolicies(ctx.db, auth.userId);
    return {
      policies: policies.map((p) => ({
        ...p,
        // As it applies: with the broader rules it leaves to (a manager's rule keeps to Work's
        // hours). One person's rule is shown on their page, with their relationship's.
        description: describePolicy(
          resolvePolicy(p.scope.connectionId ? [p] : policies, {
            sphere: p.scope.sphere ?? null,
            role: p.scope.role ?? null,
            orgId: p.scope.orgId ?? null,
            connectionId: p.scope.connectionId ?? null,
          }),
        ),
      })),
    };
  });

  app.post('/policies', async (req, reply) => {
    const auth = requireAuth(req);
    const body = parse(PolicyBody, req.body);
    await assertOwnConnection(ctx, auth.userId, body.scope);
    // Only one rule applies to a scope, so the same scope again is the same rule, changed; one
    // person's rules are written one at a time, so two devices at once never make two.
    const result = await ctx.db.transaction().execute(async (trx) => {
      await lockRules(trx, auth.userId);
      const same = (await loadPolicies(trx, auth.userId)).find((p) =>
        sameScope(p.scope, body.scope),
      );
      if (same) {
        await trx
          .updateTable('relationship_policies')
          .set({
            ...(body.name !== undefined ? { name: body.name } : {}),
            settings: JSON.stringify({ ...same.settings, ...body.settings }),
            updated_at: ctx.now(),
          })
          .where('id', '=', same.id)
          .execute();
        return { id: same.id, existing: true as const };
      }
      const id = uuidv7();
      await trx
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
          created_at: ctx.now(),
        })
        .execute();
      return { id };
    });
    await ctx.bus.publish([auth.userId], { type: 'policies.changed', data: {} });
    if ('existing' in result) return result;
    reply.status(201);
    return result;
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
    if (!existing) throw notFound(tr('That rule'));
    if (body.scope) await assertOwnConnection(ctx, auth.userId, body.scope);
    await ctx.db.transaction().execute(async (trx) => {
      await lockRules(trx, auth.userId);
      if (
        body.scope &&
        (await loadPolicies(trx, auth.userId)).some(
          (p) => p.id !== id && sameScope(p.scope, body.scope!),
        )
      )
        throw conflict('rule_exists', tr('There’s a rule for them already: change that one.'));
      await trx
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
          // Merged as it's written, never from a copy read before: two changes at once both hold.
          ...(body.settings
            ? { settings: sql`settings || ${JSON.stringify(body.settings)}::jsonb` }
            : {}),
          updated_at: ctx.now(),
        })
        .where('id', '=', id)
        .execute();
    });
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
    if (Number(res.numDeletedRows) === 0) throw notFound(tr('That rule'));
    await ctx.bus.publish([auth.userId], { type: 'policies.changed', data: {} });
    return { ok: true };
  });

  app.post('/policies/reset', async (req) => {
    const auth = requireAuth(req);
    const me = await ctx.db
      .selectFrom('users')
      .select(['workweek', 'country'])
      .where('id', '=', auth.userId)
      .executeTakeFirstOrThrow();
    await ctx.db.transaction().execute(async (trx) => {
      await lockRules(trx, auth.userId);
      await trx
        .deleteFrom('relationship_policies')
        .where('user_id', '=', auth.userId)
        .where('scope_connection_id', 'is', null)
        .execute();
      await seedDefaults(
        trx,
        auth.userId,
        me.workweek?.length ? me.workweek : defaultWorkweek(me.country),
      );
    });
    await ctx.bus.publish([auth.userId], { type: 'policies.changed', data: {} });
    return { ok: true };
  });

  /** How Caime treats one person right now, with the rules it came from (R7 explainability). */
  app.get('/policies/for/:userId', async (req) => {
    const auth = requireAuth(req);
    const { userId } = parse(z.object({ userId: z.string().uuid() }), req.params);
    const [policies, rels, b] = await Promise.all([
      loadPolicies(ctx.db, auth.userId),
      activeRelationships(ctx.db, auth.userId, [userId]),
      between(ctx.db, auth.userId, userId),
    ]);
    const target = policyTargetFor(rels[0], b.connectionId);
    const effective = resolvePolicy(policies, target);
    return {
      policy: effective,
      description: describePolicy(effective),
      // What applies to them without a rule of their own: what that rule, where it's silent, keeps.
      inherited: resolvePolicy(policies, { ...target, connectionId: null }),
    };
  });
}
