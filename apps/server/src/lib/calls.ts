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
  type CallHistoryItem,
  type CallHistoryResponse,
  type CallOutcome,
  type CallView,
  callResult,
  type IceConfigView,
} from '@caishy/core';
import { type Kysely, sql, type Transaction } from 'kysely';
import type { AppContext } from '../context';
import type { Call, Database } from '../db/schema';
import { registerPeriodic } from './jobs';
import { insertSystemMessage, messageViews, participantsOf } from './messages';
import { notify, replaceShown } from './notify';
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
 * A 1:1 call other than `except` that someone is in now: one they answered or placed and is
 * under way (both sides still there), or one they placed that still rings.
 */
export async function otherCallIn(
  ctx: AppContext,
  userId: string,
  except: string,
  db: Kysely<Database> | Transaction<Database> = ctx.db,
): Promise<Call | undefined> {
  const now = ctx.now().getTime();
  const fresh = new Date(now - CALL_SEEN_MS);
  return db
    .selectFrom('calls')
    .selectAll()
    .where('is_group', '=', false)
    .where('id', '<>', except)
    .where((eb) =>
      eb.or([
        eb.and([
          eb('state', '=', 'active'),
          eb.or([eb('caller_id', '=', userId), eb('callee_id', '=', userId)]),
          eb('caller_seen_at', '>', fresh),
          eb('callee_seen_at', '>', fresh),
        ]),
        eb.and([
          eb('state', '=', 'ringing'),
          eb('caller_id', '=', userId),
          eb('created_at', '>', new Date(now - CALL_RING_SECONDS * 1000)),
        ]),
      ]),
    )
    .executeTakeFirst();
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
export async function ringStopped(
  ctx: AppContext,
  call: Call,
  { missedNotice = false }: { missedNotice?: boolean } = {},
): Promise<void> {
  if (!call.callee_id) return;
  const read = await ctx.db
    .updateTable('notifications')
    .set({ read_at: ctx.now() })
    .where('user_id', '=', call.callee_id)
    .where('group_key', '=', `call:${call.id}`)
    .where('read_at', 'is', null)
    .returning(['id', 'data'])
    .execute();
  if (!read.length) return;
  await ctx.bus.publish([call.callee_id], {
    type: 'notifications.read',
    data: { ids: read.map((r) => r.id), all: false },
  });
  // A browser still showing "… is calling" says it's over instead, quietly; a missed call says so
  // itself, in its place.
  if (missedNotice || !call.caller_id) return;
  const caller = await nameShownTo(ctx, call.callee_id, call.caller_id);
  for (const r of read)
    await replaceShown(ctx, r.id, {
      userId: call.callee_id,
      kind: 'call',
      level: 'activity',
      title: caller ?? 'Call',
      body:
        call.state !== 'ended'
          ? 'Answered'
          : call.outcome === 'declined'
            ? 'Declined'
            : 'Call ended',
      data: r.data as Record<string, unknown>,
      groupKey: `call:${call.id}`,
      ttlSeconds: CALL_RING_SECONDS,
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
  const missedNotice =
    !quiet &&
    (outcome === 'missed' || outcome === 'cancelled') &&
    Boolean(ended.callee_id && ended.caller_id);
  await ringStopped(ctx, ended, { missedNotice });
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
  if (missedNotice && ended.callee_id && ended.caller_id) {
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

/**
 * Someone's calls (PRD §47), newest first: the 1:1 calls they placed or were rung for, and the
 * group calls they were rung for or started, each as it went for them. Only calls that are over.
 * `withId` narrows it to calls with one person (1:1, or a group call you were both in); `missed`
 * to the calls they missed.
 */
export async function callHistory(
  ctx: AppContext,
  me: string,
  opts: { before?: string; limit: number; withId?: string; missed?: boolean },
): Promise<CallHistoryResponse> {
  const direct = ctx.db
    .selectFrom('calls as c')
    .select([
      'c.id',
      'c.conversation_id',
      'c.kind',
      'c.is_group',
      'c.outcome',
      'c.caller_id',
      'c.callee_id',
      'c.created_at',
      'c.answered_at',
      'c.ended_at',
      sql<string | null>`null`.as('my_state'),
      sql<Date | null>`null`.as('my_joined_at'),
      sql<Date | null>`null`.as('my_left_at'),
      sql<Date | null>`null`.as('my_rung_at'),
    ])
    .where('c.is_group', '=', false)
    .where('c.state', '=', 'ended')
    .where((eb) => eb.or([eb('c.caller_id', '=', me), eb('c.callee_id', '=', me)]))
    .$if(Boolean(opts.withId), (q) =>
      q.where((eb) =>
        eb.or([
          eb.and([eb('c.caller_id', '=', me), eb('c.callee_id', '=', opts.withId!)]),
          eb.and([eb('c.callee_id', '=', me), eb('c.caller_id', '=', opts.withId!)]),
        ]),
      ),
    )
    .$if(Boolean(opts.missed), (q) =>
      q.where('c.callee_id', '=', me).where('c.outcome', 'in', ['missed', 'cancelled']),
    );
  const group = ctx.db
    .selectFrom('calls as c')
    .innerJoin('call_members as m', (j) =>
      j.onRef('m.call_id', '=', 'c.id').on('m.user_id', '=', me),
    )
    .select([
      'c.id',
      'c.conversation_id',
      'c.kind',
      'c.is_group',
      'c.outcome',
      'c.caller_id',
      'c.callee_id',
      'c.created_at',
      'c.answered_at',
      'c.ended_at',
      sql<string | null>`m.state`.as('my_state'),
      sql<Date | null>`m.joined_at`.as('my_joined_at'),
      sql<Date | null>`m.left_at`.as('my_left_at'),
      sql<Date | null>`m.rung_at`.as('my_rung_at'),
    ])
    .where('c.is_group', '=', true)
    .where('c.state', '=', 'ended')
    // With someone: who was in it once they were part of it (and they're still in the group).
    .$if(Boolean(opts.withId), (q) =>
      q.where((eb) =>
        eb.exists(
          eb
            .selectFrom('call_members as o')
            .innerJoin('participants as p', (j) =>
              j.onRef('p.conversation_id', '=', 'c.conversation_id').on('p.user_id', '=', me),
            )
            .select('o.user_id')
            .whereRef('o.call_id', '=', 'c.id')
            .where('o.user_id', '=', opts.withId!)
            .where('o.joined_at', 'is not', null)
            .where('p.left_at', 'is', null)
            .where(sql<boolean>`coalesce(o.left_at, c.ended_at, now()) > m.rung_at`),
        ),
      ),
    )
    .$if(Boolean(opts.missed), (q) =>
      q
        .where('m.joined_at', 'is', null)
        .where('m.state', '<>', 'declined')
        .where((eb) => eb.or([eb('c.caller_id', 'is', null), eb('c.caller_id', '<>', me)])),
    );
  const rows = await ctx.db
    .selectFrom(direct.unionAll(group).as('x'))
    .selectAll()
    .$if(Boolean(opts.before), (q) => q.where('x.id', '<', opts.before!))
    .orderBy('x.id', 'desc')
    .limit(opts.limit + 1)
    .execute();
  const page = rows.slice(0, opts.limit);
  const groupIds = page.filter((r) => r.is_group).map((r) => r.id);
  // Where they stand in each group now: someone who's left sees only their own place in its
  // calls, never its name, who else was there, or how long it went on after them.
  const memberships = groupIds.length
    ? await ctx.db
        .selectFrom('participants')
        .select(['conversation_id', 'left_at'])
        .where('user_id', '=', me)
        .where(
          'conversation_id',
          'in',
          page.filter((r) => r.is_group).map((r) => r.conversation_id),
        )
        .execute()
    : [];
  const inGroup = (conversationId: string) => {
    const p = memberships.find((x) => x.conversation_id === conversationId);
    return p && p.left_at === null ? p : null;
  };
  const members = groupIds.length
    ? await ctx.db
        .selectFrom('call_members')
        .select(['call_id', 'user_id', 'joined_at', 'left_at', 'rung_at'])
        .where('call_id', 'in', groupIds)
        .orderBy('rung_at')
        .orderBy('user_id')
        .execute()
    : [];
  const people = new Set<string>();
  for (const r of page)
    for (const id of [r.caller_id, r.callee_id]) if (id && id !== me) people.add(id);
  for (const m of members) if (m.user_id !== me) people.add(m.user_id);
  const ids = [...people];
  const [users, views, titles] = await Promise.all([
    ids.length
      ? ctx.db.selectFrom('users').select(['id', 'display_name']).where('id', 'in', ids).execute()
      : [],
    personViewsFor(ctx, me, ids),
    groupIds.length && memberships.some((p) => p.left_at === null)
      ? ctx.db
          .selectFrom('conversations')
          .select(['id', 'title'])
          .where(
            'id',
            'in',
            memberships.filter((p) => p.left_at === null).map((p) => p.conversation_id),
          )
          .execute()
      : [],
  ]);
  // Each by the name they show whoever asks (PRD §35).
  const person = (id: string | null) => {
    const u = id ? users.find((x) => x.id === id) : undefined;
    return {
      id: id ?? '',
      displayName: (id && views.get(id)?.displayName) || u?.display_name || 'Deleted account',
      avatarUrl: id ? (views.get(id)?.avatarUrl ?? null) : null,
    };
  };
  return {
    calls: page.map((r): CallHistoryItem => {
      const outgoing = r.caller_id === me;
      const outcome = (r.outcome ?? 'missed') as CallOutcome;
      let others: Array<string | null>;
      const member = r.is_group ? inGroup(r.conversation_id) : null;
      if (!r.is_group) others = [outgoing ? r.callee_id : r.caller_id];
      else if (!member) others = [];
      else {
        // Who else was in it once they were part of it (rung, or added while it was on): not
        // someone who'd left the call before then.
        const from = r.my_rung_at?.getTime() ?? 0;
        const of = members.filter((m) => m.call_id === r.id && m.user_id !== me);
        const joined = of.filter(
          (m) => m.joined_at && (m.left_at ?? r.ended_at ?? ctx.now()).getTime() > from,
        );
        // For a call nobody else joined, who started it (and to whoever did, nobody: who it
        // rang would say who it didn't, a block or R29).
        others = joined.length ? joined.map((m) => m.user_id) : outgoing ? [] : [r.caller_id];
      }
      const answered = r.answered_at && r.ended_at;
      // Out of the group: only as long as they were in the call themselves.
      const mine =
        r.is_group && !member
          ? r.my_joined_at
            ? Math.max(
                0,
                Math.round(
                  ((r.my_left_at ?? r.ended_at ?? ctx.now()).getTime() - r.my_joined_at.getTime()) /
                    1000,
                ),
              )
            : 0
          : null;
      return {
        id: r.id,
        conversationId: r.conversation_id,
        // Only of groups they're still in: nothing else was looked up.
        conversationTitle: r.is_group
          ? (titles.find((c) => c.id === r.conversation_id)?.title ?? null)
          : null,
        kind: r.kind,
        group: r.is_group,
        direction: outgoing ? 'outgoing' : 'incoming',
        result: callResult({
          outcome,
          outgoing,
          group: r.is_group,
          joined: Boolean(r.my_joined_at),
          declined: r.my_state === 'declined',
        }),
        with: others.map(person),
        seconds:
          mine ??
          (answered && outcome === 'completed'
            ? Math.max(0, Math.round((r.ended_at!.getTime() - r.answered_at!.getTime()) / 1000))
            : 0),
        createdAt: r.created_at.toISOString(),
        endedAt: r.ended_at?.toISOString() ?? null,
      };
    }),
    nextBefore: rows.length > opts.limit ? (page.at(-1)?.id ?? null) : null,
  };
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
