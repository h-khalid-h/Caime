/**
 * Block and report (PRD §55). Blocking is silent: the blocked person just stops reaching you.
 */
import { ReportBody, uuidv7 } from '@caishy/core';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context';
import { endCallsBetween } from '../lib/calls';
import { withdrawDuplicatesOf } from '../lib/duplicates';
import { badRequest } from '../lib/errors';
import { leaveGroupCallsWith } from '../lib/group-calls';
import { pairKey } from '../lib/relations';
import { parse } from '../lib/validate';
import { requireAuth } from '../plugins/auth';

export async function safetyRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get('/blocks', async (req) => {
    const auth = requireAuth(req);
    const rows = await ctx.db
      .selectFrom('blocks')
      .innerJoin('users', 'users.id', 'blocks.blocked_id')
      .select(['users.id', 'users.display_name', 'users.handle', 'blocks.created_at'])
      .where('blocks.blocker_id', '=', auth.userId)
      .orderBy('blocks.created_at', 'desc')
      .execute();
    const orgs = await ctx.db
      .selectFrom('org_blocks as b')
      .innerJoin('organizations as o', 'o.id', 'b.org_id')
      .select(['o.id', 'o.name', 'o.handle', 'b.created_at'])
      .where('b.user_id', '=', auth.userId)
      .orderBy('b.created_at', 'desc')
      .execute();
    return {
      blocked: rows.map((r) => ({
        id: r.id,
        displayName: r.display_name,
        handle: r.handle,
        since: r.created_at.toISOString(),
      })),
      orgs: orgs.map((o) => ({
        id: o.id,
        name: o.name,
        handle: o.handle,
        since: o.created_at.toISOString(),
      })),
    };
  });

  app.post('/blocks', async (req) => {
    const auth = requireAuth(req);
    const { userId } = parse(z.object({ userId: z.string().uuid() }), req.body);
    if (userId === auth.userId) throw badRequest('You can’t block yourself.');
    await ctx.db
      .insertInto('blocks')
      .values({ blocker_id: auth.userId, blocked_id: userId })
      .onConflict((oc) => oc.doNothing())
      .execute();
    // A call between them ends now, pending requests quietly end, and neither is offered as one
    // of the other's duplicates.
    await endCallsBetween(ctx, auth.userId, userId);
    await withdrawDuplicatesOf(ctx.db, auth.userId, userId);
    await leaveGroupCallsWith(ctx, auth.userId, userId);
    await ctx.db
      .updateTable('connection_requests')
      .set({ status: 'cancelled', responded_at: ctx.now() })
      .where('status', '=', 'pending')
      .where((eb) =>
        eb.or([
          eb.and([eb('from_user', '=', auth.userId), eb('to_user', '=', userId)]),
          eb.and([eb('from_user', '=', userId), eb('to_user', '=', auth.userId)]),
        ]),
      )
      .execute();
    // Nor does either of them start a topic with the other from a suggestion made before.
    const { key } = pairKey(auth.userId, userId);
    await ctx.db
      .updateTable('suggestions')
      .set({ status: 'expired', resolved_at: ctx.now() })
      .where('kind', '=', 'topic')
      .where('status', '=', 'pending')
      .where('user_id', 'in', [auth.userId, userId])
      .where('conversation_id', 'in', (eb) =>
        eb.selectFrom('conversations').select('id').where('direct_key', '=', key),
      )
      .execute();
    // Nor is either offered what the other may be to them (taken back, not answered: unblocked,
    // it may be offered again).
    const offers = await ctx.db
      .deleteFrom('suggestions')
      .where('kind', '=', 'relationship')
      .where('status', '=', 'pending')
      .where((eb) =>
        eb.or([
          eb.and([eb('user_id', '=', auth.userId), eb('subject_user_id', '=', userId)]),
          eb.and([eb('user_id', '=', userId), eb('subject_user_id', '=', auth.userId)]),
        ]),
      )
      .returning(['id', 'user_id'])
      .execute();
    for (const o of offers.filter((o) => o.user_id === auth.userId))
      await ctx.bus.publish([auth.userId], {
        type: 'suggestion.resolved',
        data: { id: o.id, status: 'expired' },
      });
    await ctx.bus.publish([auth.userId], {
      type: 'block.changed',
      data: { userId, blocked: true },
    });
    return { ok: true };
  });

  app.delete('/blocks/:userId', async (req) => {
    const auth = requireAuth(req);
    const { userId } = parse(z.object({ userId: z.string().uuid() }), req.params);
    await ctx.db
      .deleteFrom('blocks')
      .where('blocker_id', '=', auth.userId)
      .where('blocked_id', '=', userId)
      .execute();
    await ctx.bus.publish([auth.userId], {
      type: 'block.changed',
      data: { userId, blocked: false },
    });
    return { ok: true };
  });

  app.post('/reports', async (req, reply) => {
    const auth = requireAuth(req);
    const body = parse(ReportBody, req.body);
    if (!body.userId && !body.messageId && !body.conversationId && !body.orgId)
      throw badRequest('Choose what you’re reporting.');
    // An update is reported with its organization, and only as one of that organization's.
    if (body.updateId) {
      const update = body.orgId
        ? await ctx.db
            .selectFrom('org_updates')
            .select('id')
            .where('id', '=', body.updateId)
            .where('org_id', '=', body.orgId)
            .executeTakeFirst()
        : undefined;
      if (!update) throw badRequest('Choose what you’re reporting.');
    }
    ctx.limiter.hit(`report:${auth.userId}`, 30, 3_600_000);
    await ctx.db
      .insertInto('reports')
      .values({
        id: uuidv7(),
        reporter_id: auth.userId,
        target_user_id: body.userId ?? null,
        message_id: body.messageId ?? null,
        conversation_id: body.conversationId ?? null,
        org_id: body.orgId ?? null,
        update_id: body.updateId ?? null,
        reason: body.reason,
        details: body.details ?? null,
      })
      .execute();
    reply.status(201);
    return {
      ok: true,
      message: 'Thanks. We’ll review it. You can also block them so they can’t reach you.',
    };
  });
}
