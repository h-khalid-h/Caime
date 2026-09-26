/**
 * The operator's routes, behind `ADMIN_TOKEN`: setting plans until a billing integration does it
 * (R25). Without the token configured, none of this exists: every route answers the same 404 as
 * a route that was never there.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import { ORG_PLANS, PERSON_PLANS } from '@caishy/core';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context';
import { audit } from '../lib/audit';
import { AppError, notFound, unauthorized } from '../lib/errors';
import { orgPlanView, planUsage } from '../lib/plans';
import { parse } from '../lib/validate';

const digest = (s: string) => createHash('sha256').update(s).digest();

export async function adminRoutes(app: FastifyInstance, ctx: AppContext) {
  function operator(req: FastifyRequest) {
    const expected = ctx.config.ADMIN_TOKEN;
    if (!expected)
      throw new AppError(404, 'not_found', `No route for ${req.method} ${req.url.split('?')[0]}`);
    ctx.limiter.hit(`admin:${req.ip}`, ctx.config.isTest ? 1000 : 30, 60_000);
    const header = req.headers.authorization ?? '';
    const given = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    // Equal-length digests, so the comparison takes the same time whatever was sent.
    if (!timingSafeEqual(digest(given), digest(expected)))
      throw unauthorized('That isn’t this server’s operator token.');
  }

  const handleParam = z.object({ handle: z.string().trim().min(1).max(64) });

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
