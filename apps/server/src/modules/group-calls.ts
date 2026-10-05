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
  tr,
  uuidv7,
} from '@caime/core';
import type { GroupCallMaybeResponse, GroupCallResponse, OkResponse } from '@caime/core/api';
import type { FastifyInstance } from 'fastify';
import { type Kysely, sql, type Transaction } from 'kysely';
import { z } from 'zod';
import type { AppContext } from '../context';
import type { Call, Database } from '../db/schema';
import { lockCallEntry, nameShownTo } from '../lib/calls';
import { membership } from '../lib/conversation-views';
import { shownTitle } from '../lib/conversations';
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
  takeOutOfGroupCall,
} from '../lib/group-calls';
import { participantsOf } from '../lib/messages';
import { notify } from '../lib/notify';
import { parse } from '../lib/validate';
import { requireAuth } from '../plugins/auth';

export async function groupCallRoutes(app: FastifyInstance, ctx: AppContext) {
  const callParam = z.object({ id: z.string().uuid() });
  const over = (call?: GroupCallView) =>
    new AppError(409, 'call_ended', tr('That call has ended.'), call ? { call } : undefined);
  const busy = () => new AppError(409, 'in_call', tr('You’re already in a call.'));
  const callOn = () => new AppError(409, 'call_on', tr('There’s a call on here already: join it.'));
  /** Joining, turning down and leaving: plenty for anyone, never a way to flood the group. */
  const paced = (userId: string, callId: string) =>
    ctx.limiter.hit(`group-call:${callId}:${userId}`, ctx.config.isTest ? 1000 : 30, 60_000);

  /** Who in a conversation can be in its call: people in it (not a request still open). */
  async function callable(conversationId: string, db: Kysely<Database> | Transaction<Database>) {
    const people = await participantsOf(db, conversationId);
    const ids = people
      .filter((p) => p.request_state !== 'pending' && p.request_state !== 'declined')
      .map((p) => p.user_id);
    if (!ids.length) return [];
    return db
      .selectFrom('users')
      .select(['id', 'display_name'])
      .where('id', 'in', ids)
      .where('kind', '=', 'human')
      .where('deleted_at', 'is', null)
      .execute();
  }

  /**
   * A group call in a conversation this person is in; or, once they're out of the conversation,
   * one they're still rung for or in (so they can leave it). Otherwise it doesn't exist for them.
   */
  async function theirs(
    userId: string,
    callId: string,
  ): Promise<{ call: Call; outsider: boolean }> {
    const call = await ctx.db
      .selectFrom('calls')
      .selectAll()
      .where('id', '=', callId)
      .where('is_group', '=', true)
      .executeTakeFirst();
    if (!call) throw notFound(tr('That call'));
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
        .select('state')
        .where('call_id', '=', callId)
        .where('user_id', '=', userId)
        .executeTakeFirst(),
    ]);
    const stillIn = member?.state === 'joined' || member?.state === 'ringing';
    if (!inConversation && !stillIn) throw notFound(tr('That call'));
    return { call, outsider: !inConversation };
  }

  /** The call ringing for me, or the one I'm in: a page opened mid-call finds it. */
  app.get('/group-calls/live', async (req): Promise<GroupCallMaybeResponse> => {
    const auth = requireAuth(req);
    const call =
      (await joinedGroupCallOf(ctx, auth.userId)) ?? (await ringingGroupCallFor(ctx, auth.userId));
    return { call: call ? await groupCallView(ctx, call, auth.userId) : null };
  });

  /** The call on in a conversation now, for the banner that offers to join it. */
  app.get('/conversations/:id/group-call', async (req): Promise<GroupCallMaybeResponse> => {
    const auth = requireAuth(req);
    const { id } = parse(callParam, req.params);
    await membership(ctx, auth.userId, id);
    const call = await liveGroupCallIn(ctx, id);
    return { call: call ? await groupCallView(ctx, call, auth.userId, { outsider: false }) : null };
  });

  /** Start a call: everyone else who can take part is rung, and it's on until they've answered. */
  app.post('/conversations/:id/group-calls', async (req, reply): Promise<GroupCallResponse> => {
    const auth = requireAuth(req);
    const { id } = parse(callParam, req.params);
    const body = parse(StartCallBody, req.body);
    const { conversation } = await membership(ctx, auth.userId, id);
    if (conversation.kind !== 'group')
      throw badRequest(tr('Group calls are for group conversations.'));
    ctx.limiter.hit(`call:${auth.userId}`, ctx.config.isTest ? 1000 : 20, 10 * 60_000);

    const now = ctx.now();
    let call: Call;
    let rung: { id: string; display_name: string }[] = [];
    try {
      call = await ctx.db.transaction().execute(async (trx) => {
        // One call at a time: checked, and started, under this person's lock. Who can take
        // part is read under it too, so a block or a removal just before counts.
        await lockCallEntry(trx, auth.userId);
        const people = await callable(id, trx);
        if (!people.some((p) => p.id === auth.userId))
          throw forbidden(tr('You can call once you’ve joined the conversation.'));
        if (people.length > GROUP_CALL_MAX)
          throw badRequest(
            tr('Calls are for groups of up to {GROUP_CALL_MAX} people.', { GROUP_CALL_MAX }),
          );
        if (await inACall(ctx, auth.userId, undefined, trx)) throw busy();
        if (await liveGroupCallIn(ctx, id, trx)) throw callOn();
        // Everyone who can take part is rung, except anyone kept apart from whoever calls.
        const apart = await keptApartFrom(
          ctx,
          trx,
          auth.userId,
          people.map((p) => p.id),
        );
        rung = people.filter((p) => p.id !== auth.userId && !apart.has(p.id));
        if (!rung.length) throw badRequest(tr('There’s nobody to call here.'));
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
      if ((err as { code?: string }).code === '23505') throw callOn();
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
    // A topic by its group's name with its own ("Book club · Middlemarch").
    const where = (await shownTitle(ctx.db, id)) ?? 'the group';
    for (const p of rung)
      await notify(ctx, {
        userId: p.id,
        kind: 'call',
        level: 'urgency',
        // By the name each of them knows the caller by.
        title: (
          (name) => () =>
            tr('{name} is calling {where}', { name: name ?? tr('Someone'), where })
        )(await nameShownTo(ctx, p.id, auth.userId)),
        body: () => (body.kind === 'video' ? tr('Group video call') : tr('Group voice call')),
        data: { conversationId: id, callId: call.id },
        groupKey: `call:${call.id}`,
        delivery: muted.has(p.id) ? 'silent' : 'push',
        // It's news only while it rings; and the phone apps can't answer a call yet.
        ttlSeconds: CALL_RING_SECONDS,
        pushTo: 'web',
      });
    reply.status(201);
    return { call: await groupCallView(ctx, call, auth.userId, { outsider: false }) };
  });

  /**
   * Joined, on this device: from the ring, or later from the conversation while it's on. The
   * second person in makes it a call. Joining again from another device moves them to it.
   */
  app.post('/group-calls/:id/join', async (req): Promise<GroupCallResponse> => {
    const auth = requireAuth(req);
    const { id } = parse(callParam, req.params);
    const { deviceId } = parse(CallDeviceBody, req.body);
    paced(auth.userId, id);
    const { call, outsider } = await theirs(auth.userId, id);
    if (call.state === 'ended')
      throw over(await groupCallView(ctx, call, auth.userId, { outsider }));
    const joinable = async (trx: Transaction<Database>) => {
      // One call at a time: checked, and joined, under this person's lock; so is whether they're
      // still in the conversation, so a removal, a block or a connection ended just before
      // counts (and one just after waits for this, and takes them out).
      await lockCallEntry(trx, auth.userId);
      if (!(await callable(call.conversation_id, trx)).some((p) => p.id === auth.userId))
        throw forbidden(tr('You can join once you’ve joined the conversation.'));
      if (await inACall(ctx, auth.userId, id, trx)) throw busy();
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
      ).filter((m) => m.user_id !== auth.userId);
      if (inIt.length >= GROUP_CALL_MAX)
        throw new AppError(409, 'call_full', tr('This call is full.'));
      // Nobody joins a call with someone they're kept apart from (a block, R29).
      if (
        (
          await keptApartFrom(
            ctx,
            trx,
            auth.userId,
            inIt.map((m) => m.user_id),
          )
        ).size
      )
        throw forbidden(tr('You can’t join this call.'));
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
    };
    const joined = await ctx.db.transaction().execute(joinable);
    if (joined.state === 'ended')
      throw over(await groupCallView(ctx, joined, auth.userId, { outsider }));
    await ringStoppedFor(ctx, id, [auth.userId], 'joined');
    await publishGroupCall(ctx, joined);
    return { call: await groupCallView(ctx, joined, auth.userId, { outsider }) };
  });

  /** Turned down: it stops ringing for them, and a call nobody else is rung for ends. */
  app.post('/group-calls/:id/decline', async (req): Promise<GroupCallResponse> => {
    const auth = requireAuth(req);
    const { id } = parse(callParam, req.params);
    paced(auth.userId, id);
    const { outsider } = await theirs(auth.userId, id);
    const now = await settleGroupCall(ctx, id, async (trx) => {
      const row = await trx
        .updateTable('call_members')
        .set({ state: 'declined' })
        .where('call_id', '=', id)
        .where('user_id', '=', auth.userId)
        .where('state', '=', 'ringing')
        .returning('user_id')
        .executeTakeFirst();
      // Nobody else hears who turned it down: only their own devices, to stop ringing.
      return { changed: Boolean(row), unseen: { tell: [auth.userId] } };
    });
    if (!now) throw notFound(tr('That call'));
    await ringStoppedFor(ctx, id, [auth.userId], 'declined');
    return { call: await groupCallView(ctx, now, auth.userId, { outsider }) };
  });

  /**
   * Left, from the device in the call (a tab left behind can't take them out of it on the one
   * they moved to): it goes on for the others, and ends when fewer than two are left in it.
   */
  app.post('/group-calls/:id/leave', async (req): Promise<GroupCallResponse> => {
    const auth = requireAuth(req);
    const { id } = parse(callParam, req.params);
    const { deviceId } = parse(CallDeviceBody, req.body);
    paced(auth.userId, id);
    const { outsider } = await theirs(auth.userId, id);
    const now = await settleGroupCall(ctx, id, async (trx) => {
      const row = await trx
        .updateTable('call_members')
        .set({ state: 'left', left_at: ctx.now(), device: null })
        .where('call_id', '=', id)
        .where('user_id', '=', auth.userId)
        .where('state', '=', 'joined')
        .where('device', '=', deviceId)
        .returning('user_id')
        .executeTakeFirst();
      return { changed: Boolean(row) };
    });
    if (!now) throw notFound(tr('That call'));
    return { call: await groupCallView(ctx, now, auth.userId, { outsider }) };
  });

  /**
   * An offer, an answer or a candidate from one joined device to another, and only to it: no
   * device that isn't in the call can send or be sent one.
   */
  app.post('/group-calls/:id/signal', async (req): Promise<OkResponse> => {
    const auth = requireAuth(req);
    const { id } = parse(callParam, req.params);
    const body = parse(GroupCallSignalBody, req.body);
    const { call, outsider } = await theirs(auth.userId, id);
    if (call.state === 'ended') throw over();
    if (outsider) throw forbidden(tr('This device isn’t in that call.'));
    const joined = await ctx.db
      .selectFrom('call_members')
      .select(['user_id', 'device'])
      .where('call_id', '=', id)
      .where('state', '=', 'joined')
      .execute();
    const mine = joined.find((m) => m.user_id === auth.userId);
    const to = joined.find(
      (m) => m.user_id === body.toUser && m.device === body.to && m.user_id !== auth.userId,
    );
    if (!mine || mine.device !== body.deviceId || !to)
      throw forbidden(tr('This device isn’t in that call.'));
    ctx.limiter.hit(`call-signal:${id}:${auth.userId}`, ctx.config.isTest ? 10_000 : 600, 60_000);
    // An offer or an answer each way, and one more per reconnect; only candidates are many.
    // Counted for each pair of devices, so nobody can spend what someone has for the others.
    if (body.sdp)
      ctx.limiter.hit(`call-sdp:${id}:${auth.userId}:${body.toUser}:${body.to}`, 20, 10 * 60_000);
    await ctx.bus.publish([to.user_id], {
      type: 'groupcall.signal',
      data: {
        callId: id,
        from: body.deviceId,
        fromUser: auth.userId,
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
  app.post('/group-calls/:id/alive', async (req): Promise<GroupCallResponse> => {
    const auth = requireAuth(req);
    const { id } = parse(callParam, req.params);
    const { deviceId } = parse(CallDeviceBody, req.body);
    const { call, outsider } = await theirs(auth.userId, id);
    if (call.state === 'ended')
      throw over(await groupCallView(ctx, call, auth.userId, { outsider }));
    // Out of the conversation, or kept apart now from someone in it (a block, R29), whatever let
    // them in: out of the call, from their next beat at the latest.
    const inIt = await ctx.db
      .selectFrom('call_members')
      .select('user_id')
      .where('call_id', '=', id)
      .where('state', '=', 'joined')
      .execute();
    if (inIt.some((m) => m.user_id === auth.userId)) {
      const others = inIt.map((m) => m.user_id).filter((u) => u !== auth.userId);
      if (outsider || (await keptApartFrom(ctx, ctx.db, auth.userId, others)).size) {
        await takeOutOfGroupCall(ctx, id, auth.userId, 'left');
        const now = await ctx.db
          .selectFrom('calls')
          .selectAll()
          .where('id', '=', id)
          .executeTakeFirstOrThrow();
        throw new AppError(403, 'not_in_call', tr('This device isn’t in that call.'), {
          call: await groupCallView(ctx, now, auth.userId, { outsider }),
        });
      }
    }
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
      throw new AppError(403, 'not_in_call', tr('This device isn’t in that call.'), {
        call: await groupCallView(ctx, call, auth.userId, { outsider }),
      });
    return { call: await groupCallView(ctx, call, auth.userId, { outsider }) };
  });
}
