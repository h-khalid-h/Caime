/**
 * The Business inbox (PRD §37–38, R15): a customer starts one conversation with an organization,
 * and its team works it: who has it, whether it's escalated, when it's resolved. Whose turn it
 * is comes from the messages themselves (lib/business.ts).
 */
import {
  AssignThreadBody,
  BUSINESS_VIEWS,
  type BusinessInboxView,
  type BusinessSummaryView,
  type BusinessThreadView,
  type BusinessView,
  canManageOrg,
  EscalateThreadBody,
  handleError,
  inBusinessView,
  isMinor,
  normalizeHandle,
  StartThreadBody,
  type StartThreadResult,
  uuidv7,
} from '@caishy/core';
import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { z } from 'zod';
import type { AppContext } from '../context';
import type { BusinessThread } from '../db/schema';
import { emitWebhook } from '../lib/apps';
import { orgBlocked } from '../lib/blocks';
import { factsOf, orgRef, publishThread, teamOf, threadViews } from '../lib/business';
import { AppError, badRequest, forbidden, notFound } from '../lib/errors';
import { recordEvent } from '../lib/events';
import { afterMessage } from '../lib/message-effects';
import { messageViews, participantsOf, sendMessage } from '../lib/messages';
import { notify } from '../lib/notify';
import { orgById, orgSeat } from '../lib/orgs';
import { assertStartRoom } from '../lib/plans';
import { isBlockedEitherWay } from '../lib/relations';
import { privacyOf } from '../lib/users';
import { parse } from '../lib/validate';
import { requireAuth } from '../plugins/auth';

/** Longest wait first where someone is waiting; newest first where nobody is. */
function ordered(view: BusinessView, threads: BusinessThreadView[]): BusinessThreadView[] {
  const waitFirst = view !== 'waiting' && view !== 'resolved';
  return [...threads].sort((a, b) => {
    if (waitFirst && (a.waitingSince || b.waitingSince)) {
      if (!a.waitingSince) return 1;
      if (!b.waitingSince) return -1;
      return Date.parse(a.waitingSince) - Date.parse(b.waitingSince);
    }
    return Date.parse(b.lastActivityAt) - Date.parse(a.lastActivityAt);
  });
}

export async function businessRoutes(app: FastifyInstance, ctx: AppContext) {
  const idParam = z.object({ id: z.string().uuid() });
  const threadParam = z.object({ conversationId: z.string().uuid() });

  /**
   * Block an organization (PRD §55): its team and its apps can no longer write to you, and your
   * conversation with it closes (resolved for the team, archived for you) until you unblock it.
   */
  app.post('/orgs/:id/block', async (req) => {
    const auth = requireAuth(req);
    const { id } = parse(idParam, req.params);
    await orgById(ctx.db, id);
    if (await orgSeat(ctx.db, auth.userId, id))
      throw badRequest('You’re on its team. Leave the team instead.');
    await ctx.db
      .insertInto('org_blocks')
      .values({ user_id: auth.userId, org_id: id, created_at: ctx.now() })
      .onConflict((oc) => oc.doNothing())
      .execute();
    const thread = await ctx.db
      .selectFrom('business_threads')
      .select(['conversation_id', 'resolved_at'])
      .where('org_id', '=', id)
      .where('customer_id', '=', auth.userId)
      .executeTakeFirst();
    if (thread) {
      if (!thread.resolved_at)
        await ctx.db
          .updateTable('business_threads')
          .set({
            resolved_at: ctx.now(),
            resolved_by: null,
            escalated_at: null,
            escalated_by: null,
            escalation_note: null,
            updated_at: ctx.now(),
          })
          .where('conversation_id', '=', thread.conversation_id)
          .execute();
      await ctx.db
        .updateTable('participants')
        .set({ archived_at: ctx.now() })
        .where('conversation_id', '=', thread.conversation_id)
        .where('user_id', '=', auth.userId)
        .execute();
      await publishThread(ctx, id, thread.conversation_id);
    }
    await ctx.bus.publish([auth.userId], {
      type: 'block.changed',
      data: { orgId: id, blocked: true },
    });
    return { ok: true };
  });

  app.delete('/orgs/:id/block', async (req) => {
    const auth = requireAuth(req);
    const { id } = parse(idParam, req.params);
    await ctx.db
      .deleteFrom('org_blocks')
      .where('user_id', '=', auth.userId)
      .where('org_id', '=', id)
      .execute();
    const thread = await ctx.db
      .selectFrom('business_threads')
      .select('conversation_id')
      .where('org_id', '=', id)
      .where('customer_id', '=', auth.userId)
      .executeTakeFirst();
    // It stays resolved until they write again, as any resolved conversation does.
    if (thread) await publishThread(ctx, id, thread.conversation_id);
    await ctx.bus.publish([auth.userId], {
      type: 'block.changed',
      data: { orgId: id, blocked: false },
    });
    return { ok: true };
  });

  /** A customer's conversation with an organization: theirs if it exists, else a new one. */
  app.post('/orgs/:id/conversations', async (req, reply) => {
    const auth = requireAuth(req);
    const { id } = parse(idParam, req.params);
    const org = await orgById(ctx.db, id);
    if (await orgSeat(ctx.db, auth.userId, id))
      throw badRequest('You’re on its team: its conversations are in its inbox.');
    const me = await ctx.db
      .selectFrom('users')
      .select('birth_year')
      .where('id', '=', auth.userId)
      .executeTakeFirstOrThrow();
    if (isMinor(me.birth_year, ctx.now()))
      throw forbidden('Messaging organizations is for people over 18 for now.');
    if (await orgBlocked(ctx.db, auth.userId, id))
      throw new AppError(
        403,
        'org_blocked',
        `You blocked ${org.name}. Unblock it to write to it again.`,
      );
    const existing = await ctx.db
      .selectFrom('business_threads')
      .select('conversation_id')
      .where('org_id', '=', id)
      .where('customer_id', '=', auth.userId)
      .executeTakeFirst();
    if (existing) {
      // Back in it if they had archived it.
      await ctx.db
        .updateTable('participants')
        .set({ archived_at: null, left_at: null })
        .where('conversation_id', '=', existing.conversation_id)
        .where('user_id', '=', auth.userId)
        .execute();
      return { conversationId: existing.conversation_id, created: false };
    }
    ctx.limiter.hit(`business-start:${auth.userId}`, ctx.config.isTest ? 1000 : 20, 3_600_000);
    const conversationId = uuidv7();
    const team = await teamOf(ctx.db, id);
    try {
      await ctx.db.transaction().execute(async (trx) => {
        await trx
          .insertInto('conversations')
          .values({ id: conversationId, kind: 'business', org_id: id, created_by: auth.userId })
          .execute();
        await trx
          .insertInto('participants')
          .values([
            { conversation_id: conversationId, user_id: auth.userId, role: 'member' },
            ...team.map((userId) => ({
              conversation_id: conversationId,
              user_id: userId,
              role: 'agent' as const,
            })),
          ])
          .execute();
        await trx
          .insertInto('business_threads')
          .values({
            conversation_id: conversationId,
            org_id: id,
            customer_id: auth.userId,
            created_at: ctx.now(),
            updated_at: ctx.now(),
          })
          .execute();
        await recordEvent(trx, 'conversation.created', auth.userId, {
          conversationId,
          kind: 'business',
          orgId: org.id,
        });
      });
    } catch (err) {
      // Two taps at once: the first one's conversation is theirs.
      if ((err as { code?: string }).code !== '23505') throw err;
      const winner = await ctx.db
        .selectFrom('business_threads')
        .select('conversation_id')
        .where('org_id', '=', id)
        .where('customer_id', '=', auth.userId)
        .executeTakeFirstOrThrow();
      return { conversationId: winner.conversation_id, created: false };
    }
    reply.status(201);
    await ctx.bus.publish([auth.userId], {
      type: 'conversation.created',
      data: { conversationId },
    });
    return { conversationId, created: true };
  });

  /**
   * Someone on the team writes to a person first (R14). Unless they've written to the
   * organization before, it reaches them as a message request: in Requests, silent, its links
   * inert, and one message until they answer or accept it. Only a verified organization writes
   * first, only a person on its team does, and never to anyone under 18, anyone who blocked it,
   * or anyone who only takes messages from people they know.
   */
  app.post('/orgs/:id/threads', async (req, reply): Promise<StartThreadResult> => {
    const auth = requireAuth(req);
    const { id } = parse(idParam, req.params);
    const body = parse(StartThreadBody, req.body);
    const org = await orgById(ctx.db, id);
    if (!(await orgSeat(ctx.db, auth.userId, id))) throw notFound('That organization');
    const writer = await ctx.db
      .selectFrom('users')
      .select('kind')
      .where('id', '=', auth.userId)
      .executeTakeFirstOrThrow();
    if (writer.kind !== 'human')
      throw forbidden('A person on the team writes first; an app answers customers.');
    ctx.limiter.hit(`business-reach:${auth.userId}`, ctx.config.isTest ? 1000 : 60, 3_600_000);
    // Nobody by that handle, and somebody the organization can't write to, answer the same.
    const nobody = () =>
      new AppError(404, 'not_found', `Nobody by that handle can hear from ${org.name}.`);
    const wanted = normalizeHandle(body.handle);
    if (handleError(wanted)) throw nobody();
    const target = await ctx.db
      .selectFrom('users')
      .selectAll()
      .where('handle', '=', wanted)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    if (!target || target.kind !== 'human') throw nobody();
    if (await orgSeat(ctx.db, target.id, id))
      throw badRequest('They’re on the team: write to them directly.');

    const existing = await ctx.db
      .selectFrom('business_threads')
      .select('conversation_id')
      .where('org_id', '=', id)
      .where('customer_id', '=', target.id)
      .executeTakeFirst();
    let conversationId = existing?.conversation_id;
    let created = false;
    if (!conversationId) {
      const now = ctx.now();
      if (!org.verified_at)
        throw forbidden(
          `Verify ${org.name}’s domain first: only a verified organization writes to someone first.`,
        );
      const privacy = privacyOf(target, now);
      if (
        !privacy.discoverByHandle ||
        isMinor(target.birth_year, now) ||
        (await orgBlocked(ctx.db, target.id, id)) ||
        (await isBlockedEitherWay(ctx.db, auth.userId, target.id))
      )
        throw nobody();
      if (privacy.messageRequests !== 'everyone')
        throw new AppError(
          403,
          'not_accepting_requests',
          `${target.display_name} only takes messages from people they know.`,
        );
      await assertStartRoom(ctx, id, auth.userId);
      const fresh = uuidv7();
      const team = await teamOf(ctx.db, id);
      try {
        await ctx.db.transaction().execute(async (trx) => {
          await trx
            .insertInto('conversations')
            .values({ id: fresh, kind: 'business', org_id: id, created_by: auth.userId })
            .execute();
          await trx
            .insertInto('participants')
            .values([
              {
                conversation_id: fresh,
                user_id: target.id,
                role: 'member',
                request_state: 'pending',
              },
              ...team.map((userId) => ({
                conversation_id: fresh,
                user_id: userId,
                role: 'agent' as const,
              })),
            ])
            .execute();
          await trx
            .insertInto('business_threads')
            .values({
              conversation_id: fresh,
              org_id: id,
              customer_id: target.id,
              started_by_team: true,
              created_at: now,
              updated_at: now,
            })
            .execute();
          await recordEvent(trx, 'conversation.created', auth.userId, {
            conversationId: fresh,
            kind: 'business',
            orgId: id,
            startedByTeam: true,
          });
        });
        conversationId = fresh;
        created = true;
      } catch (err) {
        // Two of the team at once, or the customer just then: one conversation, theirs.
        if ((err as { code?: string }).code !== '23505') throw err;
        conversationId = (
          await ctx.db
            .selectFrom('business_threads')
            .select('conversation_id')
            .where('org_id', '=', id)
            .where('customer_id', '=', target.id)
            .executeTakeFirstOrThrow()
        ).conversation_id;
      }
    }

    let result: Awaited<ReturnType<typeof sendMessage>>;
    try {
      result = await sendMessage(ctx, auth.userId, conversationId, {
        clientId: body.clientId,
        kind: 'text',
        body: body.body,
      });
    } catch (err) {
      // Nothing is left behind, nor counted, when the first message can't go.
      if (created)
        await ctx.db.deleteFrom('conversations').where('id', '=', conversationId).execute();
      throw err;
    }
    const [view] = await messageViews(ctx.db, [result.message], auth.userId);
    if (result.created) {
      const members = await participantsOf(ctx.db, conversationId);
      if (created)
        await ctx.bus.publish([target.id], {
          type: 'conversation.created',
          data: { conversationId },
        });
      await ctx.bus.publish(
        members.map((m) => m.user_id).filter((u) => u !== auth.userId),
        { type: 'message.created', data: { ...view!, clientId: null } },
      );
      await ctx.bus.publish([auth.userId], { type: 'message.created', data: view! });
      const { analysis, message } = result;
      ctx.defer('after-message', () => afterMessage(ctx, message, analysis));
    }
    reply.status(created ? 201 : 200);
    return { conversationId, created, message: view! };
  });

  app.get('/orgs/:id/inbox', async (req): Promise<BusinessInboxView> => {
    const auth = requireAuth(req);
    const { id } = parse(idParam, req.params);
    const { view } = parse(
      z.object({ view: z.enum(BUSINESS_VIEWS).default('customer_waiting') }),
      req.query,
    );
    const org = await orgById(ctx.db, id);
    if (!(await orgSeat(ctx.db, auth.userId, id))) throw notFound('That organization');
    // A conversation shows up once someone has written in it: the customer, or the team first
    // (R14). The newest few hundred are plenty.
    const threads = await ctx.db
      .selectFrom('business_threads')
      .selectAll()
      .where('org_id', '=', id)
      .where((eb) => eb.or([eb('last_customer_seq', '>', '0'), eb('last_team_seq', '>', '0')]))
      .orderBy('updated_at', 'desc')
      .limit(500)
      .execute();
    const counts = Object.fromEntries(
      BUSINESS_VIEWS.map((v) => [
        v,
        threads.filter((t) => inBusinessView(v, factsOf(t), auth.userId)).length,
      ]),
    ) as Record<BusinessView, number>;
    const shown = threads
      .filter((t) => inBusinessView(view, factsOf(t), auth.userId))
      .slice(0, 100);
    return {
      org: orgRef(org),
      view,
      threads: ordered(view, await threadViews(ctx, auth.userId, shown)),
      counts,
    };
  });

  /** Each of your organizations' inboxes, counted as what needs you (R7). */
  app.get('/business/summary', async (req): Promise<BusinessSummaryView> => {
    const auth = requireAuth(req);
    const orgs = await ctx.db
      .selectFrom('org_members as m')
      .innerJoin('organizations as o', 'o.id', 'm.org_id')
      .selectAll('o')
      .where('m.user_id', '=', auth.userId)
      .where('m.left_at', 'is', null)
      .where('o.archived_at', 'is', null)
      .orderBy('m.joined_at')
      .execute();
    if (orgs.length === 0) return { orgs: [] };
    const open = sql<boolean>`t.resolved_at is null and (t.last_customer_seq > 0 or t.last_team_seq > 0)`;
    const theirTurn = sql<boolean>`t.last_customer_seq > t.last_team_seq`;
    const counts = await ctx.db
      .selectFrom('business_threads as t')
      .select([
        't.org_id',
        sql<number>`count(*) filter (where ${open} and ${theirTurn} and (t.assignee_id is null or t.assignee_id = ${auth.userId}))::int`.as(
          'waiting',
        ),
        sql<number>`count(*) filter (where ${open} and t.assignee_id is null and t.last_team_seq = 0)::int`.as(
          'unassigned',
        ),
        sql<number>`count(*) filter (where ${open} and t.assignee_id = ${auth.userId})::int`.as(
          'mine',
        ),
      ])
      .where(
        't.org_id',
        'in',
        orgs.map((o) => o.id),
      )
      .groupBy('t.org_id')
      .execute();
    return {
      orgs: orgs.map((o) => {
        const c = counts.find((x) => x.org_id === o.id);
        return {
          org: orgRef(o),
          waiting: c?.waiting ?? 0,
          unassigned: c?.unassigned ?? 0,
          mine: c?.mine ?? 0,
        };
      }),
    };
  });

  /** A thread you're on the team for; anyone else gets the same 404 as a thread that isn't. */
  async function teamThread(userId: string, conversationId: string) {
    const thread = await ctx.db
      .selectFrom('business_threads')
      .selectAll()
      .where('conversation_id', '=', conversationId)
      .executeTakeFirst();
    const seat = thread ? await orgSeat(ctx.db, userId, thread.org_id) : null;
    if (!thread || !seat) throw notFound('That conversation');
    return { thread, seat };
  }

  async function changed(userId: string, before: BusinessThread, change: string) {
    const thread = await ctx.db
      .selectFrom('business_threads')
      .selectAll()
      .where('conversation_id', '=', before.conversation_id)
      .executeTakeFirstOrThrow();
    await recordEvent(ctx.db, 'business.thread_updated', userId, {
      conversationId: thread.conversation_id,
      orgId: thread.org_id,
      change,
    });
    await publishThread(ctx, thread.org_id, thread.conversation_id);
    const [view] = await threadViews(ctx, userId, [thread]);
    await emitWebhook(ctx, thread.org_id, 'business.thread', {
      conversationId: thread.conversation_id,
      change,
      state: view!.state,
      assignee: view!.assignee,
    });
    return { thread: view! };
  }

  /** Who in the conversation to tell, and what the conversation is called for them. */
  async function describe(thread: BusinessThread) {
    const [org, customer] = await Promise.all([
      orgById(ctx.db, thread.org_id),
      thread.customer_id
        ? ctx.db
            .selectFrom('users')
            .select('display_name')
            .where('id', '=', thread.customer_id)
            .executeTakeFirst()
        : undefined,
    ]);
    return `${customer?.display_name ?? 'A customer'} · ${org.name}`;
  }

  app.post('/business/:conversationId/assign', async (req) => {
    const auth = requireAuth(req);
    const { conversationId } = parse(threadParam, req.params);
    const { userId } = parse(AssignThreadBody, req.body);
    const { thread } = await teamThread(auth.userId, conversationId);
    if (userId) {
      const person = await ctx.db
        .selectFrom('users')
        .select('kind')
        .where('id', '=', userId)
        .executeTakeFirst();
      if (!person || !(await orgSeat(ctx.db, userId, thread.org_id)))
        throw badRequest('They aren’t on the team.');
      // A bot answers, but only a person takes a conversation (R16).
      if (person.kind !== 'human') throw badRequest('That’s an app’s bot: give it to a person.');
    }
    await ctx.db
      .updateTable('business_threads')
      .set({ assignee_id: userId, updated_at: ctx.now() })
      .where('conversation_id', '=', conversationId)
      .execute();
    if (userId && userId !== auth.userId) {
      const me = await ctx.db
        .selectFrom('users')
        .select('display_name')
        .where('id', '=', auth.userId)
        .executeTakeFirstOrThrow();
      await notify(ctx, {
        userId,
        kind: 'business',
        level: 'attention',
        title: `${me.display_name} gave you a conversation`,
        body: await describe(thread),
        data: { conversationId, orgId: thread.org_id },
        groupKey: `conv:${conversationId}`,
      });
    }
    return changed(auth.userId, thread, userId ? 'assigned' : 'unassigned');
  });

  app.post('/business/:conversationId/resolve', async (req) => {
    const auth = requireAuth(req);
    const { conversationId } = parse(threadParam, req.params);
    const { thread } = await teamThread(auth.userId, conversationId);
    if (thread.resolved_at) throw badRequest('It’s already resolved.');
    await ctx.db
      .updateTable('business_threads')
      .set({
        resolved_at: ctx.now(),
        resolved_by: auth.userId,
        escalated_at: null,
        escalated_by: null,
        escalation_note: null,
        updated_at: ctx.now(),
      })
      .where('conversation_id', '=', conversationId)
      .execute();
    return changed(auth.userId, thread, 'resolved');
  });

  app.post('/business/:conversationId/reopen', async (req) => {
    const auth = requireAuth(req);
    const { conversationId } = parse(threadParam, req.params);
    const { thread } = await teamThread(auth.userId, conversationId);
    if (!thread.resolved_at) throw badRequest('It’s open already.');
    await ctx.db
      .updateTable('business_threads')
      .set({ resolved_at: null, resolved_by: null, updated_at: ctx.now() })
      .where('conversation_id', '=', conversationId)
      .execute();
    return changed(auth.userId, thread, 'reopened');
  });

  /** Escalating asks the owners and admins to look (PRD §38, "requires attention"). */
  app.post('/business/:conversationId/escalate', async (req) => {
    const auth = requireAuth(req);
    const { conversationId } = parse(threadParam, req.params);
    const { note } = parse(EscalateThreadBody, req.body ?? {});
    const { thread } = await teamThread(auth.userId, conversationId);
    if (thread.resolved_at) throw badRequest('Reopen it first.');
    await ctx.db
      .updateTable('business_threads')
      .set({
        escalated_at: ctx.now(),
        escalated_by: auth.userId,
        escalation_note: note || null,
        updated_at: ctx.now(),
      })
      .where('conversation_id', '=', conversationId)
      .execute();
    const managers = await ctx.db
      .selectFrom('org_members')
      .select(['user_id', 'role'])
      .where('org_id', '=', thread.org_id)
      .where('left_at', 'is', null)
      .execute();
    const me = await ctx.db
      .selectFrom('users')
      .select('display_name')
      .where('id', '=', auth.userId)
      .executeTakeFirstOrThrow();
    const about = await describe(thread);
    for (const m of managers) {
      if (m.user_id === auth.userId || !canManageOrg(m.role)) continue;
      await notify(ctx, {
        userId: m.user_id,
        kind: 'business',
        level: 'attention',
        title: `${me.display_name} escalated a conversation`,
        body: note ? `${about}: ${note}` : about,
        data: { conversationId, orgId: thread.org_id },
        groupKey: `conv:${conversationId}`,
      });
    }
    return changed(auth.userId, thread, 'escalated');
  });

  app.delete('/business/:conversationId/escalation', async (req) => {
    const auth = requireAuth(req);
    const { conversationId } = parse(threadParam, req.params);
    const { thread } = await teamThread(auth.userId, conversationId);
    await ctx.db
      .updateTable('business_threads')
      .set({ escalated_at: null, escalated_by: null, escalation_note: null, updated_at: ctx.now() })
      .where('conversation_id', '=', conversationId)
      .execute();
    return changed(auth.userId, thread, 'deescalated');
  });
}
