/**
 * Calls (PRD §47): ring someone in a direct conversation, answer or decline on one device,
 * pass the WebRTC offer, answer and candidates between the two devices in the call, and hang
 * up. The work is in lib/calls.ts; the media never reaches the server.
 */
import {
  CallDeviceBody,
  CallSignalBody,
  type CallView,
  type IceConfigView,
  StartCallBody,
  uuidv7,
} from '@caishy/core';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context';
import type { Call } from '../db/schema';
import {
  callView,
  endCall,
  iceConfig,
  liveCallOf,
  otherSide,
  publishCall,
  stillThere,
} from '../lib/calls';
import { AppError, badRequest, forbidden, notFound } from '../lib/errors';
import { participantsOf } from '../lib/messages';
import { notify } from '../lib/notify';
import { isBlockedEitherWay } from '../lib/relations';
import { parse } from '../lib/validate';
import { requireAuth } from '../plugins/auth';
import { membership } from './conversations';

const EndCallBody = z
  .object({
    deviceId: z.string().max(64).optional(),
    /** The two devices never connected. */
    failed: z.boolean().optional(),
  })
  .strict();

export async function callRoutes(app: FastifyInstance, ctx: AppContext) {
  const callParam = z.object({ id: z.string().uuid() });

  /** A call this person is on, or it doesn't exist for them. */
  async function mine(userId: string, callId: string): Promise<Call> {
    const call = await ctx.db
      .selectFrom('calls')
      .selectAll()
      .where('id', '=', callId)
      .where((eb) => eb.or([eb('caller_id', '=', userId), eb('callee_id', '=', userId)]))
      .executeTakeFirst();
    if (!call) throw notFound('That call');
    return call;
  }
  const over = () => new AppError(409, 'call_ended', 'That call has ended.');

  app.get('/calls/ice', async (req): Promise<IceConfigView> => {
    const auth = requireAuth(req);
    return iceConfig(ctx, auth.userId);
  });

  /** The call ringing or running for me now: a page opened mid-call finds it. */
  app.get('/calls/live', async (req): Promise<{ call: CallView | null }> => {
    const auth = requireAuth(req);
    const call = await liveCallOf(ctx, auth.userId);
    return { call: call ? await callView(ctx, call, auth.userId) : null };
  });

  app.post('/conversations/:id/calls', async (req, reply): Promise<{ call: CallView }> => {
    const auth = requireAuth(req);
    const { id } = parse(callParam, req.params);
    const body = parse(StartCallBody, req.body);
    const { conversation } = await membership(ctx, auth.userId, id);
    if (conversation.kind !== 'direct')
      throw badRequest('Calls are for conversations between two people.');
    const people = await participantsOf(ctx.db, id);
    const other = people.find((p) => p.user_id !== auth.userId);
    if (!other) throw badRequest('There’s nobody to call here.');
    // Someone who hasn't accepted a message request can't be rung either (R14).
    if (people.some((p) => p.request_state === 'pending' || p.request_state === 'declined'))
      throw new AppError(
        403,
        'awaiting_acceptance',
        'You can call once your message request is accepted.',
      );
    if (await isBlockedEitherWay(ctx.db, auth.userId, other.user_id))
      throw forbidden('You can’t call this person.');
    const callee = await ctx.db
      .selectFrom('users')
      .select(['display_name', 'kind'])
      .where('id', '=', other.user_id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    if (callee?.kind !== 'human') throw badRequest('There’s nobody to call here.');
    ctx.limiter.hit(`call:${auth.userId}`, ctx.config.isTest ? 1000 : 20, 10 * 60_000);
    if (await liveCallOf(ctx, auth.userId))
      throw new AppError(409, 'in_call', 'You’re already in a call.');
    if (await liveCallOf(ctx, other.user_id))
      throw new AppError(409, 'busy', `${callee.display_name} is on another call.`);

    const call = await ctx.db
      .insertInto('calls')
      .values({
        id: uuidv7(),
        conversation_id: id,
        caller_id: auth.userId,
        callee_id: other.user_id,
        kind: body.kind,
        state: 'ringing',
        caller_device: body.deviceId,
        created_at: ctx.now(),
        seen_at: ctx.now(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    await publishCall(ctx, call, 'call.ringing');
    const me = await ctx.db
      .selectFrom('users')
      .select('display_name')
      .where('id', '=', auth.userId)
      .executeTakeFirstOrThrow();
    await notify(ctx, {
      userId: other.user_id,
      kind: 'call',
      level: 'urgency',
      title: `${me.display_name} is calling`,
      body: body.kind === 'video' ? 'Video call' : 'Voice call',
      data: { conversationId: id, callId: call.id },
      groupKey: `call:${call.id}`,
    });
    reply.status(201);
    return { call: await callView(ctx, call, auth.userId) };
  });

  /** Answered on this device: the others stop ringing, and signals go only to this one. */
  app.post('/calls/:id/accept', async (req): Promise<{ call: CallView }> => {
    const auth = requireAuth(req);
    const { id } = parse(callParam, req.params);
    const { deviceId } = parse(CallDeviceBody, req.body);
    const call = await mine(auth.userId, id);
    if (call.callee_id !== auth.userId) throw forbidden('Only the person called can answer.');
    const answered = await ctx.db
      .updateTable('calls')
      .set({ state: 'active', callee_device: deviceId, answered_at: ctx.now(), seen_at: ctx.now() })
      .where('id', '=', id)
      .where('state', '=', 'ringing')
      .returningAll()
      .executeTakeFirst();
    if (!answered) throw over();
    await publishCall(ctx, answered);
    return { call: await callView(ctx, answered, auth.userId) };
  });

  app.post('/calls/:id/decline', async (req): Promise<{ call: CallView }> => {
    const auth = requireAuth(req);
    const { id } = parse(callParam, req.params);
    const call = await mine(auth.userId, id);
    if (call.callee_id !== auth.userId) throw forbidden('Only the person called can decline.');
    if (call.state !== 'ringing') throw over();
    const ended = (await endCall(ctx, call, 'declined')) ?? call;
    return { call: await callView(ctx, ended, auth.userId) };
  });

  /** Hang up: before it's answered the caller calls it off; after, either side ends it. */
  app.post('/calls/:id/end', async (req): Promise<{ call: CallView }> => {
    const auth = requireAuth(req);
    const { id } = parse(callParam, req.params);
    const body = parse(EndCallBody, req.body ?? {});
    const call = await mine(auth.userId, id);
    if (call.state === 'ended') return { call: await callView(ctx, call, auth.userId) };
    const outcome =
      call.state === 'ringing'
        ? call.caller_id === auth.userId
          ? 'cancelled'
          : 'declined'
        : body.failed
          ? 'failed'
          : 'completed';
    const ended = (await endCall(ctx, call, outcome)) ?? call;
    return { call: await callView(ctx, ended, auth.userId) };
  });

  /**
   * An offer, an answer or a candidate for the other device in the call. Only the two devices
   * in it may send, and each reaches only the other, so no other tab or person can join.
   */
  app.post('/calls/:id/signal', async (req) => {
    const auth = requireAuth(req);
    const { id } = parse(callParam, req.params);
    const body = parse(CallSignalBody, req.body);
    const call = await mine(auth.userId, id);
    if (call.state === 'ended') throw over();
    const caller = call.caller_id === auth.userId;
    const myDevice = caller ? call.caller_device : call.callee_device;
    const theirDevice = caller ? call.callee_device : call.caller_device;
    if (body.deviceId !== myDevice || !theirDevice)
      throw forbidden('This device isn’t in that call.');
    ctx.limiter.hit(`call-signal:${id}:${auth.userId}`, ctx.config.isTest ? 10_000 : 300, 60_000);
    const to = otherSide(call, auth.userId);
    if (to)
      await ctx.bus.publish([to], {
        type: 'call.signal',
        data: {
          callId: id,
          from: body.deviceId,
          to: theirDevice,
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

  /** Still here: a call both sides stop saying this about is ended by the sweep. */
  app.post('/calls/:id/alive', async (req) => {
    const auth = requireAuth(req);
    const { id } = parse(callParam, req.params);
    const call = await mine(auth.userId, id);
    if (call.state === 'ended') throw over();
    await stillThere(ctx, id);
    return { ok: true };
  });
}
