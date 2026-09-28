/**
 * The operator's routes, behind `ADMIN_TOKEN`: the product's metrics, and setting plans until a
 * billing integration does it (R25). Without the token configured, none of this exists: every
 * route answers the same 404 as a route that was never there.
 */
import { ORG_PLANS, PERSON_PLANS, type ProductMetricsView } from '@caime/core';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context';
import { audit } from '../lib/audit';
import { paysThroughBilling } from '../lib/billing';
import { AppError, notFound } from '../lib/errors';
import { requireOperator } from '../lib/operator';
import { orgPlanView, planUsage } from '../lib/plans';
import { productMetrics } from '../lib/product-metrics';
import { parse } from '../lib/validate';

const PAYING = (plan: string) =>
  `${plan} is paid for through Stripe: cancel it there (at once, or at the end of what’s paid), and the plan follows.`;

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
    // Paying for Pro, they keep it until that ends: never charged for a plan they don't have.
    if (plan === 'personal' && (await paysThroughBilling(ctx, { userId: person.id })))
      throw new AppError(409, 'paying', PAYING('Pro'));
    // The operator's say holds: billing never changes it (setting the plan everyone starts on
    // hands it back to billing).
    await ctx.db
      .updateTable('users')
      .set({
        plan,
        plan_source: plan === 'personal' ? 'default' : 'operator',
        updated_at: ctx.now(),
      })
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
    if (plan === 'free' && (await paysThroughBilling(ctx, { orgId: org.id })))
      throw new AppError(409, 'paying', PAYING('Business'));
    await ctx.db
      .updateTable('organizations')
      .set({ plan, plan_source: plan === 'free' ? 'default' : 'operator', updated_at: ctx.now() })
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
