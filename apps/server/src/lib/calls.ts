/**
 * Calls (PRD §47): 1:1 voice and video in a direct conversation. The server rings the other
 * person's devices, lets one of them answer, and passes WebRTC offers, answers and candidates
 * between exactly the two devices in the call; the media goes between them directly, encrypted.
 * Each call leaves one line in the conversation ("Video call · 4 min", "Missed voice call").
 *
 * A call nobody answers is missed after CALL_RING_SECONDS; one either side stopped saying it's
 * in (a closed tab, a lost connection) is ended by the sweep, so nobody stays "busy", and the
 * other side can't keep it going alone. Blocking ends any call between the two at once.
 */
import { createHmac } from 'node:crypto';
import {
  CALL_RING_SECONDS,
  type CallOutcome,
  type CallView,
  type IceConfigView,
} from '@caishy/core';
import { type Kysely, sql, type Transaction } from 'kysely';
import type { AppContext } from '../context';
import type { Call, Database } from '../db/schema';
import { registerPeriodic } from './jobs';
import { insertSystemMessage, messageViews, participantsOf } from './messages';
import { notify } from './notify';
import { personViewsFor } from './people-batch';
import { avatarUrl } from './users';

/** A live call stops counting when either side hasn't said it's there for this long. */
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
    // The name the viewer knows them by: the identity they show this viewer (PRD §35).
    const name = id && id !== viewerId ? others.get(id)?.displayName : undefined;
    return {
      id: id ?? '',
      displayName: name ?? u?.display_name ?? 'Deleted account',
      avatarUrl: avatar,
    };
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

/**
 * A call someone is in or being rung for now, if any: both sides still there. A call they
 * weren't rung for (it came while they were busy and hidden) is only the caller's.
 */
export async function liveCallOf(
  ctx: AppContext,
  userId: string,
  db: Kysely<Database> | Transaction<Database> = ctx.db,
): Promise<Call | undefined> {
  const now = ctx.now().getTime();
  const fresh = new Date(now - CALL_SEEN_MS);
  return db
    .selectFrom('calls')
    .selectAll()
    .where('is_group', '=', false)
    .where((eb) =>
      eb.or([
        eb('caller_id', '=', userId),
        eb.and([eb('callee_id', '=', userId), eb('callee_rung', '=', true)]),
      ]),
    )
    .where((eb) =>
      eb.or([
        eb.and([
          eb('state', '=', 'ringing'),
          eb('created_at', '>', new Date(now - CALL_RING_SECONDS * 1000)),
        ]),
        eb.and([
          eb('state', '=', 'active'),
          eb('caller_seen_at', '>', fresh),
          eb('callee_seen_at', '>', fresh),
        ]),
      ]),
    )
    .orderBy('created_at', 'desc')
    .executeTakeFirst();
}

/**
 * The 1:1 call someone is in now: one they placed (ringing or under way), or one they answered.
 * A call merely ringing for them isn't one they're in.
 */
export async function callInOf(
  ctx: AppContext,
  userId: string,
  db: Kysely<Database> | Transaction<Database> = ctx.db,
): Promise<Call | undefined> {
  const call = await liveCallOf(ctx, userId, db);
  return call && (call.caller_id === userId || call.state === 'active') ? call : undefined;
}

/**
 * One call at a time, for real: whatever puts someone in a call (placing one, answering, starting
 * or joining a group call) holds this for them from checking they aren't in one until it's done,
 * so two of their devices can't both get in. Taken before any call's own lock, never after.
 */
export async function lockCallEntry(trx: Transaction<Database>, userId: string): Promise<void> {
  await sql`select pg_advisory_xact_lock(hashtext(${`call-entry:${userId}`}))`.execute(trx);
}

/** The name `viewerId` knows someone by (the identity shown to them), for a ring or a notice. */
export async function nameShownTo(
  ctx: AppContext,
  viewerId: string,
  personId: string,
): Promise<string | null> {
  if (personId === viewerId) {
    const u = await ctx.db
      .selectFrom('users')
      .select('display_name')
      .where('id', '=', personId)
      .executeTakeFirst();
    return u?.display_name ?? null;
  }
  return (await personViewsFor(ctx, viewerId, [personId])).get(personId)?.displayName ?? null;
}

/**
 * It isn't ringing any more: the person called has their "is calling" read on every device, so
 * it neither stays in their list nor counts as unread.
 */
export async function ringStopped(ctx: AppContext, call: Call): Promise<void> {
  if (!call.callee_id) return;
  const read = await ctx.db
    .updateTable('notifications')
    .set({ read_at: ctx.now() })
    .where('user_id', '=', call.callee_id)
    .where('group_key', '=', `call:${call.id}`)
    .where('read_at', 'is', null)
    .returning('id')
    .execute();
  if (read.length)
    await ctx.bus.publish([call.callee_id], {
      type: 'notifications.read',
      data: { ids: read.map((r) => r.id), all: false },
    });
}

/**
 * End a call, once: both sides hear it, and the conversation gets its line. A missed call
 * reaches the person called as a notification too, unless it ended `quiet` (a block).
 */
export async function endCall(
  ctx: AppContext,
  call: Call,
  outcome: CallOutcome,
  endedAt: Date = ctx.now(),
  { quiet = false }: { quiet?: boolean } = {},
): Promise<Call | null> {
  const ended = await ctx.db
    .updateTable('calls')
    .set({ state: 'ended', outcome, ended_at: endedAt })
    .where('id', '=', call.id)
    .where('state', '<>', 'ended')
    .returningAll()
    .executeTakeFirst();
  if (!ended) return null;
  await ringStopped(ctx, ended);
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
  if (
    !quiet &&
    (outcome === 'missed' || outcome === 'cancelled') &&
    ended.callee_id &&
    ended.caller_id
  ) {
    const caller = await nameShownTo(ctx, ended.callee_id, ended.caller_id);
    await notify(ctx, {
      userId: ended.callee_id,
      kind: 'call',
      level: 'attention',
      title: `Missed ${ended.kind} call`,
      body: caller ? `from ${caller}` : null,
      data: { conversationId: ended.conversation_id, callId: ended.id },
      groupKey: `call:${ended.id}`,
    });
  }
  return ended;
}

/**
 * Calls nobody answered in time are missed; calls nobody is in any more are over. Group calls
 * have their own sweep (lib/group-calls.ts).
 */
export async function sweepCalls(ctx: AppContext): Promise<void> {
  const now = ctx.now().getTime();
  const unanswered = await ctx.db
    .selectFrom('calls')
    .selectAll()
    .where('is_group', '=', false)
    .where('state', '=', 'ringing')
    .where('created_at', '<=', new Date(now - CALL_RING_SECONDS * 1000))
    .limit(200)
    .execute();
  for (const c of unanswered) await endCall(ctx, c, 'missed');
  const stale = new Date(now - CALL_SEEN_MS);
  const abandoned = await ctx.db
    .selectFrom('calls')
    .selectAll()
    .where('is_group', '=', false)
    .where('state', '=', 'active')
    .where((eb) =>
      eb.or([
        eb('caller_seen_at', '<=', stale),
        eb(eb.fn.coalesce('callee_seen_at', 'answered_at'), '<=', stale),
      ]),
    )
    .limit(200)
    .execute();
  // It lasted until the one who left was last there.
  for (const c of abandoned) {
    const callee = c.callee_seen_at ?? c.answered_at ?? c.caller_seen_at;
    const left = Math.min(c.caller_seen_at.getTime(), callee.getTime());
    await endCall(ctx, c, 'completed', new Date(left));
  }
}

/**
 * One of the two blocked the other: whatever call is between them ends now, without telling
 * anyone they missed it. A call still ringing reads as turned down, or called off, by whoever
 * blocked; one under way, as over.
 */
export async function endCallsBetween(ctx: AppContext, blockerId: string, otherId: string) {
  const calls = await ctx.db
    .selectFrom('calls')
    .selectAll()
    .where('is_group', '=', false)
    .where('state', '<>', 'ended')
    .where((eb) =>
      eb.or([
        eb.and([eb('caller_id', '=', blockerId), eb('callee_id', '=', otherId)]),
        eb.and([eb('caller_id', '=', otherId), eb('callee_id', '=', blockerId)]),
      ]),
    )
    .execute();
  for (const c of calls) {
    const outcome: CallOutcome =
      c.state === 'active' ? 'completed' : c.callee_id === blockerId ? 'declined' : 'cancelled';
    await endCall(ctx, c, outcome, ctx.now(), { quiet: true });
  }
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

/** Mark that one side is still in the call, and say how the call stands now. */
export async function stillThere(
  ctx: AppContext,
  callId: string,
  side: 'caller' | 'callee',
): Promise<Call | undefined> {
  return ctx.db
    .updateTable('calls')
    .set(
      side === 'caller'
        ? { caller_seen_at: ctx.now(), seen_at: ctx.now() }
        : { callee_seen_at: ctx.now(), seen_at: ctx.now() },
    )
    .where('id', '=', callId)
    .where('state', '<>', 'ended')
    .returningAll()
    .executeTakeFirst();
}
