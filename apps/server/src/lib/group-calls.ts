/**
 * Group calls (PRD §47): a call in a group conversation of up to GROUP_CALL_MAX people. Every
 * device in it connects to every other, so there is no server in the middle of the media: the
 * server rings everyone who can take part, keeps who's in it and on which device, passes offers,
 * answers and candidates between two joined devices only, and ends it when fewer than two are
 * left in it (or when nobody else joined). Each call leaves one line in the conversation.
 *
 * Each joined device says for itself that it's still there; one that stops is taken out after
 * CALL_SEEN_MS. Someone rung who doesn't join in CALL_RING_SECONDS has missed it, and hears so.
 * Two people where one blocked the other, or where one is under 18 and they aren't connected,
 * are never in a call together.
 */
import { CALL_RING_SECONDS, type CallOutcome, type GroupCallView, isMinor } from '@caishy/core';
import { type Kysely, sql, type Transaction } from 'kysely';
import type { AppContext } from '../context';
import type { Call, Database } from '../db/schema';
import { CALL_SEEN_MS, callInOf } from './calls';
import { registerPeriodic } from './jobs';
import { insertSystemMessage, messageViews, participantsOf } from './messages';
import { notify } from './notify';
import { personViewsFor } from './people-batch';
import { avatarUrl } from './users';

/** The call as `viewerId` sees it: others' photos only where they'd see them anyway. */
export async function groupCallView(
  ctx: AppContext,
  call: Call,
  viewerId: string,
): Promise<GroupCallView> {
  const members = await ctx.db
    .selectFrom('call_members as m')
    .innerJoin('users as u', 'u.id', 'm.user_id')
    .select([
      'm.user_id',
      'm.state',
      'm.device',
      'm.joined_at',
      'm.rung_at',
      'u.display_name',
      'u.avatar_file_id',
    ])
    .where('m.call_id', '=', call.id)
    .orderBy('m.rung_at')
    .orderBy('m.user_id')
    .execute();
  const ids = [...new Set([call.caller_id, ...members.map((m) => m.user_id)])].filter(
    (x): x is string => Boolean(x),
  );
  const [others, starter, conversation] = await Promise.all([
    personViewsFor(
      ctx,
      viewerId,
      ids.filter((id) => id !== viewerId),
    ),
    call.caller_id
      ? ctx.db
          .selectFrom('users')
          .select(['id', 'display_name', 'avatar_file_id'])
          .where('id', '=', call.caller_id)
          .executeTakeFirst()
      : undefined,
    ctx.db
      .selectFrom('conversations')
      .select('title')
      .where('id', '=', call.conversation_id)
      .executeTakeFirst(),
  ]);
  const photo = (id: string, own: { avatar_file_id: string | null }) =>
    id === viewerId
      ? avatarUrl({ id, avatar_file_id: own.avatar_file_id })
      : (others.get(id)?.avatarUrl ?? null);
  return {
    id: call.id,
    conversationId: call.conversation_id,
    conversationTitle: conversation?.title ?? null,
    kind: call.kind,
    state: call.state,
    rev: call.rev,
    outcome: call.outcome,
    startedBy: {
      id: call.caller_id ?? '',
      displayName: starter?.display_name ?? 'Deleted account',
      avatarUrl: starter ? photo(starter.id, starter) : null,
    },
    members: members.map((m) => ({
      person: {
        id: m.user_id,
        displayName: m.display_name,
        avatarUrl: photo(m.user_id, m),
      },
      state: m.state,
      device: m.state === 'joined' ? m.device : null,
      joinedAt: m.joined_at?.toISOString() ?? null,
    })),
    createdAt: call.created_at.toISOString(),
    answeredAt: call.answered_at?.toISOString() ?? null,
    endedAt: call.ended_at?.toISOString() ?? null,
  };
}

/**
 * Tell the conversation how the call stands, each person as they'd see it: those being rung
 * hear it ring (`ringing`), everyone else in the conversation sees it for its banner.
 */
export async function publishGroupCall(
  ctx: AppContext,
  call: Call,
  ringing: string[] = [],
): Promise<void> {
  const people = (await participantsOf(ctx.db, call.conversation_id)).map((p) => p.user_id);
  for (const userId of new Set([...people, ...ringing])) {
    const view = await groupCallView(ctx, call, userId);
    await ctx.bus.publish([userId], {
      type: ringing.includes(userId) ? 'groupcall.ringing' : 'groupcall.updated',
      data: view,
    });
  }
}

/** The group call someone is in now (joined, and still there), if any. */
export async function joinedGroupCallOf(ctx: AppContext, userId: string) {
  return ctx.db
    .selectFrom('call_members as m')
    .innerJoin('calls as c', 'c.id', 'm.call_id')
    .selectAll('c')
    .where('m.user_id', '=', userId)
    .where('m.state', '=', 'joined')
    .where('m.seen_at', '>', new Date(ctx.now().getTime() - CALL_SEEN_MS))
    .where('c.state', '<>', 'ended')
    .orderBy('c.created_at', 'desc')
    .executeTakeFirst();
}

/** The group call ringing for someone now, if any. */
export async function ringingGroupCallFor(ctx: AppContext, userId: string) {
  return ctx.db
    .selectFrom('call_members as m')
    .innerJoin('calls as c', 'c.id', 'm.call_id')
    .selectAll('c')
    .where('m.user_id', '=', userId)
    .where('m.state', '=', 'ringing')
    .where('m.rung_at', '>', new Date(ctx.now().getTime() - CALL_RING_SECONDS * 1000))
    .where('c.state', '<>', 'ended')
    .orderBy('c.created_at', 'desc')
    .executeTakeFirst();
}

/** The call on in a conversation now, if any. */
export async function liveGroupCallIn(ctx: AppContext, conversationId: string) {
  return ctx.db
    .selectFrom('calls')
    .selectAll()
    .where('conversation_id', '=', conversationId)
    .where('is_group', '=', true)
    .where('state', '<>', 'ended')
    .orderBy('created_at', 'desc')
    .executeTakeFirst();
}

/**
 * In a call now: a 1:1 call they placed or answered, or a group call other than `except`. One
 * merely ringing for them isn't one they're in.
 */
export async function inACall(ctx: AppContext, userId: string, except?: string) {
  if (await callInOf(ctx, userId)) return true;
  const group = await joinedGroupCallOf(ctx, userId);
  return Boolean(group && group.id !== except);
}

/**
 * Of `others`, those never in a call with `userId`: either blocked the other, or one of the two
 * is under 18 and they aren't connected (R29). A call shows faces, and each device's network
 * address to the others.
 */
export async function keptApartFrom(
  ctx: Pick<AppContext, 'now'>,
  db: Kysely<Database> | Transaction<Database>,
  userId: string,
  others: string[],
): Promise<Set<string>> {
  const ids = [...new Set(others.filter((id) => id !== userId))];
  const apart = new Set<string>();
  if (!ids.length) return apart;
  const [blocks, people, connections] = await Promise.all([
    db
      .selectFrom('blocks')
      .select(['blocker_id', 'blocked_id'])
      .where((eb) =>
        eb.or([
          eb.and([eb('blocker_id', '=', userId), eb('blocked_id', 'in', ids)]),
          eb.and([eb('blocked_id', '=', userId), eb('blocker_id', 'in', ids)]),
        ]),
      )
      .execute(),
    db
      .selectFrom('users')
      .select(['id', 'birth_year'])
      .where('id', 'in', [userId, ...ids])
      .execute(),
    db
      .selectFrom('connections')
      .select(['user_a', 'user_b'])
      .where('status', '=', 'active')
      .where((eb) =>
        eb.or([
          eb.and([eb('user_a', '=', userId), eb('user_b', 'in', ids)]),
          eb.and([eb('user_b', '=', userId), eb('user_a', 'in', ids)]),
        ]),
      )
      .execute(),
  ]);
  for (const b of blocks) apart.add(b.blocker_id === userId ? b.blocked_id : b.blocker_id);
  const minors = new Set(people.filter((u) => isMinor(u.birth_year, ctx.now())).map((u) => u.id));
  const connected = new Set(connections.map((c) => (c.user_a === userId ? c.user_b : c.user_a)));
  for (const id of ids)
    if ((minors.has(userId) || minors.has(id)) && !connected.has(id)) apart.add(id);
  return apart;
}

/** Someone's "… is calling" is read on every device once it stops ringing for them. */
export async function ringStoppedFor(ctx: AppContext, callId: string, userIds: string[]) {
  for (const userId of userIds) {
    const read = await ctx.db
      .updateTable('notifications')
      .set({ read_at: ctx.now() })
      .where('user_id', '=', userId)
      .where('group_key', '=', `call:${callId}`)
      .where('read_at', 'is', null)
      .returning('id')
      .execute();
    if (read.length)
      await ctx.bus.publish([userId], {
        type: 'notifications.read',
        data: { ids: read.map((r) => r.id), all: false },
      });
  }
}

/** Those rung who never joined have missed it, and each hears so once. */
async function missed(ctx: AppContext, call: Call, userIds: string[]) {
  if (!userIds.length) return;
  const were = await ctx.db
    .updateTable('call_members')
    .set({ state: 'missed' })
    .where('call_id', '=', call.id)
    .where('user_id', 'in', userIds)
    .where('state', '=', 'ringing')
    .returning('user_id')
    .execute();
  const who = were.map((m) => m.user_id);
  if (!who.length) return;
  await ringStoppedFor(ctx, call.id, who);
  const [starter, conversation] = await Promise.all([
    call.caller_id
      ? ctx.db
          .selectFrom('users')
          .select('display_name')
          .where('id', '=', call.caller_id)
          .executeTakeFirst()
      : undefined,
    ctx.db
      .selectFrom('conversations')
      .select('title')
      .where('id', '=', call.conversation_id)
      .executeTakeFirst(),
  ]);
  for (const userId of who)
    await notify(ctx, {
      userId,
      kind: 'call',
      level: 'attention',
      title: `Missed group ${call.kind} call`,
      body:
        [
          starter ? `from ${starter.display_name}` : null,
          conversation?.title ? `in ${conversation.title}` : null,
        ]
          .filter(Boolean)
          .join(' ') || null,
      data: { conversationId: call.conversation_id, callId: call.id },
      groupKey: `call:${call.id}`,
    });
}

/**
 * End a group call, once: whoever is still ringing has missed it, whoever is in it has left,
 * everyone in the conversation hears it, and the conversation gets its line.
 */
export async function endGroupCall(
  ctx: AppContext,
  call: Call,
  outcome: CallOutcome,
  endedAt: Date = ctx.now(),
): Promise<Call | null> {
  const ended = await ctx.db
    .updateTable('calls')
    .set({ state: 'ended', outcome, ended_at: endedAt, rev: sql`rev + 1` })
    .where('id', '=', call.id)
    .where('state', '<>', 'ended')
    .returningAll()
    .executeTakeFirst();
  if (!ended) return null;
  const ringing = await ctx.db
    .selectFrom('call_members')
    .select('user_id')
    .where('call_id', '=', ended.id)
    .where('state', '=', 'ringing')
    .execute();
  await missed(
    ctx,
    ended,
    ringing.map((m) => m.user_id),
  );
  await ctx.db
    .updateTable('call_members')
    .set({ state: 'left', left_at: endedAt, device: null })
    .where('call_id', '=', ended.id)
    .where('state', '=', 'joined')
    .execute();
  await publishGroupCall(ctx, ended);
  const seconds =
    outcome === 'completed' && ended.answered_at
      ? Math.max(0, Math.round((endedAt.getTime() - ended.answered_at.getTime()) / 1000))
      : 0;
  if (ended.caller_id) {
    const joined = await ctx.db
      .selectFrom('call_members')
      .select(sql<number>`count(*)::int`.as('n'))
      .where('call_id', '=', ended.id)
      .where('joined_at', 'is not', null)
      .executeTakeFirstOrThrow();
    const line = await insertSystemMessage(ctx, ended.conversation_id, ended.caller_id, 'call', {
      kind: ended.kind,
      outcome,
      seconds,
      group: true,
      people: joined.n,
    });
    const [view] = await messageViews(ctx.db, [line], ended.caller_id);
    await ctx.bus.publish(
      (await participantsOf(ctx.db, ended.conversation_id)).map((p) => p.user_id),
      { type: 'message.created', data: view },
    );
  }
  return ended;
}

/**
 * After someone leaves, declines, misses it or is taken out: a call that has had two people in
 * it ends when fewer than two are left; one nobody else joined ends once nobody is still being
 * rung, or when whoever started it isn't in it any more. Whoever is left hears how it stands.
 */
export async function settleGroupCall(
  ctx: AppContext,
  callId: string,
  at: Date = ctx.now(),
): Promise<Call | undefined> {
  const load = () =>
    ctx.db.selectFrom('calls').selectAll().where('id', '=', callId).executeTakeFirst();
  // Who's in it has just changed: its revision goes up, so older views read as older.
  const call =
    (await ctx.db
      .updateTable('calls')
      .set({ rev: sql`rev + 1` })
      .where('id', '=', callId)
      .where('state', '<>', 'ended')
      .returningAll()
      .executeTakeFirst()) ?? (await load());
  if (!call || call.state === 'ended') return call;
  const members = await ctx.db
    .selectFrom('call_members')
    .select(['user_id', 'state'])
    .where('call_id', '=', callId)
    .execute();
  const joined = members.filter((m) => m.state === 'joined');
  let outcome: CallOutcome | null = null;
  if (call.state === 'active') {
    if (joined.length < 2) outcome = 'completed';
  } else if (!joined.some((m) => m.user_id === call.caller_id)) outcome = 'cancelled';
  else if (!members.some((m) => m.state === 'ringing'))
    // Everyone rung turned it down, or some didn't answer.
    outcome =
      members.some((m) => m.state === 'declined') && !members.some((m) => m.state === 'missed')
        ? 'declined'
        : 'missed';
  if (outcome) return (await endGroupCall(ctx, call, outcome, at)) ?? (await load());
  await publishGroupCall(ctx, call);
  return call;
}

/**
 * Take someone out of a call: in it, they've left; rung, they aren't any more (`rung` says what
 * that reads as). They hear how it stands even if they're no longer in the conversation.
 */
export async function takeOutOfGroupCall(
  ctx: AppContext,
  callId: string,
  userId: string,
  rung: 'declined' | 'left',
): Promise<void> {
  const member = ctx.db
    .updateTable('call_members')
    .where('call_id', '=', callId)
    .where('user_id', '=', userId);
  const out =
    (await member
      .set({ state: 'left', left_at: ctx.now(), device: null })
      .where('state', '=', 'joined')
      .returning('user_id')
      .executeTakeFirst()) ??
    (await member
      .set({ state: rung, device: null })
      .where('state', '=', 'ringing')
      .returning('user_id')
      .executeTakeFirst());
  if (!out) return;
  await ringStoppedFor(ctx, callId, [userId]);
  const call = await settleGroupCall(ctx, callId);
  if (!call) return;
  const people = await participantsOf(ctx.db, call.conversation_id);
  if (!people.some((p) => p.user_id === userId))
    await ctx.bus.publish([userId], {
      type: 'groupcall.updated',
      data: await groupCallView(ctx, call, userId),
    });
}

/**
 * One blocked the other while both are in a call or rung for it. Whoever blocked leaves it, or
 * is no longer rung; unless they're in it and the other is only rung, whose ring then stops.
 * Nobody is told why.
 */
export async function leaveGroupCallsWith(ctx: AppContext, blockerId: string, otherId: string) {
  const shared = await ctx.db
    .selectFrom('call_members as a')
    .innerJoin('call_members as b', 'b.call_id', 'a.call_id')
    .innerJoin('calls as c', 'c.id', 'a.call_id')
    .select(['a.call_id', 'a.state as mine', 'b.state as theirs'])
    .where('a.user_id', '=', blockerId)
    .where('b.user_id', '=', otherId)
    .where('a.state', 'in', ['joined', 'ringing'])
    .where('b.state', 'in', ['joined', 'ringing'])
    .where('c.state', '<>', 'ended')
    .execute();
  for (const s of shared) {
    if (s.mine === 'joined' && s.theirs === 'ringing')
      await takeOutOfGroupCall(ctx, s.call_id, otherId, 'left');
    else await takeOutOfGroupCall(ctx, s.call_id, blockerId, 'declined');
  }
}

/** Someone left, or was taken out of, these conversations: they're out of their calls too. */
export async function leaveGroupCallsIn(
  ctx: AppContext,
  userId: string,
  conversationIds: string[],
) {
  if (!conversationIds.length) return;
  const calls = await ctx.db
    .selectFrom('call_members as m')
    .innerJoin('calls as c', 'c.id', 'm.call_id')
    .select('m.call_id')
    .where('m.user_id', '=', userId)
    .where('m.state', 'in', ['joined', 'ringing'])
    .where('c.state', '<>', 'ended')
    .where('c.conversation_id', 'in', conversationIds)
    .execute();
  for (const c of calls) await takeOutOfGroupCall(ctx, c.call_id, userId, 'left');
}

/**
 * Whoever's ring ran out has missed it; whoever stopped saying they're there has left; and a
 * call whose people went some other way (an account deleted) is settled.
 */
export async function sweepGroupCalls(ctx: AppContext): Promise<void> {
  const now = ctx.now().getTime();
  const lapsed = await ctx.db
    .selectFrom('call_members as m')
    .innerJoin('calls as c', 'c.id', 'm.call_id')
    .select(['m.call_id', 'm.user_id'])
    .where('m.state', '=', 'ringing')
    .where('m.rung_at', '<=', new Date(now - CALL_RING_SECONDS * 1000))
    .where('c.state', '<>', 'ended')
    .limit(500)
    .execute();
  const byCall = new Map<string, string[]>();
  for (const m of lapsed) byCall.set(m.call_id, [...(byCall.get(m.call_id) ?? []), m.user_id]);
  for (const [callId, userIds] of byCall) {
    const call = await ctx.db
      .selectFrom('calls')
      .selectAll()
      .where('id', '=', callId)
      .executeTakeFirstOrThrow();
    await missed(ctx, call, userIds);
    await settleGroupCall(ctx, callId);
  }

  const gone = await ctx.db
    .selectFrom('call_members as m')
    .innerJoin('calls as c', 'c.id', 'm.call_id')
    .select(['m.call_id', 'm.user_id', 'm.seen_at'])
    .where('m.state', '=', 'joined')
    .where('m.seen_at', '<=', new Date(now - CALL_SEEN_MS))
    .where('c.state', '<>', 'ended')
    .limit(500)
    .execute();
  const lastThere = new Map<string, Date>();
  for (const m of gone) {
    const at = m.seen_at ?? ctx.now();
    await ctx.db
      .updateTable('call_members')
      .set({ state: 'left', left_at: at, device: null })
      .where('call_id', '=', m.call_id)
      .where('user_id', '=', m.user_id)
      .where('state', '=', 'joined')
      .execute();
    const last = lastThere.get(m.call_id);
    if (!last || at > last) lastThere.set(m.call_id, at);
  }
  // It lasted until the last of those who left was there.
  for (const [callId, at] of lastThere) await settleGroupCall(ctx, callId, at);

  const unsettled = await ctx.db
    .selectFrom('calls as c')
    .select('c.id')
    .where('c.is_group', '=', true)
    .where('c.state', '<>', 'ended')
    .where((eb) => {
      const members = (state: 'joined' | 'ringing') =>
        eb
          .selectFrom('call_members as m')
          .select('m.user_id')
          .whereRef('m.call_id', '=', 'c.id')
          .where('m.state', '=', state);
      return eb.or([
        eb.and([
          eb('c.state', '=', 'active'),
          eb(
            eb
              .selectFrom('call_members as m')
              .select(sql<number>`count(*)::int`.as('n'))
              .whereRef('m.call_id', '=', 'c.id')
              .where('m.state', '=', 'joined'),
            '<',
            2,
          ),
        ]),
        eb.and([
          eb('c.state', '=', 'ringing'),
          eb.or([
            eb.not(eb.exists(members('ringing'))),
            eb.not(eb.exists(members('joined').whereRef('m.user_id', '=', 'c.caller_id'))),
          ]),
        ]),
      ]);
    })
    .limit(200)
    .execute();
  for (const c of unsettled) await settleGroupCall(ctx, c.id);
}

export function registerGroupCallSweep(): void {
  registerPeriodic({ name: 'group-calls', everyMs: 5000, run: sweepGroupCalls });
}
