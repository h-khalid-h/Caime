/**
 * An organization's AI agent (PRD §74–75), set up by its owner and admins: its name and what it
 * answers from, what it may do and when it answers (M16 G6a), whether its team checks its answers
 * first (M16 G6b), answering or paused; tried on a question before it answers anyone, with what
 * its answer rests on; what it couldn't answer; removed. Anyone on the team sends or lets go of
 * a draft it left in a conversation. The work itself is lib/agent.ts.
 */
import { randomBytes } from 'node:crypto';
import {
  AgentDraftBody,
  type AgentTryView,
  canManageOrg,
  defaultPrivacy,
  ORG_ALLOWANCES,
  type OrgAgentView,
  SetOrgAgentBody,
  TryOrgAgentBody,
  uuidv7,
  writtenIn,
} from '@caime/core';
import type {
  AgentQuestionsResponse,
  OkResponse,
  OrgAgentResponse,
  OrgAgentSetResponse,
} from '@caime/core/api';
import { tr } from '@caime/core/i18n';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context';
import {
  askAgent,
  citationsOf,
  dropDraft,
  dropDraftsOf,
  introduction,
  sendDraft,
  todayForAgent,
} from '../lib/agent';
import { agentQuestions, openQuestions } from '../lib/agent-drafts';
import { evaluatedFor } from '../lib/agent-eval';
import { audit } from '../lib/audit';
import { joinThreads, leaveThreads } from '../lib/business';
import { AppError, badRequest, forbidden, notFound } from '../lib/errors';
import { inLanguage } from '../lib/i18n';
import { orgById, orgSeat } from '../lib/orgs';
import { agentRepliesToday, assertAiAllowance } from '../lib/plans';
import { parse } from '../lib/validate';
import { requireAuth } from '../plugins/auth';

export async function agentRoutes(app: FastifyInstance, ctx: AppContext) {
  const orgParam = z.object({ id: z.string().uuid() });
  const questionParam = z.object({ id: z.string().uuid(), questionId: z.string().uuid() });
  const conversationParam = z.object({ id: z.string().uuid() });

  async function manager(userId: string, orgId: string) {
    const org = await orgById(ctx.db, orgId);
    const seat = await orgSeat(ctx.db, userId, orgId);
    if (!seat) throw notFound(tr('That organization'));
    if (!canManageOrg(seat.role))
      throw forbidden(tr('Only the organization’s owner and admins can.'));
    return org;
  }
  const unavailable = () => badRequest(tr('AI isn’t available on this Caime server.'));

  async function viewOf(orgId: string): Promise<OrgAgentView | null> {
    const row = await ctx.db
      .selectFrom('org_agents as a')
      .innerJoin('users as u', 'u.id', 'a.bot_user_id')
      .innerJoin('organizations as o', 'o.id', 'a.org_id')
      .select([
        'a.knowledge',
        'a.paused_at',
        'a.may_book',
        'a.may_order',
        'a.answers_when',
        'a.review',
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
      mayBook: row.may_book,
      mayOrder: row.may_order,
      answersWhen: row.answers_when,
      review: row.review,
      questions: await openQuestions(ctx.db, orgId),
      repliesToday: await agentRepliesToday(ctx, orgId),
      repliesPerDay: ORG_ALLOWANCES[row.plan].agentRepliesPerDay,
      evaluated: await evaluatedFor(ctx, row.plan),
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  app.get('/orgs/:id/agent', async (req): Promise<OrgAgentResponse> => {
    const auth = requireAuth(req);
    const { id } = parse(orgParam, req.params);
    await manager(auth.userId, id);
    return { available: ctx.ai !== null, agent: await viewOf(id) };
  });

  /**
   * Set it up, or change it: its name, what it knows, what it may do and when it answers (each
   * kept when left out), answering or paused.
   */
  app.put('/orgs/:id/agent', async (req): Promise<OrgAgentSetResponse> => {
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
    // What it may do, and when, as the request says; what it leaves out stays as it was.
    const governed = {
      ...(body.mayBook !== undefined ? { may_book: body.mayBook } : {}),
      ...(body.mayOrder !== undefined ? { may_order: body.mayOrder } : {}),
      ...(body.answersWhen !== undefined ? { answers_when: body.answersWhen } : {}),
      ...(body.review !== undefined ? { review: body.review } : {}),
    };
    if (existing) {
      await ctx.db.transaction().execute(async (trx) => {
        await trx
          .updateTable('org_agents')
          .set({
            knowledge: body.knowledge,
            paused_at: body.paused ? (existing.paused_at ?? ctx.now()) : null,
            ...governed,
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
        // What it may do and when, as it was and as it is now: who let it do what is on record.
        metadata: {
          paused: body.paused,
          mayBook: body.mayBook ?? existing.may_book,
          mayOrder: body.mayOrder ?? existing.may_order,
          answersWhen: body.answersWhen ?? existing.answers_when,
          review: body.review ?? existing.review,
          ...(Object.keys(governed).length
            ? {
                before: {
                  mayBook: existing.may_book,
                  mayOrder: existing.may_order,
                  answersWhen: existing.answers_when,
                  review: existing.review,
                },
              }
            : {}),
        },
      });
    } else {
      const botId = uuidv7();
      await ctx.db.transaction().execute(async (trx) => {
        // Like an app's bot, it can never sign in, be found, or be written to first.
        await trx
          .insertInto('users')
          .values({
            id: botId,
            email: `agent+${botId}@bots.caime.invalid`,
            handle: `agent.${randomBytes(6).toString('hex')}`,
            password_hash: '!',
            display_name: body.name,
            kind: 'agent',
            privacy: JSON.stringify({
              ...defaultPrivacy({ minor: false }),
              discoverByHandle: false,
              discoverByEmail: false,
              discoverByPhone: false,
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
            ...governed,
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
      await audit(ctx.db, {
        actorId: auth.userId,
        action: 'agent.created',
        target: id,
        metadata: {
          mayBook: body.mayBook ?? true,
          mayOrder: body.mayOrder ?? true,
          answersWhen: body.answersWhen ?? 'always',
          review: body.review ?? false,
        },
      });
    }
    return { agent: (await viewOf(id))! };
  });

  /** Removed: it leaves the team at once; what it wrote stays, under its name. */
  app.delete('/orgs/:id/agent', async (req): Promise<OkResponse> => {
    const auth = requireAuth(req);
    const { id } = parse(orgParam, req.params);
    await manager(auth.userId, id);
    const existing = await ctx.db
      .selectFrom('org_agents')
      .select('bot_user_id')
      .where('org_id', '=', id)
      .executeTakeFirst();
    if (!existing) throw notFound(tr('That organization’s AI agent'));
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
    await dropDraftsOf(ctx, id);
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
      // On the model its customers would get (M16 H7).
      tier: ORG_ALLOWANCES[org.plan].agentModel,
      orgName: org.name,
      agentName: body.name,
      country: org.country,
      knowledge: body.knowledge,
      conversation: `[1] Customer: ${body.question.replace(/\s+/g, ' ')}`,
      introduced: false,
      today: todayForAgent(ctx.now(), me.time_zone),
      slots: null,
      catalog: null,
      menu: null,
    });
    if (!reply) throw new AppError(503, 'ai_busy', tr('It didn’t answer this time. Try again.'));
    // As a customer would read it first (R87): its introduction, in the question's language.
    const language = writtenIn(body.question);
    const intro = () => introduction(body.name, org.name, null);
    return {
      action: reply.action,
      message: `${language ? inLanguage(language, intro) : intro()}\n${reply.message}`,
      cited: citationsOf(body.knowledge, reply.sources),
    };
  });

  /** What it couldn't answer from what it was told (M16 G6b), for its owner and admins. */
  app.get('/orgs/:id/agent/questions', async (req): Promise<AgentQuestionsResponse> => {
    const auth = requireAuth(req);
    const { id } = parse(orgParam, req.params);
    await manager(auth.userId, id);
    return { questions: await agentQuestions(ctx, id) };
  });

  /** Seen to (added to what it knows, or nothing to add): off the list. */
  app.post('/orgs/:id/agent/questions/:questionId/done', async (req): Promise<OkResponse> => {
    const auth = requireAuth(req);
    const { id, questionId } = parse(questionParam, req.params);
    await manager(auth.userId, id);
    const done = await ctx.db
      .updateTable('agent_questions')
      .set({ done_at: ctx.now(), done_by: auth.userId })
      .where('id', '=', questionId)
      .where('org_id', '=', id)
      .where('done_at', 'is', null)
      .returning('id')
      .executeTakeFirst();
    if (!done) throw notFound(tr('That question'));
    return { ok: true };
  });

  /** On the team of the organization a conversation is with; anyone else gets a 404. */
  async function teamOf(userId: string, conversationId: string): Promise<string> {
    const thread = await ctx.db
      .selectFrom('business_threads')
      .select('org_id')
      .where('conversation_id', '=', conversationId)
      .executeTakeFirst();
    const seat = thread ? await orgSeat(ctx.db, userId, thread.org_id) : null;
    if (!thread || !seat) throw notFound(tr('That conversation'));
    return thread.org_id;
  }

  /** Send its draft as it is (M16 G6b): anyone on the team, once, while it still stands. */
  app.post('/business/:id/agent-draft/send', async (req): Promise<OkResponse> => {
    const auth = requireAuth(req);
    const { id } = parse(conversationParam, req.params);
    const { seq } = parse(AgentDraftBody, req.body);
    const orgId = await teamOf(auth.userId, id);
    await sendDraft(ctx, id, auth.userId, seq);
    await audit(ctx.db, {
      actorId: auth.userId,
      action: 'agent.draft_sent',
      target: orgId,
      metadata: { conversationId: id },
    });
    return { ok: true };
  });

  /** Let it go, or take its words into one's own reply (`edited`). */
  app.post('/business/:id/agent-draft/drop', async (req): Promise<OkResponse> => {
    const auth = requireAuth(req);
    const { id } = parse(conversationParam, req.params);
    const { seq, edited } = parse(AgentDraftBody, req.body);
    await teamOf(auth.userId, id);
    const orgId = await dropDraft(ctx, id, seq, edited);
    if (!orgId) throw notFound(tr('That draft'));
    await audit(ctx.db, {
      actorId: auth.userId,
      action: 'agent.draft_dropped',
      target: orgId,
      metadata: { conversationId: id, edited },
    });
    return { ok: true };
  });
}
