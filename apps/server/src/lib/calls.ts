/**
 * Calls (PRD §47): 1:1 voice and video in a direct conversation. The server rings the other
 * person's devices, lets one of them answer, and passes WebRTC offers, answers and candidates
 * between exactly the two devices in the call; the media goes between them directly, encrypted.
 * Each call leaves one line in the conversation ("Video call · 4 min", "Missed voice call").
 *
 * A call nobody answers is missed after CALL_RING_SECONDS; one both sides stopped saying
 * they're in (a closed tab, a lost connection) is ended by the sweep, so nobody stays "busy".
 */
import { createHmac } from 'node:crypto';
import {
  CALL_RING_SECONDS,
  type CallOutcome,
  type CallView,
  type IceConfigView,
} from '@caishy/core';
import type { AppContext } from '../context';
import type { Call } from '../db/schema';
import { registerPeriodic } from './jobs';
import { insertSystemMessage, messageViews, participantsOf } from './messages';
import { notify } from './notify';
import { personViewsFor } from './people-batch';
import { avatarUrl } from './users';

/** A live call stops counting when neither side has said it's there for this long. */
export const CALL_SEEN_MS = 90_000;
const TURN_TTL_S = 12 * 3600;

/** The call as `viewerId` sees it: the other person's photo only if they'd see it anyway. */
export async function callView(ctx: AppContext, call: Call, viewerId: string): Promise<CallView> {
  const ids = [call.caller_id, call.callee_id].filter((x): x is string => Boolean(x));
  const [users, others] = await Promise.all([
    ctx.db
      .selectFrom('users')
      .select(['id', 'display_name', 'avatar_file_id'])
      .where('id', 'in', ids)
      .execute(),
    personViewsFor(
      ctx,
      viewerId,
      ids.filter((id) => id !== viewerId),
    ),
  ]);
  const side = (id: string | null) => {
    const u = users.find((x) => x.id === id);
    const avatar =
      id === viewerId && u ? avatarUrl(u) : id ? (others.get(id)?.avatarUrl ?? null) : null;
    return { id: id ?? '', displayName: u?.display_name ?? 'Deleted account', avatarUrl: avatar };
  };
  return {
    id: call.id,
    conversationId: call.conversation_id,
    kind: call.kind,
    state: call.state,
    outcome: call.outcome,
    caller: side(call.caller_id),
    callee: side(call.callee_id),
    callerDevice: call.caller_device,
    calleeDevice: call.callee_device,
    createdAt: call.created_at.toISOString(),
    answeredAt: call.answered_at?.toISOString() ?? null,
    endedAt: call.ended_at?.toISOString() ?? null,
  };
}

/** Tell both sides (every device of each) how the call stands, each as they'd see it. */
export async function publishCall(
  ctx: AppContext,
  call: Call,
  type: 'call.ringing' | 'call.updated' = 'call.updated',
): Promise<void> {
  for (const userId of [call.caller_id, call.callee_id]) {
    if (!userId) continue;
    const view = await callView(ctx, call, userId);
    // Only the person being called hears it ring; the caller's devices just follow along.
    await ctx.bus.publish([userId], {
      type: type === 'call.ringing' && userId === call.caller_id ? 'call.updated' : type,
      data: view,
    });
  }
}

/** A call someone is in or being rung for now, if any. */
export async function liveCallOf(ctx: AppContext, userId: string): Promise<Call | undefined> {
  const now = ctx.now().getTime();
  return ctx.db
    .selectFrom('calls')
    .selectAll()
    .where((eb) => eb.or([eb('caller_id', '=', userId), eb('callee_id', '=', userId)]))
    .where((eb) =>
      eb.or([
        eb.and([
          eb('state', '=', 'ringing'),
          eb('created_at', '>', new Date(now - CALL_RING_SECONDS * 1000)),
        ]),
        eb.and([eb('state', '=', 'active'), eb('seen_at', '>', new Date(now - CALL_SEEN_MS))]),
      ]),
    )
    .orderBy('created_at', 'desc')
    .executeTakeFirst();
}

/**
 * End a call, once: both sides hear it, and the conversation gets its line. A missed call
 * reaches the person called as a notification too.
 */
export async function endCall(
  ctx: AppContext,
  call: Call,
  outcome: CallOutcome,
  endedAt: Date = ctx.now(),
): Promise<Call | null> {
  const ended = await ctx.db
    .updateTable('calls')
    .set({ state: 'ended', outcome, ended_at: endedAt })
    .where('id', '=', call.id)
    .where('state', '<>', 'ended')
    .returningAll()
    .executeTakeFirst();
  if (!ended) return null;
  await publishCall(ctx, ended);
  const seconds =
    outcome === 'completed' && ended.answered_at
      ? Math.max(0, Math.round((endedAt.getTime() - ended.answered_at.getTime()) / 1000))
      : 0;
  if (ended.caller_id) {
    const line = await insertSystemMessage(ctx, ended.conversation_id, ended.caller_id, 'call', {
      kind: ended.kind,
      outcome,
      seconds,
    });
    const [view] = await messageViews(ctx.db, [line], ended.caller_id);
    await ctx.bus.publish(
      (await participantsOf(ctx.db, ended.conversation_id)).map((p) => p.user_id),
      { type: 'message.created', data: view },
    );
  }
  if ((outcome === 'missed' || outcome === 'cancelled') && ended.callee_id && ended.caller_id) {
    const caller = await ctx.db
      .selectFrom('users')
      .select('display_name')
      .where('id', '=', ended.caller_id)
      .executeTakeFirst();
    await notify(ctx, {
      userId: ended.callee_id,
      kind: 'call',
      level: 'attention',
      title: `Missed ${ended.kind} call`,
      body: caller ? `from ${caller.display_name}` : null,
      data: { conversationId: ended.conversation_id, callId: ended.id },
      groupKey: `call:${ended.id}`,
    });
  }
  return ended;
}

/** Calls nobody answered in time are missed; calls nobody is in any more are over. */
export async function sweepCalls(ctx: AppContext): Promise<void> {
  const now = ctx.now().getTime();
  const unanswered = await ctx.db
    .selectFrom('calls')
    .selectAll()
    .where('state', '=', 'ringing')
    .where('created_at', '<=', new Date(now - CALL_RING_SECONDS * 1000))
    .limit(200)
    .execute();
  for (const c of unanswered) await endCall(ctx, c, 'missed');
  const abandoned = await ctx.db
    .selectFrom('calls')
    .selectAll()
    .where('state', '=', 'active')
    .where('seen_at', '<=', new Date(now - CALL_SEEN_MS))
    .limit(200)
    .execute();
  // It lasted until the last time either side was there.
  for (const c of abandoned) await endCall(ctx, c, 'completed', c.seen_at);
}

export function registerCallSweep(): void {
  registerPeriodic({ name: 'calls', everyMs: 5000, run: sweepCalls });
}

/**
 * Where a device finds its way to the other: the STUN servers, and the relay with credentials
 * that expire (coturn's REST scheme: a username of expiry:user, signed with the shared secret).
 */
export function iceConfig(ctx: AppContext, userId: string): IceConfigView {
  const iceServers: IceConfigView['iceServers'] = [];
  if (ctx.config.stunUrls.length) iceServers.push({ urls: ctx.config.stunUrls });
  const secret = ctx.config.TURN_SECRET;
  if (secret && ctx.config.turnUrls.length) {
    const username = `${Math.floor(ctx.now().getTime() / 1000) + TURN_TTL_S}:${userId}`;
    const credential = createHmac('sha1', secret).update(username).digest('base64');
    iceServers.push({ urls: ctx.config.turnUrls, username, credential });
  }
  return { iceServers, relay: iceServers.some((s) => s.username !== undefined) };
}

/** Whoever is on the other side of a call from `userId`. */
export const otherSide = (call: Call, userId: string) =>
  call.caller_id === userId ? call.callee_id : call.caller_id;

/** Mark that a side is still in the call. */
export async function stillThere(ctx: AppContext, callId: string): Promise<void> {
  await ctx.db
    .updateTable('calls')
    .set({ seen_at: ctx.now() })
    .where('id', '=', callId)
    .where('state', '<>', 'ended')
    .execute();
}
