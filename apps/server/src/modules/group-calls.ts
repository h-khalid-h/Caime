/**
 * Group calls (PRD §47): start one in a group conversation of up to GROUP_CALL_MAX people, join
 * it on one device, turn it down, leave it, and pass offers, answers and candidates between two
 * joined devices. The work is in lib/group-calls.ts; the media never reaches the server.
 */
import {
  CALL_RING_SECONDS,
  CallDeviceBody,
  GROUP_CALL_MAX,
  GroupCallSignalBody,
  type GroupCallView,
  StartCallBody,
  uuidv7,
} from '@caishy/core';
import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { z } from 'zod';
import type { AppContext } from '../context';
import type { Call } from '../db/schema';
import { AppError, badRequest, forbidden, notFound } from '../lib/errors';
import {
  groupCallView,
  inACall,
  joinedGroupCallOf,
  keptApartFrom,
  liveGroupCallIn,
  publishGroupCall,
  ringingGroupCallFor,
  ringStoppedFor,
  settleGroupCall,
} from '../lib/group-calls';
import { participantsOf } from '../lib/messages';
import { notify } from '../lib/notify';
import { parse } from '../lib/validate';
import { requireAuth } from '../plugins/auth';
import { membership } from './conversations';

export async function groupCallRoutes(app: FastifyInstance, ctx: AppContext) {
  const callParam = z.object({ id: z.string().uuid() });
  const over = (call?: GroupCallView) =>
    new AppError(409, 'call_ended', 'That call has ended.', call ? { call } : undefined);
  const busy = () => new AppError(409, 'in_call', 'You’re already in a call.');

  /** Who in a conversation can be in its call: people in it (not a request still open). */
  async function callable(conversationId: string) {
    const people = await participantsOf(ctx.db, conversationId);
    const ids = people
      .filter((p) => p.request_state !== 'pending' && p.request_state !== 'declined')
      .map((p) => p.user_id);
    if (!ids.length) return [];
    return ctx.db
      .selectFrom('users')
      .select(['id', 'display_name'])
      .where('id', 'in', ids)
      .where('kind', '=', 'human')
      .where('deleted_at', 'is', null)
      .execute();
  }

  /**
   * A group call in a conversation this person is in, or was rung for or joined: otherwise it
   * doesn't exist for them.
   */
  async function theirs(userId: string, callId: string): Promise<Call> {
    const call = await ctx.db
      .selectFrom('calls')
      .selectAll()
      .where('id', '=', callId)
      .where('is_group', '=', true)
      .executeTakeFirst();
    if (!call) throw notFound('That call');
    const [inConversation, member] = await Promise.all([
      ctx.db
        .selectFrom('participants')
        .select('user_id')
        .where('conversation_id', '=', call.conversation_id)
        .where('user_id', '=', userId)
        .where('left_at', 'is', null)
        .executeTakeFirst(),
      ctx.db
        .selectFrom('call_members')
        .select('user_id')
        .where('call_id', '=', callId)
        .where('user_id', '=', userId)
        .executeTakeFirst(),
    ]);
    if (!inConversation && !member) throw notFound('That call');
    return call;
  }

  /** The call ringing for me, or the one I'm in: a page opened mid-call finds it. */
  app.get('/group-calls/live', async (req): Promise<{ call: GroupCallView | null }> => {
    const auth = requireAuth(req);
    const call =
      (await joinedGroupCallOf(ctx, auth.userId)) ?? (await ringingGroupCallFor(ctx, auth.userId));
    return { call: call ? await groupCallView(ctx, call, auth.userId) : null };
  });

  /** The call on in a conversation now, for the banner that offers to join it. */
  app.get('/conversations/:id/group-call', async (req): Promise<{ call: GroupCallView | null }> => {
    const auth = requireAuth(req);
    const { id } = parse(callParam, req.params);
    await membership(ctx, auth.userId, id);
    const call = await liveGroupCallIn(ctx, id);
    return { call: call ? await groupCallView(ctx, call, auth.userId) : null };
  });

  /** Start a call: everyone else who can take part is rung, and it's on until they've answered. */
  app.post(
    '/conversations/:id/group-calls',
    async (req, reply): Promise<{ call: GroupCallView }> => {
      const auth = requireAuth(req);
      const { id } = parse(callParam, req.params);
      const body = parse(StartCallBody, req.body);
      const { conversation } = await membership(ctx, auth.userId, id);
      if (conversation.kind !== 'group')
        throw badRequest('Group calls are for group conversations.');
      const people = await callable(id);
      const me = people.find((p) => p.id === auth.userId);
      if (!me) throw forbidden('You can call once you’ve joined the conversation.');
      if (people.length > GROUP_CALL_MAX)
        throw badRequest(`Calls are for groups of up to ${GROUP_CALL_MAX} people.`);
      ctx.limiter.hit(`call:${auth.userId}`, ctx.config.isTest ? 1000 : 20, 10 * 60_000);
      if (await inACall(ctx, auth.userId)) throw busy();
      if (await liveGroupCallIn(ctx, id))
        throw new AppError(409, 'call_on', 'There’s a call on here already: join it.');
      // Everyone who can take part is rung, except anyone kept apart from whoever calls.
      const apart = await keptApartFrom(
        ctx,
        ctx.db,
        auth.userId,
        people.map((p) => p.id),
      );
      const rung = people.filter((p) => p.id !== auth.userId && !apart.has(p.id));
      if (!rung.length) throw badRequest('There’s nobody to call here.');

      const now = ctx.now();
      let call: Call;
      try {
        call = await ctx.db.transaction().execute(async (trx) => {
          const row = await trx
            .insertInto('calls')
            .values({
              id: uuidv7(),
              conversation_id: id,
              caller_id: auth.userId,
              callee_id: null,
              kind: body.kind,
              state: 'ringing',
              caller_device: body.deviceId,
              created_at: now,
              seen_at: now,
              caller_seen_at: now,
              is_group: true,
            })
            .returningAll()
            .executeTakeFirstOrThrow();
          await trx
            .insertInto('call_members')
            .values([
              {
                call_id: row.id,
                user_id: auth.userId,
                state: 'joined',
                device: body.deviceId,
                rung_at: now,
                joined_at: now,
                seen_at: now,
              },
              ...rung.map((p) => ({
                call_id: row.id,
                user_id: p.id,
                state: 'ringing' as const,
                rung_at: now,
              })),
            ])
            .execute();
          return row;
        });
      } catch (err) {
        // Two people started one at once: the other's is the call (one per conversation).
        if ((err as { code?: string }).code === '23505')
          throw new AppError(409, 'call_on', 'There’s a call on here already: join it.');
        throw err;
      }
      await publishGroupCall(
        ctx,
        call,
        rung.map((p) => p.id),
      );
      // A group someone has muted doesn't ring their phone; it still rings in the app.
      const muted = new Set(
        (
          await ctx.db
            .selectFrom('participants')
            .select('user_id')
            .where('conversation_id', '=', id)
            .where('muted_until', '>', now)
            .execute()
        ).map((p) => p.user_id),
      );
      for (const p of rung)
        await notify(ctx, {
          userId: p.id,
          kind: 'call',
          level: 'urgency',
          title: `${me.display_name} is calling ${conversation.title ?? 'the group'}`,
          body: body.kind === 'video' ? 'Group video call' : 'Group voice call',
          data: { conversationId: id, callId: call.id },
          groupKey: `call:${call.id}`,
          delivery: muted.has(p.id) ? 'silent' : 'push',
          // It's news only while it rings; and the phone apps can't answer a call yet.
          ttlSeconds: CALL_RING_SECONDS,
          pushTo: 'web',
        });
      reply.status(201);
      return { call: await groupCallView(ctx, call, auth.userId) };
    },
  );

  /**
   * Joined, on this device: from the ring, or later from the conversation while it's on. The
   * second person in makes it a call. Joining again from another device moves them to it.
   */
  app.post('/group-calls/:id/join', async (req): Promise<{ call: GroupCallView }> => {
    const auth = requireAuth(req);
    const { id } = parse(callParam, req.params);
    const { deviceId } = parse(CallDeviceBody, req.body);
    const call = await theirs(auth.userId, id);
    if (call.state === 'ended') throw over(await groupCallView(ctx, call, auth.userId));
    if (!(await callable(call.conversation_id)).some((p) => p.id === auth.userId))
      throw forbidden('You can join once you’ve joined the conversation.');
    if (await inACall(ctx, auth.userId, id)) throw busy();
    const joined = await ctx.db.transaction().execute(async (trx) => {
      // One join at a time, so the call never takes more than it holds.
      const locked = await trx
        .selectFrom('calls')
        .selectAll()
        .where('id', '=', id)
        .forUpdate()
        .executeTakeFirstOrThrow();
      if (locked.state === 'ended') return locked;
      const inIt = (
        await trx
          .selectFrom('call_members')
          .select('user_id')
          .where('call_id', '=', id)
          .where('state', '=', 'joined')
          .execute()
      )
        .map((m) => m.user_id)
        .filter((u) => u !== auth.userId);
      if (inIt.length >= GROUP_CALL_MAX) throw new AppError(409, 'call_full', 'This call is full.');
      // Nobody joins a call with someone they're kept apart from (a block, R29).
      if ((await keptApartFrom(ctx, trx, auth.userId, inIt)).size)
        throw forbidden('You can’t join this call.');
      const now = ctx.now();
      await trx
        .insertInto('call_members')
        .values({
          call_id: id,
          user_id: auth.userId,
          state: 'joined',
          device: deviceId,
          rung_at: now,
          joined_at: now,
          seen_at: now,
        })
        .onConflict((oc) =>
          oc.columns(['call_id', 'user_id']).doUpdateSet({
            state: 'joined',
            device: deviceId,
            joined_at: now,
            seen_at: now,
            left_at: null,
          }),
        )
        .execute();
      // The second person in makes it a call; any join is news to the others (`rev`).
      return trx
        .updateTable('calls')
        .set(
          locked.state === 'ringing' && inIt.length
            ? { state: 'active', answered_at: now, rev: sql`rev + 1` }
            : { rev: sql`rev + 1` },
        )
        .where('id', '=', id)
        .returningAll()
        .executeTakeFirstOrThrow();
    });
    if (joined.state === 'ended') throw over(await groupCallView(ctx, joined, auth.userId));
    await ringStoppedFor(ctx, id, [auth.userId]);
    await publishGroupCall(ctx, joined);
    return { call: await groupCallView(ctx, joined, auth.userId) };
  });

  /** Turned down: it stops ringing for them, and a call nobody else is rung for ends. */
  app.post('/group-calls/:id/decline', async (req): Promise<{ call: GroupCallView }> => {
    const auth = requireAuth(req);
    const { id } = parse(callParam, req.params);
    await theirs(auth.userId, id);
    await ctx.db
      .updateTable('call_members')
      .set({ state: 'declined' })
      .where('call_id', '=', id)
      .where('user_id', '=', auth.userId)
      .where('state', '=', 'ringing')
      .execute();
    await ringStoppedFor(ctx, id, [auth.userId]);
    const now = await settleGroupCall(ctx, id);
    if (!now) throw notFound('That call');
    return { call: await groupCallView(ctx, now, auth.userId) };
  });

  /** Left: the call goes on for the others, and ends when fewer than two are left in it. */
  app.post('/group-calls/:id/leave', async (req): Promise<{ call: GroupCallView }> => {
    const auth = requireAuth(req);
    const { id } = parse(callParam, req.params);
    await theirs(auth.userId, id);
    await ctx.db
      .updateTable('call_members')
      .set({ state: 'left', left_at: ctx.now(), device: null })
      .where('call_id', '=', id)
      .where('user_id', '=', auth.userId)
      .where('state', '=', 'joined')
      .execute();
    const now = await settleGroupCall(ctx, id);
    if (!now) throw notFound('That call');
    return { call: await groupCallView(ctx, now, auth.userId) };
  });

  /**
   * An offer, an answer or a candidate from one joined device to another, and only to it: no
   * device that isn't in the call can send or be sent one.
   */
  app.post('/group-calls/:id/signal', async (req) => {
    const auth = requireAuth(req);
    const { id } = parse(callParam, req.params);
    const body = parse(GroupCallSignalBody, req.body);
    const call = await theirs(auth.userId, id);
    if (call.state === 'ended') throw over();
    const joined = await ctx.db
      .selectFrom('call_members')
      .select(['user_id', 'device'])
      .where('call_id', '=', id)
      .where('state', '=', 'joined')
      .execute();
    const mine = joined.find((m) => m.user_id === auth.userId);
    const to = joined.find((m) => m.device === body.to && m.user_id !== auth.userId);
    if (!mine || mine.device !== body.deviceId || !to)
      throw forbidden('This device isn’t in that call.');
    ctx.limiter.hit(`call-signal:${id}:${auth.userId}`, ctx.config.isTest ? 10_000 : 600, 60_000);
    // An offer or an answer for each of the others, and one more each per reconnect; only
    // candidates are many.
    if (body.sdp)
      ctx.limiter.hit(`call-sdp:${id}:${auth.userId}`, 20 * GROUP_CALL_MAX, 10 * 60_000);
    await ctx.bus.publish([to.user_id], {
      type: 'groupcall.signal',
      data: {
        callId: id,
        from: body.deviceId,
        to: body.to,
        kind: body.kind,
        sdp: body.sdp ?? null,
        candidate: body.candidate
          ? {
              candidate: body.candidate.candidate,
              sdpMid: body.candidate.sdpMid ?? null,
              sdpMLineIndex: body.candidate.sdpMLineIndex ?? null,
              usernameFragment: body.candidate.usernameFragment ?? null,
            }
          : null,
      },
    });
    return { ok: true };
  });

  /**
   * Still here, from the device in the call: one that stops saying so is taken out of it. It
   * answers with how the call stands, for a device that missed an event.
   */
  app.post('/group-calls/:id/alive', async (req): Promise<{ call: GroupCallView }> => {
    const auth = requireAuth(req);
    const { id } = parse(callParam, req.params);
    const { deviceId } = parse(CallDeviceBody, req.body);
    const call = await theirs(auth.userId, id);
    if (call.state === 'ended') throw over(await groupCallView(ctx, call, auth.userId));
    const seen = await ctx.db
      .updateTable('call_members')
      .set({ seen_at: ctx.now() })
      .where('call_id', '=', id)
      .where('user_id', '=', auth.userId)
      .where('state', '=', 'joined')
      .where('device', '=', deviceId)
      .returning('user_id')
      .executeTakeFirst();
    // Taken out (the sweep, a block) or moved to another device: this one isn't in it.
    if (!seen)
      throw new AppError(403, 'not_in_call', 'This device isn’t in that call.', {
        call: await groupCallView(ctx, call, auth.userId),
      });
    return { call: await groupCallView(ctx, call, auth.userId) };
  });
}
