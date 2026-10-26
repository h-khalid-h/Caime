import {
  CALL_RING_SECONDS,
  CallDeviceBody,
  CallEntryBody,
  type CallHistoryResponse,
  CallSignalBody,
  type IceConfigView,
  StartCallBody,
  tr,
  uuidv7,
} from '@caime/core';
import type { CallResponse, LiveCallsResponse, OkResponse } from '@caime/core/api';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context';
import type { Call } from '../db/schema';
import { meetingNow } from '../lib/call-cards';
import { answerOnEntry, reconcileNotes } from '../lib/call-notes';
import {
  callHistory,
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
  teamRingsOf,
} from '../lib/calls';
import { membership } from '../lib/conversation-views';
import { AppError, badRequest, forbidden, notFound } from '../lib/errors';
import { groupCallView, joinedGroupCallOf, ringingGroupCallFor } from '../lib/group-calls';
import { callLinkIn, sessionLive } from '../lib/meeting-join';
import { participantsOf } from '../lib/messages';
import { notify } from '../lib/notify';
import { declineTeamRing, placeOrgCall } from '../lib/org-calls';
import { personViewsFor } from '../lib/people-batch';
import { isBlockedEitherWay } from '../lib/relations';
import { parse } from '../lib/validate';
import { requireAuth } from '../plugins/auth';

const EndCallBody = z
  .object({
    deviceId: z.string().max(64).optional(),
    /** The two devices never connected. */
    failed: z.boolean().optional(),
  })
  .strict();

export async function callRoutes(app: FastifyInstance, ctx: AppContext) {
  const callParam = z.object({ id: z.string().uuid() });

  /**
   * A call this person is on, or rang for them on an organization's team (M16 H8a), or it doesn't
   * exist for them.
   */
  async function mine(userId: string, callId: string): Promise<Call> {
    const call = await ctx.db
      .selectFrom('calls')
      .selectAll()
      .where('id', '=', callId)
      .where('is_group', '=', false)
      .where((eb) =>
        eb.or([
          eb('caller_id', '=', userId),
          eb('callee_id', '=', userId),
          eb.exists(
            eb
              .selectFrom('call_team_rings as r')
              .select('r.call_id')
              .whereRef('r.call_id', '=', 'calls.id')
              .where('r.user_id', '=', userId),
          ),
        ]),
      )
      .executeTakeFirst();
    if (!call) throw notFound(tr('That call'));
    return call;
  }

  /** In the call itself: its caller or whoever answered, never the rest of a team it rang. */
  function inIt(call: Call, userId: string): void {
    if (call.caller_id !== userId && call.callee_id !== userId)
      throw forbidden(tr('This device isn’t in that call.'));
  }

  /**
   * One of the team a customer's call rang turns it down (M16 H8a): their ring stops on every
   * device of theirs; once nobody on the team is left ringing, it's missed, as a call nobody
   * answered (the customer is never told who turned it down).
   */
  async function declineForTeam(call: Call, userId: string): Promise<CallResponse> {
    if (call.state !== 'ringing' || call.callee_id) throw over();
    const nobodyLeft = await declineTeamRing(ctx, call, userId);
    await ringStopped(ctx, call, { only: [userId] });
    if (nobodyLeft) {
      const ended = await endCall(ctx, call, 'missed');
      return { call: await callView(ctx, ended ?? call, userId) };
    }
    const view = await callView(ctx, call, userId);
    await ctx.bus.publish([userId], { type: 'call.updated', data: view });
    return { call: view };
  }
  const over = () => new AppError(409, 'call_ended', tr('That call has ended.'));

  app.get('/calls/ice', async (req): Promise<IceConfigView> => {
    const auth = requireAuth(req);
    // A relay is paid for by the minute: a call asks a handful of times, a loop asks for a relay
    // of its own.
    ctx.limiter.hit(`ice:${auth.userId}`, ctx.config.isTest ? 1000 : 60, 3_600_000);
    return await iceConfig(ctx, auth.userId);
  });

  /** My calls, newest first (PRD §47): all of them, with one person, or the ones I missed. */
  app.get('/calls/history', async (req): Promise<CallHistoryResponse> => {
    const auth = requireAuth(req);
    const q = parse(
      z
        .object({
          before: z.string().uuid().optional(),
          limit: z.coerce.number().int().min(1).max(100).default(30),
          with: z.string().uuid().optional(),
          missed: z.enum(['1', 'true']).optional(),
        })
        .strict(),
      req.query,
    );
    return callHistory(ctx, auth.userId, {
      before: q.before,
      limit: q.limit,
      withId: q.with,
      missed: Boolean(q.missed),
    });
  });

  /**
   * What's live for me now, both kinds in one answer: the one-to-one call ringing or running,
   * and the group call I'm in or that rings for me. A page opened mid-call finds it, and a
   * socket that connects asks once (`/group-calls/live` still answers the group call alone).
   */
  app.get('/calls/live', async (req): Promise<LiveCallsResponse> => {
    const auth = requireAuth(req);
    const [call, group] = await Promise.all([
      liveCallOf(ctx, auth.userId),
      joinedGroupCallOf(ctx, auth.userId).then((g) => g ?? ringingGroupCallFor(ctx, auth.userId)),
    ]);
    const [view, groupView] = await Promise.all([
      call ? callView(ctx, call, auth.userId) : null,
      group ? groupCallView(ctx, group, auth.userId) : null,
    ]);
    return { call: view, groupCall: groupView };
  });

  app.post('/conversations/:id/calls', async (req, reply): Promise<CallResponse> => {
    const auth = requireAuth(req);
    const { id } = parse(callParam, req.params);
    const body = parse(StartCallBody, req.body);
    const { conversation } = await membership(ctx, auth.userId, id);
    // A customer calls the organization (M16 H8a): its team rings, whoever answers takes it.
    if (conversation.kind === 'business' && !auth.guest) {
      ctx.limiter.hit(`call:${auth.userId}`, ctx.config.isTest ? 1000 : 20, 10 * 60_000);
      const placed = await placeOrgCall(ctx, {
        conversationId: id,
        callerId: auth.userId,
        kind: body.kind,
        deviceId: body.deviceId,
      });
      ctx.metrics.orgCalls.inc({ outcome: 'placed' });
      reply.status(201);
      await publishCall(ctx, placed.call, 'call.ringing');
      for (const userId of placed.team) {
        // By the name they know the customer by, and the organization it's for.
        const customer = await nameShownTo(ctx, userId, auth.userId);
        await notify(ctx, {
          userId,
          kind: 'call',
          level: 'urgency',
          title: () =>
            tr('{name} is calling {orgName}', {
              name: customer ?? tr('Someone'),
              orgName: placed.orgName,
            }),
          body: () => (body.kind === 'video' ? tr('Video call') : tr('Voice call')),
          data: { conversationId: id, callId: placed.call.id },
          groupKey: `call:${placed.call.id}`,
          ttlSeconds: CALL_RING_SECONDS,
          pushTo: 'web',
        });
      }
      return { call: await callView(ctx, placed.call, auth.userId) };
    }
    if (conversation.kind !== 'direct')
      throw badRequest(tr('Calls are for conversations between two people.'));
    const people = await participantsOf(ctx.db, id);
    const other = people.find((p) => p.user_id !== auth.userId);
    if (!other) throw badRequest(tr('There’s nobody to call here.'));
    const callee = await ctx.db
      .selectFrom('users')
      .select(['display_name', 'kind', 'presence'])
      .where('id', '=', other.user_id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    // Someone reached by mail (a page's booker, whoever a meeting held here was mailed to) is in a
    // call here by their own link alone, taken, to a card here that's asked or agreed (M16 F6c):
    // the link is the invitation, so it answers a request as a reply does.
    const link = auth.guest
      ? await callLinkIn(ctx, id, auth.userId)
      : callee?.kind === 'provisional'
        ? await callLinkIn(ctx, id, other.user_id)
        : null;
    const byLink = link === 'taken';
    if (auth.guest && !byLink) throw new AppError(403, 'guest_route', tr('A guest can’t do this.'));
    // Someone who hasn't accepted a message request can't be rung either (R14).
    if (
      !byLink &&
      people.some((p) => p.request_state === 'pending' || p.request_state === 'declined')
    )
      throw new AppError(
        403,
        'awaiting_acceptance',
        tr('You can call once your message request is accepted.'),
      );
    if (await isBlockedEitherWay(ctx.db, auth.userId, other.user_id))
      throw forbidden(tr('You can’t call this person.'));
    if (callee?.kind === 'provisional') {
      const name = callee.display_name;
      if (!link)
        throw badRequest(
          tr(
            '{name} isn’t on Caime yet. A meeting held on Caime mails {name} a link to its call.',
            {
              name,
            },
          ),
        );
      // Their page rings while it's open to them: a link not taken yet, or no session left, and
      // nothing would.
      if (!byLink || !(await sessionLive(ctx, other.user_id)))
        throw badRequest(
          tr(
            '{name} hasn’t opened the link Caime mailed yet. When {name} joins from it, the call rings here.',
            { name },
          ),
        );
    } else if (callee?.kind !== 'human') throw badRequest(tr('There’s nobody to call here.'));
    ctx.limiter.hit(`call:${auth.userId}`, ctx.config.isTest ? 1000 : 20, 10 * 60_000);
    // "On another call" says they're around right now: only to someone who may see that.
    const shown = (await personViewsFor(ctx, auth.userId, [other.user_id])).get(other.user_id);
    const mayKnowBusy = shown?.presence != null && callee.presence !== 'invisible';
    // The meeting it is, when one held here can be joined now (M16 F6e).
    const cardId = await meetingNow(ctx.db, conversation, ctx.now());
    const { call, rung } = await ctx.db.transaction().execute(async (trx) => {
      await lockCallEntry(trx, auth.userId);
      if (
        (await liveCallOf(ctx, auth.userId, trx)) ||
        (await joinedGroupCallOf(ctx, auth.userId, trx))
      )
        throw new AppError(409, 'in_call', tr('You’re already in a call.'));
      let rung = true;
      if (
        (await liveCallOf(ctx, other.user_id, trx)) ||
        (await joinedGroupCallOf(ctx, other.user_id, trx))
      ) {
        if (mayKnowBusy)
          throw new AppError(
            409,
            'busy',
            tr('{name} is on another call.', { name: shown?.displayName ?? callee.display_name }),
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
          card_id: cardId,
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
    // Someone reached by mail hears it on their page alone: never notified (R75).
    if (callee.kind !== 'human') return { call: await callView(ctx, call, auth.userId) };
    // By the name they know the caller by.
    const me = await nameShownTo(ctx, other.user_id, auth.userId);
    await notify(ctx, {
      userId: other.user_id,
      kind: 'call',
      level: 'urgency',
      title: () => tr('{name} is calling', { name: me ?? tr('Someone') }),
      body: () => (body.kind === 'video' ? tr('Video call') : tr('Voice call')),
      data: { conversationId: id, callId: call.id },
      groupKey: `call:${call.id}`,
      // It's news only while it rings; and the phone apps can't answer a call yet.
      ttlSeconds: CALL_RING_SECONDS,
      pushTo: 'web',
    });
    return { call: await callView(ctx, call, auth.userId) };
  });

  /** Answered on this device: the others stop ringing, and signals go only to this one. */
  app.post('/calls/:id/accept', async (req): Promise<CallResponse> => {
    const auth = requireAuth(req);
    const { id } = parse(callParam, req.params);
    const { deviceId, notes, notesId, canRecord } = parse(CallEntryBody, req.body);
    const call = await mine(auth.userId, id);
    // A customer's call to an organization (M16 H8a): anyone on the team it still rings for takes
    // it, the first of them.
    const forTeam = Boolean(call.org_id) && call.caller_id !== auth.userId;
    if (forTeam) {
      if (call.callee_id || !(await teamRingsOf(ctx.db, id)).ringing.includes(auth.userId))
        throw over();
    } else if (call.callee_id !== auth.userId)
      throw forbidden(tr('Only the person called can answer.'));
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
        throw new AppError(409, 'in_call', tr('You’re already in a call.'));
      // Answered with Cai taking notes or without (R85 (1)), with the answer itself.
      await answerOnEntry(
        trx,
        id,
        auth.userId,
        notes,
        { deviceId, canRecord: canRecord ?? false, notesId },
        ctx.now(),
      );
      return trx
        .updateTable('calls')
        .set({
          state: 'active',
          // The first of the team to answer takes it (M16 H8a).
          ...(forTeam ? { callee_id: auth.userId } : {}),
          callee_device: deviceId,
          answered_at: ctx.now(),
          seen_at: ctx.now(),
          caller_seen_at: ctx.now(),
          callee_seen_at: ctx.now(),
        })
        .where('id', '=', id)
        .where('state', '=', 'ringing')
        .$if(forTeam, (q) => q.where('callee_id', 'is', null))
        .returningAll()
        .executeTakeFirst();
    });
    if (!answered) throw over();
    if (forTeam) ctx.metrics.orgCalls.inc({ outcome: 'answered' });
    await ringStopped(ctx, answered);
    await reconcileNotes(ctx, id);
    await publishCall(ctx, answered);
    return { call: await callView(ctx, answered, auth.userId) };
  });

  app.post('/calls/:id/decline', async (req): Promise<CallResponse> => {
    const auth = requireAuth(req);
    const { id } = parse(callParam, req.params);
    const call = await mine(auth.userId, id);
    if (call.org_id && call.caller_id !== auth.userId) return declineForTeam(call, auth.userId);
    if (call.callee_id !== auth.userId) throw forbidden(tr('Only the person called can decline.'));
    if (call.state !== 'ringing') throw over();
    const ended = (await endCall(ctx, call, 'declined')) ?? call;
    return { call: await callView(ctx, ended, auth.userId) };
  });

  /** Hang up: before it's answered the caller calls it off; after, either side ends it. */
  app.post('/calls/:id/end', async (req): Promise<CallResponse> => {
    const auth = requireAuth(req);
    const { id } = parse(callParam, req.params);
    const body = parse(EndCallBody, req.body ?? {});
    const call = await mine(auth.userId, id);
    if (call.state === 'ended') return { call: await callView(ctx, call, auth.userId) };
    // Someone on the team a customer's call rang, who isn't in it (M16 H8a): hanging up while it
    // rings is turning it down; once a colleague has it, it isn't theirs to end.
    if (call.org_id && call.caller_id !== auth.userId && call.callee_id !== auth.userId) {
      if (call.state === 'ringing' && !call.callee_id) return declineForTeam(call, auth.userId);
      return { call: await callView(ctx, call, auth.userId) };
    }
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
  app.post('/calls/:id/signal', async (req): Promise<OkResponse> => {
    const auth = requireAuth(req);
    const { id } = parse(callParam, req.params);
    const body = parse(CallSignalBody, req.body);
    const call = await mine(auth.userId, id);
    if (call.state === 'ended') throw over();
    inIt(call, auth.userId);
    const caller = call.caller_id === auth.userId;
    const myDevice = caller ? call.caller_device : call.callee_device;
    const theirDevice = caller ? call.callee_device : call.caller_device;
    if (body.deviceId !== myDevice || !theirDevice)
      throw forbidden(tr('This device isn’t in that call.'));
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
  app.post('/calls/:id/alive', async (req): Promise<CallResponse> => {
    const auth = requireAuth(req);
    const { id } = parse(callParam, req.params);
    const { deviceId } = parse(CallDeviceBody, req.body);
    const call = await mine(auth.userId, id);
    inIt(call, auth.userId);
    const caller = call.caller_id === auth.userId;
    if (deviceId !== (caller ? call.caller_device : call.callee_device))
      throw forbidden(tr('This device isn’t in that call.'));
    const now =
      call.state === 'ended' ? undefined : await stillThere(ctx, id, caller ? 'caller' : 'callee');
    // Over: say how it ended, for a device that missed the event.
    if (!now) {
      const ended = await ctx.db
        .selectFrom('calls')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirstOrThrow();
      throw new AppError(409, 'call_ended', tr('That call has ended.'), {
        call: await callView(ctx, ended, auth.userId),
      });
    }
    return { call: await callView(ctx, now, auth.userId) };
  });
}
