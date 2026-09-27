/**
 * Calls (PRD §47): ring someone in a direct conversation, answer or decline on one device,
 * pass the WebRTC offer, answer and candidates between the two devices in the call, and hang
 * up. The work is in lib/calls.ts; the media never reaches the server.
 */
import {
  CALL_RING_SECONDS,
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
  lockCallEntry,
  nameShownTo,
  otherCallIn,
  otherSide,
  publishCall,
  ringStopped,
  stillThere,
} from '../lib/calls';
import { AppError, badRequest, forbidden, notFound } from '../lib/errors';
import { joinedGroupCallOf } from '../lib/group-calls';
import { participantsOf } from '../lib/messages';
import { notify } from '../lib/notify';
import { personViewsFor } from '../lib/people-batch';
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
      .where('is_group', '=', false)
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
      .select(['display_name', 'kind', 'presence'])
      .where('id', '=', other.user_id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    if (callee?.kind !== 'human') throw badRequest('There’s nobody to call here.');
    ctx.limiter.hit(`call:${auth.userId}`, ctx.config.isTest ? 1000 : 20, 10 * 60_000);
    // "On another call" says they're around right now: only to someone who may see that.
    const shown = (await personViewsFor(ctx, auth.userId, [other.user_id])).get(other.user_id);
    const mayKnowBusy = shown?.presence != null && callee.presence !== 'invisible';
    const { call, rung } = await ctx.db.transaction().execute(async (trx) => {
      await lockCallEntry(trx, auth.userId);
      if (
        (await liveCallOf(ctx, auth.userId, trx)) ||
        (await joinedGroupCallOf(ctx, auth.userId, trx))
      )
        throw new AppError(409, 'in_call', 'You’re already in a call.');
      let rung = true;
      if (
        (await liveCallOf(ctx, other.user_id, trx)) ||
        (await joinedGroupCallOf(ctx, other.user_id, trx))
      ) {
        if (mayKnowBusy)
          throw new AppError(
            409,
            'busy',
            `${shown?.displayName ?? callee.display_name} is on another call.`,
          );
        // To anyone else it rings like any call nobody answers, and is missed like one: they
        // aren't rung, and find it among their missed calls.
        rung = false;
      }
      const call = await trx
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
          caller_seen_at: ctx.now(),
          callee_rung: rung,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      return { call, rung };
    });
    reply.status(201);
    if (!rung) {
      await ctx.bus.publish([auth.userId], {
        type: 'call.updated',
        data: await callView(ctx, call, auth.userId),
      });
      return { call: await callView(ctx, call, auth.userId) };
    }
    await publishCall(ctx, call, 'call.ringing');
    // By the name they know the caller by.
    const me = await nameShownTo(ctx, other.user_id, auth.userId);
    await notify(ctx, {
      userId: other.user_id,
      kind: 'call',
      level: 'urgency',
      title: `${me ?? 'Someone'} is calling`,
      body: body.kind === 'video' ? 'Video call' : 'Voice call',
      data: { conversationId: id, callId: call.id },
      groupKey: `call:${call.id}`,
      // It's news only while it rings; and the phone apps can't answer a call yet.
      ttlSeconds: CALL_RING_SECONDS,
      pushTo: 'web',
    });
    return { call: await callView(ctx, call, auth.userId) };
  });

  /** Answered on this device: the others stop ringing, and signals go only to this one. */
  app.post('/calls/:id/accept', async (req): Promise<{ call: CallView }> => {
    const auth = requireAuth(req);
    const { id } = parse(callParam, req.params);
    const { deviceId } = parse(CallDeviceBody, req.body);
    const call = await mine(auth.userId, id);
    if (call.callee_id !== auth.userId) throw forbidden('Only the person called can answer.');
    // Never rung for them (they were on another call): nothing to answer.
    if (!call.callee_rung) throw over();
    const answered = await ctx.db.transaction().execute(async (trx) => {
      await lockCallEntry(trx, auth.userId);
      // One call at a time: leave a group call to take this one, or end the other 1:1 call (two
      // people calling at once can't both be answered).
      if (
        (await joinedGroupCallOf(ctx, auth.userId, trx)) ||
        (await otherCallIn(ctx, auth.userId, id, trx))
      )
        throw new AppError(409, 'in_call', 'You’re already in a call.');
      return trx
        .updateTable('calls')
        .set({
          state: 'active',
          callee_device: deviceId,
          answered_at: ctx.now(),
          seen_at: ctx.now(),
          caller_seen_at: ctx.now(),
          callee_seen_at: ctx.now(),
        })
        .where('id', '=', id)
        .where('state', '=', 'ringing')
        .returningAll()
        .executeTakeFirst();
    });
    if (!answered) throw over();
    await ringStopped(ctx, answered);
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
    // An offer or an answer is large and rare (one each, and one more per reconnect); only a
    // candidate is many. Large ones pass through the database (lib/bus.ts), so few of them.
    if (body.sdp) ctx.limiter.hit(`call-sdp:${id}:${auth.userId}`, 20, 10 * 60_000);
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

  /**
   * Still here, from the device in the call: a call either side stops saying this about is
   * ended by the sweep. It answers with how the call stands, for a device that missed an event.
   */
  app.post('/calls/:id/alive', async (req): Promise<{ call: CallView }> => {
    const auth = requireAuth(req);
    const { id } = parse(callParam, req.params);
    const { deviceId } = parse(CallDeviceBody, req.body);
    const call = await mine(auth.userId, id);
    const caller = call.caller_id === auth.userId;
    if (deviceId !== (caller ? call.caller_device : call.callee_device))
      throw forbidden('This device isn’t in that call.');
    const now =
      call.state === 'ended' ? undefined : await stillThere(ctx, id, caller ? 'caller' : 'callee');
    // Over: say how it ended, for a device that missed the event.
    if (!now) {
      const ended = await ctx.db
        .selectFrom('calls')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirstOrThrow();
      throw new AppError(409, 'call_ended', 'That call has ended.', {
        call: await callView(ctx, ended, auth.userId),
      });
    }
    return { call: await callView(ctx, now, auth.userId) };
  });
}
