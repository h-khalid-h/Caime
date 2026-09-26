/**
 * The operator's routes, behind `ADMIN_TOKEN`: the product's metrics, and setting plans until a
 * billing integration does it (R25). Without the token configured, none of this exists: every
 * route answers the same 404 as a route that was never there.
 */
import { ORG_PLANS, PERSON_PLANS, type ProductMetricsView } from '@caishy/core';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context';
import { audit } from '../lib/audit';
import { notFound } from '../lib/errors';
import { requireOperator } from '../lib/operator';
import { orgPlanView, planUsage } from '../lib/plans';
import { productMetrics } from '../lib/product-metrics';
import { parse } from '../lib/validate';

export async function adminRoutes(app: FastifyInstance, ctx: AppContext) {
  const operator = (req: FastifyRequest) => requireOperator(ctx, req, ctx.config.ADMIN_TOKEN);

  const handleParam = z.object({ handle: z.string().trim().min(1).max(64) });

  /** The product's health (PRD §82–83): aggregates only, over the last `days`. */
  app.get('/admin/metrics', async (req): Promise<{ metrics: ProductMetricsView }> => {
    operator(req);
    const { days } = parse(
      z.object({ days: z.coerce.number().int().min(1).max(365).default(28) }),
      req.query,
    );
    return { metrics: await productMetrics(ctx, days) };
  });

  app.put('/admin/people/:handle/plan', async (req) => {
    operator(req);
    const { handle } = parse(handleParam, req.params);
    const { plan } = parse(z.object({ plan: z.enum(PERSON_PLANS) }), req.body);
    const person = await ctx.db
      .selectFrom('users')
      .select(['id', 'plan'])
      .where('handle', '=', handle.replace(/^@/, ''))
      .where('kind', '=', 'human')
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    if (!person) throw notFound('That person');
    await ctx.db
      .updateTable('users')
      .set({ plan, updated_at: ctx.now() })
      .where('id', '=', person.id)
      .execute();
    await audit(ctx.db, {
      actorId: null,
      action: 'plan.changed',
      target: person.id,
      ip: req.ip,
      metadata: { of: 'person', from: person.plan, to: plan },
    });
    return { plan: await planUsage(ctx, person.id) };
  });

  app.put('/admin/orgs/:handle/plan', async (req) => {
    operator(req);
    const { handle } = parse(handleParam, req.params);
    const { plan } = parse(z.object({ plan: z.enum(ORG_PLANS) }), req.body);
    const org = await ctx.db
      .selectFrom('organizations')
      .select(['id', 'plan'])
      .where('handle', '=', handle.replace(/^@/, ''))
      .where('archived_at', 'is', null)
      .executeTakeFirst();
    if (!org) throw notFound('That organization');
    await ctx.db
      .updateTable('organizations')
      .set({ plan, updated_at: ctx.now() })
      .where('id', '=', org.id)
      .execute();
    await audit(ctx.db, {
      actorId: null,
      action: 'plan.changed',
      target: org.id,
      ip: req.ip,
      metadata: { of: 'organization', from: org.plan, to: plan },
    });
    return { plan: await orgPlanView(ctx, org.id) };
  });
}
