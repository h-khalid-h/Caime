/**
 * An organization's AI agent (PRD §74–75), set up by its owner and admins: its name and what it
 * answers from, answering or paused; tried on a question before it answers anyone; removed.
 * The work itself is lib/agent.ts.
 */
import { randomBytes } from 'node:crypto';
import {
  type AgentTryView,
  canManageOrg,
  defaultPrivacy,
  ORG_ALLOWANCES,
  type OrgAgentView,
  SetOrgAgentBody,
  TryOrgAgentBody,
  uuidv7,
} from '@caishy/core';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context';
import { askAgent, todayForAgent } from '../lib/agent';
import { audit } from '../lib/audit';
import { joinThreads, leaveThreads } from '../lib/business';
import { AppError, badRequest, forbidden, notFound } from '../lib/errors';
import { orgById, orgSeat } from '../lib/orgs';
import { agentRepliesToday, assertAiAllowance } from '../lib/plans';
import { parse } from '../lib/validate';
import { requireAuth } from '../plugins/auth';

export async function agentRoutes(app: FastifyInstance, ctx: AppContext) {
  const orgParam = z.object({ id: z.string().uuid() });

  async function manager(userId: string, orgId: string) {
    const org = await orgById(ctx.db, orgId);
    const seat = await orgSeat(ctx.db, userId, orgId);
    if (!seat) throw notFound('That organization');
    if (!canManageOrg(seat.role)) throw forbidden('Only the organization’s owner and admins can.');
    return org;
  }
  const unavailable = () => badRequest('AI isn’t available on this Caishy server.');

  async function viewOf(orgId: string): Promise<OrgAgentView | null> {
    const row = await ctx.db
      .selectFrom('org_agents as a')
      .innerJoin('users as u', 'u.id', 'a.bot_user_id')
      .innerJoin('organizations as o', 'o.id', 'a.org_id')
      .select([
        'a.knowledge',
        'a.paused_at',
        'a.created_at',
        'a.updated_at',
        'u.display_name as name',
        'o.plan',
      ])
      .where('a.org_id', '=', orgId)
      .executeTakeFirst();
    if (!row) return null;
    return {
      name: row.name,
      knowledge: row.knowledge,
      paused: row.paused_at !== null,
      repliesToday: await agentRepliesToday(ctx, orgId),
      repliesPerDay: ORG_ALLOWANCES[row.plan].agentRepliesPerDay,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  app.get(
    '/orgs/:id/agent',
    async (req): Promise<{ available: boolean; agent: OrgAgentView | null }> => {
      const auth = requireAuth(req);
      const { id } = parse(orgParam, req.params);
      await manager(auth.userId, id);
      return { available: ctx.ai !== null, agent: await viewOf(id) };
    },
  );

  /** Set it up, or change it: its name, what it knows, answering or paused. */
  app.put('/orgs/:id/agent', async (req): Promise<{ agent: OrgAgentView }> => {
    const auth = requireAuth(req);
    const { id } = parse(orgParam, req.params);
    const body = parse(SetOrgAgentBody, req.body);
    await manager(auth.userId, id);
    if (!ctx.ai) throw unavailable();
    ctx.limiter.hit(`agent:${auth.userId}`, ctx.config.isTest ? 1000 : 60, 3_600_000);
    const existing = await ctx.db
      .selectFrom('org_agents')
      .selectAll()
      .where('org_id', '=', id)
      .executeTakeFirst();
    if (existing) {
      await ctx.db.transaction().execute(async (trx) => {
        await trx
          .updateTable('org_agents')
          .set({
            knowledge: body.knowledge,
            paused_at: body.paused ? (existing.paused_at ?? ctx.now()) : null,
            updated_at: ctx.now(),
          })
          .where('org_id', '=', id)
          .execute();
        await trx
          .updateTable('users')
          .set({ display_name: body.name, updated_at: ctx.now() })
          .where('id', '=', existing.bot_user_id)
          .execute();
      });
      await audit(ctx.db, {
        actorId: auth.userId,
        action: 'agent.updated',
        target: id,
        metadata: { paused: body.paused },
      });
    } else {
      const botId = uuidv7();
      await ctx.db.transaction().execute(async (trx) => {
        // Like an app's bot, it can never sign in, be found, or be written to first.
        await trx
          .insertInto('users')
          .values({
            id: botId,
            email: `agent+${botId}@bots.caishy.invalid`,
            handle: `agent.${randomBytes(6).toString('hex')}`,
            password_hash: '!',
            display_name: body.name,
            kind: 'agent',
            privacy: JSON.stringify({
              ...defaultPrivacy({ minor: false }),
              discoverByHandle: false,
              discoverByEmail: false,
              messageRequests: 'nobody',
            }),
            onboarded_at: ctx.now(),
          })
          .execute();
        await trx
          .insertInto('org_agents')
          .values({
            org_id: id,
            bot_user_id: botId,
            knowledge: body.knowledge,
            paused_at: body.paused ? ctx.now() : null,
            created_by: auth.userId,
            created_at: ctx.now(),
            updated_at: ctx.now(),
          })
          .execute();
        await trx
          .insertInto('org_members')
          .values({
            org_id: id,
            user_id: botId,
            role: 'agent',
            title: 'AI agent',
            added_by: auth.userId,
          })
          .execute();
      });
      await joinThreads(ctx.db, id, botId);
      await audit(ctx.db, { actorId: auth.userId, action: 'agent.created', target: id });
    }
    return { agent: (await viewOf(id))! };
  });

  /** Removed: it leaves the team at once; what it wrote stays, under its name. */
  app.delete('/orgs/:id/agent', async (req) => {
    const auth = requireAuth(req);
    const { id } = parse(orgParam, req.params);
    await manager(auth.userId, id);
    const existing = await ctx.db
      .selectFrom('org_agents')
      .select('bot_user_id')
      .where('org_id', '=', id)
      .executeTakeFirst();
    if (!existing) throw notFound('That organization’s AI agent');
    await ctx.db.transaction().execute(async (trx) => {
      await trx.deleteFrom('org_agents').where('org_id', '=', id).execute();
      await trx
        .updateTable('org_members')
        .set({ left_at: ctx.now() })
        .where('org_id', '=', id)
        .where('user_id', '=', existing.bot_user_id)
        .execute();
      await leaveThreads(trx, id, existing.bot_user_id, ctx.now());
    });
    await audit(ctx.db, { actorId: auth.userId, action: 'agent.removed', target: id });
    return { ok: true };
  });

  /** What it would do with a customer's question, with what it would know: nothing is sent. */
  app.post('/orgs/:id/agent/try', async (req): Promise<AgentTryView> => {
    const auth = requireAuth(req);
    const { id } = parse(orgParam, req.params);
    const body = parse(TryOrgAgentBody, req.body);
    const org = await manager(auth.userId, id);
    if (!ctx.ai) throw unavailable();
    ctx.limiter.hit(`agent-try:${auth.userId}`, ctx.config.isTest ? 1000 : 30, 3_600_000);
    // Trying it is one of the person's own AI assists, counted where theirs are.
    await assertAiAllowance(ctx, auth.userId);
    const me = await ctx.db
      .selectFrom('users')
      .select('time_zone')
      .where('id', '=', auth.userId)
      .executeTakeFirstOrThrow();
    const reply = await askAgent(ctx, 'agent_try', auth.userId, {
      orgName: org.name,
      agentName: body.name,
      knowledge: body.knowledge,
      conversation: `[1] Customer: ${body.question.replace(/\s+/g, ' ')}`,
      introduced: false,
      today: todayForAgent(ctx.now(), me.time_zone),
    });
    if (!reply) throw new AppError(503, 'ai_busy', 'It didn’t answer this time. Try again.');
    return { action: reply.action, message: reply.message };
  });
}
