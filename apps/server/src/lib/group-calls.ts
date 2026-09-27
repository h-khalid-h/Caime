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
 *
 * Who's in a call changes one change at a time, under the call's own row lock (the one a join
 * takes): what's decided about a call is decided on the call as it is.
 */
import { CALL_RING_SECONDS, type CallOutcome, type GroupCallView, isMinor } from '@caishy/core';
import { type Kysely, sql, type Transaction } from 'kysely';
import type { AppContext } from '../context';
import type { Call, Database } from '../db/schema';
import { CALL_SEEN_MS, callInOf, lockCallEntry, nameShownTo } from './calls';
import { registerPeriodic } from './jobs';
import { insertSystemMessage, messageViews, participantsOf } from './messages';
import { notify, replaceShown } from './notify';
import { personViewsFor } from './people-batch';
import { avatarUrl } from './users';

type Db = Kysely<Database> | Transaction<Database>;

/**
 * The call as `viewerId` sees it. Who's in it (joined), and their own place in it; never who
 * else was rung, turned it down or missed it, nor whether anyone still is, which would tell the
 * group who was left out (a block, R29) or who was around and said no. Devices only to someone
 * in it too. Names and photos as each person shows the viewer. Someone no longer in the
 * conversation (`outsider`) sees only their own place in it.
 */
export async function groupCallView(
  ctx: AppContext,
  call: Call,
  viewerId: string,
  opts: { outsider?: boolean } = {},
): Promise<GroupCallView> {
  const outsider =
    opts.outsider ??
    !(await ctx.db
      .selectFrom('participants')
      .select('user_id')
      .where('conversation_id', '=', call.conversation_id)
      .where('user_id', '=', viewerId)
      .where('left_at', 'is', null)
      .executeTakeFirst());
  const all = await ctx.db
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
  const members = all.filter((m) => m.user_id === viewerId || (!outsider && m.state === 'joined'));
  const inIt = all.some((m) => m.user_id === viewerId && m.state === 'joined');
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
    outsider
      ? undefined
      : ctx.db
          .selectFrom('conversations')
          .select('title')
          .where('id', '=', call.conversation_id)
          .executeTakeFirst(),
  ]);
  const person = (u: { id: string; display_name: string; avatar_file_id: string | null }) =>
    u.id === viewerId
      ? {
          id: u.id,
          displayName: u.display_name,
          avatarUrl: avatarUrl({ id: u.id, avatar_file_id: u.avatar_file_id }),
        }
      : {
          id: u.id,
          displayName: others.get(u.id)?.displayName ?? u.display_name,
          avatarUrl: others.get(u.id)?.avatarUrl ?? null,
        };
  return {
    id: call.id,
    conversationId: call.conversation_id,
    conversationTitle: conversation?.title ?? null,
    kind: call.kind,
    state: call.state,
    rev: call.rev,
    outcome: call.outcome,
    startedBy: starter
      ? person(starter)
      : { id: call.caller_id ?? '', displayName: 'Deleted account', avatarUrl: null },
    members: members.map((m) => ({
      person: person({
        id: m.user_id,
        display_name: m.display_name,
        avatar_file_id: m.avatar_file_id,
      }),
      state: m.state,
      device: m.state === 'joined' && (inIt || m.user_id === viewerId) ? m.device : null,
      joinedAt: m.joined_at?.toISOString() ?? null,
    })),
    createdAt: call.created_at.toISOString(),
    answeredAt: call.answered_at?.toISOString() ?? null,
    endedAt: call.ended_at?.toISOString() ?? null,
  };
}

/**
 * Tell the conversation how the call stands, each person as they'd see it: those being rung
 * hear it ring (`rung`), everyone else in the conversation sees it for its banner.
 */
export async function publishGroupCall(
  ctx: AppContext,
  call: Call,
  rung: string[] = [],
): Promise<void> {
  const people = (await participantsOf(ctx.db, call.conversation_id)).map((p) => p.user_id);
  for (const userId of people) {
    const view = await groupCallView(ctx, call, userId, { outsider: false });
    await ctx.bus.publish([userId], {
      type: rung.includes(userId) ? 'groupcall.ringing' : 'groupcall.updated',
      data: view,
    });
  }
}

/** The group call someone is in now (joined, and still there), if any. */
export async function joinedGroupCallOf(ctx: AppContext, userId: string, db: Db = ctx.db) {
  return db
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
export async function liveGroupCallIn(ctx: AppContext, conversationId: string, db: Db = ctx.db) {
  return db
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
export async function inACall(ctx: AppContext, userId: string, except?: string, db: Db = ctx.db) {
  if (await callInOf(ctx, userId, db)) return true;
  const group = await joinedGroupCallOf(ctx, userId, db);
  return Boolean(group && group.id !== except);
}

/**
 * Of `others`, those never in a call with `userId`: either blocked the other, or one of the two
 * is under 18 and they aren't connected (R29). A call shows faces, and each device's network
 * address to the others.
 */
export async function keptApartFrom(
  ctx: Pick<AppContext, 'now'>,
  db: Db,
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

/**
 * Someone's "… is calling" is read on every device once it stops ringing for them, and a browser
 * still showing it says why, quietly (a missed call says so itself, in its place).
 */
export async function ringStoppedFor(
  ctx: AppContext,
  callId: string,
  userIds: string[],
  why: 'joined' | 'declined' | 'ended' | 'missed' = 'ended',
) {
  let title: string | null = null;
  for (const userId of userIds) {
    const read = await ctx.db
      .updateTable('notifications')
      .set({ read_at: ctx.now() })
      .where('user_id', '=', userId)
      .where('group_key', '=', `call:${callId}`)
      .where('read_at', 'is', null)
      .returning(['id', 'data'])
      .execute();
    if (!read.length) continue;
    await ctx.bus.publish([userId], {
      type: 'notifications.read',
      data: { ids: read.map((r) => r.id), all: false },
    });
    if (why === 'missed') continue;
    if (title === null)
      title = await ctx.db
        .selectFrom('calls as k')
        .innerJoin('conversations as c', 'c.id', 'k.conversation_id')
        .select('c.title')
        .where('k.id', '=', callId)
        .executeTakeFirst()
        .then((r) => `${r?.title ?? 'Group'} call`);
    const shown = title ?? 'Group call';
    for (const r of read)
      await replaceShown(ctx, r.id, {
        userId,
        kind: 'call',
        level: 'activity',
        title: shown,
        body: why === 'joined' ? 'Joined' : why === 'declined' ? 'Turned down' : 'Call ended',
        data: r.data as Record<string, unknown>,
        groupKey: `call:${callId}`,
        ttlSeconds: CALL_RING_SECONDS,
      });
  }
}

/** Those rung who never joined have missed it, and each hears so once (quietly, if muted). */
async function tellMissed(ctx: AppContext, call: Call, who: string[]) {
  if (!who.length) return;
  await ringStoppedFor(ctx, call.id, who, 'missed');
  const [conversation, muted] = await Promise.all([
    ctx.db
      .selectFrom('conversations')
      .select('title')
      .where('id', '=', call.conversation_id)
      .executeTakeFirst(),
    ctx.db
      .selectFrom('participants')
      .select('user_id')
      .where('conversation_id', '=', call.conversation_id)
      .where('user_id', 'in', who)
      .where('muted_until', '>', ctx.now())
      .execute(),
  ]);
  const quiet = new Set(muted.map((p) => p.user_id));
  for (const userId of who) {
    const starter = call.caller_id ? await nameShownTo(ctx, userId, call.caller_id) : null;
    await notify(ctx, {
      userId,
      kind: 'call',
      level: 'attention',
      title: `Missed group ${call.kind} call`,
      body:
        [
          starter ? `from ${starter}` : null,
          conversation?.title ? `in ${conversation.title}` : null,
        ]
          .filter(Boolean)
          .join(' ') || null,
      data: { conversationId: call.conversation_id, callId: call.id },
      groupKey: `call:${call.id}`,
      // A group someone has muted doesn't reach their phone about its calls.
      delivery: quiet.has(userId) ? 'silent' : 'push',
    });
  }
}

/**
 * How a call stands after a change: one that has had two people in it ends when fewer than two
 * are left; one nobody else joined ends when whoever started it isn't in it any more, or once its
 * ring time is up. Never sooner, even if everyone rung has said no: when it ends mustn't say
 * who was rung, or who turned it down. Otherwise it goes on (null).
 */
function outcomeOf(
  call: Call,
  members: { user_id: string; state: string }[],
  now: Date,
): CallOutcome | null {
  const joined = members.filter((m) => m.state === 'joined');
  if (call.state === 'active') return joined.length < 2 ? 'completed' : null;
  if (!joined.some((m) => m.user_id === call.caller_id)) return 'cancelled';
  const rang = now.getTime() >= call.created_at.getTime() + CALL_RING_SECONDS * 1000;
  return rang && !members.some((m) => m.state === 'ringing') ? 'missed' : null;
}

/** What a change to who's in a call did: whether anything changed, and who missed it. */
export interface CallChange {
  changed: boolean;
  /**
   * Nobody else can see it (a ring turned down, run out or stopped): the call's revision stays,
   * and only `tell` hear how it stands now, so nobody counts what they can't see.
   */
  unseen?: { tell: string[] };
  /** Rung, and their ring ran out: they missed it. */
  missed?: string[];
  /** If the call ends now, when it lasted until (the last moment someone was there). */
  at?: Date;
}

/** The conversation's line for a call that ended, from whoever started it. */
async function callLine(ctx: AppContext, ended: Call) {
  const [joined, first] = await Promise.all([
    ctx.db
      .selectFrom('call_members')
      .select(sql<number>`count(*)::int`.as('n'))
      .where('call_id', '=', ended.id)
      .where('joined_at', 'is not', null)
      .executeTakeFirstOrThrow(),
    ctx.db
      .selectFrom('call_members')
      .select('user_id')
      .where('call_id', '=', ended.id)
      .where('joined_at', 'is not', null)
      .orderBy('joined_at')
      .orderBy('user_id')
      .executeTakeFirst(),
  ]);
  // Whoever started it deleted their account: the call still happened, so its line is from the
  // first who joined it (a completed call reads the same to everyone).
  const actor = ended.caller_id ?? first?.user_id;
  if (!actor) return;
  const seconds =
    ended.outcome === 'completed' && ended.answered_at && ended.ended_at
      ? Math.max(0, Math.round((ended.ended_at.getTime() - ended.answered_at.getTime()) / 1000))
      : 0;
  const line = await insertSystemMessage(ctx, ended.conversation_id, actor, 'call', {
    kind: ended.kind,
    outcome: ended.outcome,
    seconds,
    group: true,
    people: joined.n,
  });
  const [view] = await messageViews(ctx.db, [line], actor);
  await ctx.bus.publish(
    (await participantsOf(ctx.db, ended.conversation_id)).map((p) => p.user_id),
    { type: 'message.created', data: view },
  );
}

/**
 * Change who's in a call (`change`, under the call's lock) and settle it: if it's over now it
 * ends, once (whoever is still ringing has missed it, whoever is in it has left, and the
 * conversation gets its line); otherwise its revision goes up and everyone hears how it stands.
 * A change that changed nothing tells nobody anything. With no `change`, the call is settled as
 * it is (people who went some other way, an account deleted).
 */
export async function settleGroupCall(
  ctx: AppContext,
  callId: string,
  change?: (trx: Transaction<Database>, call: Call) => Promise<CallChange>,
  at: Date = ctx.now(),
): Promise<Call | undefined> {
  const done = await ctx.db.transaction().execute(async (trx) => {
    const call = await trx
      .selectFrom('calls')
      .selectAll()
      .where('id', '=', callId)
      .where('is_group', '=', true)
      .forUpdate()
      .executeTakeFirst();
    if (!call || call.state === 'ended')
      return { call, changed: false, ended: false, missed: [] as string[] };
    const made = change ? await change(trx, call) : { changed: true };
    if (!made.changed) return { call, changed: false, ended: false, missed: [] as string[] };
    const members = await trx
      .selectFrom('call_members')
      .select(['user_id', 'state'])
      .where('call_id', '=', callId)
      .execute();
    const outcome = outcomeOf(call, members, ctx.now());
    if (!outcome && made.unseen)
      return {
        call,
        changed: true,
        ended: false,
        missed: made.missed ?? [],
        tell: made.unseen.tell,
      };
    if (!outcome) {
      // Who's in it has just changed: its revision goes up, so older views read as older.
      const bumped = await trx
        .updateTable('calls')
        .set({ rev: sql`rev + 1` })
        .where('id', '=', callId)
        .returningAll()
        .executeTakeFirstOrThrow();
      return { call: bumped, changed: true, ended: false, missed: made.missed ?? [] };
    }
    const endedAt = made.at ?? at;
    const ended = await trx
      .updateTable('calls')
      .set({ state: 'ended', outcome, ended_at: endedAt, rev: sql`rev + 1` })
      .where('id', '=', callId)
      .returningAll()
      .executeTakeFirstOrThrow();
    const stillRinging = await trx
      .updateTable('call_members')
      .set({ state: 'missed' })
      .where('call_id', '=', callId)
      .where('state', '=', 'ringing')
      .returning('user_id')
      .execute();
    await trx
      .updateTable('call_members')
      .set({ state: 'left', left_at: endedAt, device: null })
      .where('call_id', '=', callId)
      .where('state', '=', 'joined')
      .execute();
    return {
      call: ended,
      changed: true,
      ended: true,
      missed: [...(made.missed ?? []), ...stillRinging.map((m) => m.user_id)],
    };
  });
  if (!done.call) return undefined;
  await tellMissed(ctx, done.call, done.missed);
  const tell = 'tell' in done ? done.tell : undefined;
  if (done.changed && tell) {
    for (const userId of tell)
      await ctx.bus.publish([userId], {
        type: 'groupcall.updated',
        data: await groupCallView(ctx, done.call, userId),
      });
  } else if (done.changed) await publishGroupCall(ctx, done.call);
  if (done.ended) await callLine(ctx, done.call);
  return done.call;
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
  let out: 'joined' | 'rung' | null = null;
  const call = await settleGroupCall(ctx, callId, async (trx) => {
    const member = trx
      .updateTable('call_members')
      .where('call_id', '=', callId)
      .where('user_id', '=', userId);
    if (
      await member
        .set({ state: 'left', left_at: ctx.now(), device: null })
        .where('state', '=', 'joined')
        .returning('user_id')
        .executeTakeFirst()
    )
      out = 'joined';
    else if (
      await member
        .set({ state: rung, device: null })
        .where('state', '=', 'ringing')
        .returning('user_id')
        .executeTakeFirst()
    )
      out = 'rung';
    // A ring stopped is theirs to hear, nobody else's.
    return { changed: out !== null, unseen: out === 'rung' ? { tell: [userId] } : undefined };
  });
  if (!out || !call) return;
  await ringStoppedFor(ctx, callId, [userId]);
  if (out === 'rung') return;
  const people = await participantsOf(ctx.db, call.conversation_id);
  if (!people.some((p) => p.user_id === userId))
    await ctx.bus.publish([userId], {
      type: 'groupcall.updated',
      data: await groupCallView(ctx, call, userId, { outsider: true }),
    });
}

/**
 * While none of these people can start or join a call (the lock those take), do `f`: a join or
 * start under way finishes first and is seen by it, or begins after and sees what `f` changed.
 */
async function whileNoneEnter(
  ctx: AppContext,
  userIds: string[],
  f: (trx: Transaction<Database>) => Promise<void>,
) {
  await ctx.db.transaction().execute(async (trx) => {
    for (const id of [...new Set(userIds)].sort()) await lockCallEntry(trx, id);
    await f(trx);
  });
}

/**
 * One blocked the other while both are in a call or rung for it. Whoever blocked leaves it, or
 * is no longer rung; unless they're in it and the other is only rung, whose ring then stops.
 * Nobody is told why.
 */
export async function leaveGroupCallsWith(ctx: AppContext, blockerId: string, otherId: string) {
  await whileNoneEnter(ctx, [blockerId, otherId], async (trx) => {
    const shared = await trx
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
  });
}

/**
 * A connection between two people ended. Where one of them is under 18 they're no longer in a
 * call together (R29): as with a block, whoever removed it leaves the calls they share.
 */
export async function leaveGroupCallsAfterDisconnect(
  ctx: AppContext,
  removerId: string,
  otherId: string,
) {
  const people = await ctx.db
    .selectFrom('users')
    .select(['id', 'birth_year'])
    .where('id', 'in', [removerId, otherId])
    .execute();
  if (people.some((u) => isMinor(u.birth_year, ctx.now())))
    await leaveGroupCallsWith(ctx, removerId, otherId);
}

/** Someone left, or was taken out of, these conversations: they're out of their calls too. */
export async function leaveGroupCallsIn(
  ctx: AppContext,
  userId: string,
  conversationIds: string[],
) {
  if (!conversationIds.length) return;
  await whileNoneEnter(ctx, [userId], async (trx) => {
    const calls = await trx
      .selectFrom('call_members as m')
      .innerJoin('calls as c', 'c.id', 'm.call_id')
      .select('m.call_id')
      .where('m.user_id', '=', userId)
      .where('m.state', 'in', ['joined', 'ringing'])
      .where('c.state', '<>', 'ended')
      .where('c.conversation_id', 'in', conversationIds)
      .execute();
    for (const c of calls) await takeOutOfGroupCall(ctx, c.call_id, userId, 'left');
  });
}

/** An account is being deleted: it leaves every call it's in, and stops being rung for any. */
export async function leaveAllGroupCalls(ctx: AppContext, userId: string) {
  await whileNoneEnter(ctx, [userId], async (trx) => {
    const calls = await trx
      .selectFrom('call_members as m')
      .innerJoin('calls as c', 'c.id', 'm.call_id')
      .select('m.call_id')
      .where('m.user_id', '=', userId)
      .where('m.state', 'in', ['joined', 'ringing'])
      .where('c.state', '<>', 'ended')
      .execute();
    for (const c of calls) await takeOutOfGroupCall(ctx, c.call_id, userId, 'declined');
  });
}

/**
 * Whoever's ring ran out has missed it; whoever stopped saying they're there has left; and a
 * call whose people went some other way is settled. Each is decided again under the call's lock,
 * so someone who came back (or joined again) meanwhile stays.
 */
export async function sweepGroupCalls(ctx: AppContext): Promise<void> {
  const now = ctx.now().getTime();
  const rungBefore = new Date(now - CALL_RING_SECONDS * 1000);
  const lapsed = await ctx.db
    .selectFrom('call_members as m')
    .innerJoin('calls as c', 'c.id', 'm.call_id')
    .select(['m.call_id', 'm.user_id'])
    .where('m.state', '=', 'ringing')
    .where('m.rung_at', '<=', rungBefore)
    .where('c.state', '<>', 'ended')
    .limit(500)
    .execute();
  const byCall = new Map<string, string[]>();
  for (const m of lapsed) byCall.set(m.call_id, [...(byCall.get(m.call_id) ?? []), m.user_id]);
  for (const [callId, userIds] of byCall)
    await settleGroupCall(ctx, callId, async (trx) => {
      const were = await trx
        .updateTable('call_members')
        .set({ state: 'missed' })
        .where('call_id', '=', callId)
        .where('user_id', 'in', userIds)
        .where('state', '=', 'ringing')
        .returning('user_id')
        .execute();
      const who = were.map((m) => m.user_id);
      return { changed: who.length > 0, missed: who, unseen: { tell: who } };
    });

  const seenBefore = new Date(now - CALL_SEEN_MS);
  const gone = await ctx.db
    .selectFrom('call_members as m')
    .innerJoin('calls as c', 'c.id', 'm.call_id')
    .select(['m.call_id', 'm.user_id', 'm.device', 'm.seen_at'])
    .where('m.state', '=', 'joined')
    .where('m.seen_at', '<=', seenBefore)
    .where('c.state', '<>', 'ended')
    .limit(500)
    .execute();
  const goneByCall = new Map<string, typeof gone>();
  for (const m of gone) goneByCall.set(m.call_id, [...(goneByCall.get(m.call_id) ?? []), m]);
  for (const [callId, stale] of goneByCall)
    await settleGroupCall(ctx, callId, async (trx) => {
      let last: Date | undefined;
      for (const m of stale) {
        const at = m.seen_at ?? ctx.now();
        // Still gone, on the same device: one that came back, or joined again, stays.
        const out = await trx
          .updateTable('call_members')
          .set({ state: 'left', left_at: at, device: null })
          .where('call_id', '=', callId)
          .where('user_id', '=', m.user_id)
          .where('state', '=', 'joined')
          .where('seen_at', '<=', seenBefore)
          .where((eb) => (m.device ? eb('device', '=', m.device) : eb('device', 'is', null)))
          .returning('user_id')
          .executeTakeFirst();
        if (out && (!last || at > last)) last = at;
      }
      // It lasted until the last of those who left was there.
      return { changed: Boolean(last), at: last };
    });

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
            // Its ring time is up (everyone rung may have said no long before: it waited).
            eb('c.created_at', '<=', rungBefore),
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
