/**
 * Cai keeps going (R68): what Cai does for someone between their messages to it, always in its
 * own chat, and never in anyone's name without their tap.
 *
 * - A wait handed to Cai (`tasks.cai_follow_up`): at its remind time the reminders sweep asks
 *   `offerFollowUp`, which writes in Cai's chat where it stands (`lib/waits.ts`), with a
 *   follow-up ready to send (`payload.followUp`), and tells its owner once. `sendFollowUp` sends
 *   that follow-up as its owner, in their conversation with whom it waits on, only on their tap
 *   and only once (its client id is the offer's), then watches again in three days.
 * - The morning brief (`preferences.caiBrief`, off by default): one `cai.brief` job a day at the
 *   hour chosen, where the person is; it says, by the rules, what's on today and what's open,
 *   and queues the next day's. A brief whose hour has changed, or that was turned off, does
 *   nothing: the change queued its own.
 * - The weekly digest (`preferences.caiDigest`, off by default): one `cai.digest` job a week, at
 *   the start of the week they work, at the brief's hour or nine; it says, by the rules, who
 *   they talked with, who has gone quiet, what they've waited on longest and the week ahead,
 *   and queues the next. Read from their own conversations and tasks: counts, names and
 *   titles, never anyone's words.
 * - What Cai learned (`caiSettings`, `forgetLearned`): the counts behind every lean (M11) a kind
 *   at a time, and forgetting one kind or all of it (`users.learning_reset`).
 */
import {
  addDays,
  CAI_ID,
  type CaiFollowUpView,
  type CaiLearnedView,
  type CaiResponse,
  type FollowUpSentResponse,
  firstName,
  MANAGING_ROLES,
  type SuggestionKind,
  systemAccountOf,
  tr,
  trn,
  type WaitState,
  zonedParts,
  zonedTimeToUtc,
} from '@caime/core';
import { formatWhenAt } from '@caime/core/format';
import { greetingKey } from '@caime/core/home';
import { HELD_APPOINTMENT_STATES, OPEN_ORDER_STATES } from '@caime/core/kit-states';
import { LEARN_WINDOW, leanFrom } from '@caime/core/learning';
import { safeLocale } from '@caime/core/locale';
import { firstWorkday } from '@caime/core/time';
import { sql } from 'kysely';
import type { AppContext } from '../context';
import { MESSAGE_COLUMNS } from '../db/schema';
import { assertCanWrite } from './blocks';
import { membership } from './conversation-views';
import { badRequest, notFound } from './errors';
import { asReader } from './i18n';
import { enqueue, registerJob } from './jobs';
import { messageViews } from './messages';
import { notify } from './notify';
import { postAs } from './post-as';
import { pairKey } from './relations';
import { openFor, openSystemConversation, person } from './system-accounts';
import { visibleTasksSql } from './task-visibility';
import { cardsAhead } from './upcoming';

const BRIEF_JOB = 'cai.brief';
const DIGEST_JOB = 'cai.digest';
const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
/** The digest comes at the brief's hour, or at nine for someone who has no brief. */
const DIGEST_AT = '09:00';
/**
 * Gone quiet: someone a person exchanged at least this many messages with between six weeks
 * and a fortnight ago, and nothing since; a few at most.
 */
const QUIET = { sinceDays: 42, quietDays: 14, atLeast: 4, shown: 3 };
/** The week ahead's first few, by when. */
const AHEAD_SHOWN = 3;
/** The organizations someone runs that the digest looks at (R87), by name. */
const ORGS_SHOWN = 3;

/**
 * The week at each organization someone runs (R87): from the business inbox they already see as
 * its owner or an admin (`MANAGING_ROLES`), never a team member's own conversations. Counts only,
 * in two queries for them all; an organization with nothing to say is left out.
 */
async function teamWeeks(ctx: AppContext, userId: string, now: Date): Promise<string[]> {
  const orgs = await ctx.db
    .selectFrom('org_members as m')
    .innerJoin('organizations as o', 'o.id', 'm.org_id')
    .select(['o.id', 'o.name'])
    .where('m.user_id', '=', userId)
    .where('m.left_at', 'is', null)
    .where('m.role', 'in', [...MANAGING_ROLES])
    .where('o.archived_at', 'is', null)
    .orderBy('o.name')
    .limit(ORGS_SHOWN)
    .execute();
  if (!orgs.length) return [];
  const ids = orgs.map((o) => o.id);
  const weekAgo = new Date(now.getTime() - WEEK_MS);
  const weekOn = new Date(now.getTime() + WEEK_MS);
  const [threads, cards] = await Promise.all([
    sql<{ org_id: string; started: number; waiting: number }>`
      select t.org_id,
        count(*) filter (where t.created_at >= ${weekAgo})::int as started,
        count(*) filter (where t.resolved_at is null
          and t.last_customer_seq > t.last_team_seq)::int as waiting
      from business_threads t
      where t.org_id in (${sql.join(ids)}) and t.erased_at is null
      group by t.org_id`.execute(ctx.db),
    sql<{ org_id: string; bookings: number; orders: number }>`
      select t.org_id,
        count(*) filter (where m.payload->>'kit' = 'appointment')::int as bookings,
        count(*) filter (where m.payload->>'kit' = 'order_status')::int as orders
      from messages m
      join business_threads t on t.conversation_id = m.conversation_id
      where t.org_id in (${sql.join(ids)}) and m.kind = 'kit' and m.deleted_at is null
        and ((m.payload->>'kit' = 'appointment'
            and m.payload->>'state' in (${sql.join([...HELD_APPOINTMENT_STATES])})
            and m.card_start_at >= ${now} and m.card_start_at < ${weekOn})
          or (m.payload->>'kit' = 'order_status'
            and m.payload->>'state' in (${sql.join([...OPEN_ORDER_STATES])})))
      group by t.org_id`.execute(ctx.db),
  ]);
  const out: string[] = [];
  for (const org of orgs) {
    const t = threads.rows.find((r) => r.org_id === org.id);
    const c = cards.rows.find((r) => r.org_id === org.id);
    const lines = [
      t?.started
        ? trn(t.started, '• One new conversation this week', '• {n} new conversations this week')
        : null,
      t?.waiting
        ? trn(
            t.waiting,
            '• One customer waiting on the team',
            '• {n} customers waiting on the team',
          )
        : null,
      c?.bookings
        ? trn(c.bookings, '• One booking in the week ahead', '• {n} bookings in the week ahead')
        : null,
      c?.orders ? trn(c.orders, '• One order still open', '• {n} orders still open') : null,
    ].filter((l): l is string => l !== null);
    if (lines.length) out.push(tr('At {org}:', { org: org.name }), ...lines);
  }
  return out;
}
/** After a follow-up is sent, Cai looks again in three days. */
const WATCH_AGAIN_MS = 3 * DAY_MS;

const cai = () => systemAccountOf(CAI_ID)!;

interface Followed {
  id: string;
  owner_id: string;
  assignee_id: string | null;
  title: string;
  conversation_id: string | null;
}

/**
 * Where a follow-up to the person waited on goes: the wait's own conversation while both are in
 * it and the server can write there (never a private or a business one), else their one-to-one.
 */
async function followUpConversation(ctx: AppContext, t: Followed): Promise<string | null> {
  if (!t.assignee_id) return null;
  const usable = (q: ReturnType<typeof base>) => q.executeTakeFirst();
  const base = () =>
    ctx.db
      .selectFrom('conversations as c')
      .select('c.id')
      .where('c.privacy_class', '<>', 'private')
      .where('c.kind', '<>', 'business')
      .where((eb) =>
        eb.exists(
          eb
            .selectFrom('participants as p')
            .select('p.user_id')
            .whereRef('p.conversation_id', '=', 'c.id')
            .where('p.user_id', '=', t.assignee_id!)
            .where('p.left_at', 'is', null),
        ),
      )
      .where((eb) =>
        eb.exists(
          eb
            .selectFrom('participants as p')
            .select('p.user_id')
            .whereRef('p.conversation_id', '=', 'c.id')
            .where('p.user_id', '=', t.owner_id)
            .where('p.left_at', 'is', null),
        ),
      );
  if (t.conversation_id) {
    const own = await usable(base().where('c.id', '=', t.conversation_id));
    if (own) return own.id;
  }
  const direct = await usable(
    base()
      .where('c.direct_key', '=', pairKey(t.owner_id, t.assignee_id).key)
      .where('c.is_general', '=', true),
  );
  return direct?.id ?? null;
}

/**
 * A wait's remind time came and its owner handed it to Cai: the offer in Cai's chat, and one
 * notification. False when there's nowhere to send a follow-up: then it's a plain reminder.
 */
export async function offerFollowUp(
  ctx: AppContext,
  t: Followed,
  stands: WaitState,
): Promise<boolean> {
  // Its title would go into Cai's chat: never one tied to a private conversation (R18).
  if (t.conversation_id) {
    const c = await ctx.db
      .selectFrom('conversations')
      .select('privacy_class')
      .where('id', '=', t.conversation_id)
      .executeTakeFirst();
    if (c?.privacy_class === 'private') return false;
  }
  const to = await followUpConversation(ctx, t);
  if (!to || !t.assignee_id) return false;
  const other = await ctx.db
    .selectFrom('users')
    .select('display_name')
    .where('id', '=', t.assignee_id)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
  if (!other) return false;
  const { id: chat } = await openSystemConversation(ctx, t.owner_id, cai());
  // Where it stands, as the reminder would say it (M17 I2).
  const words = { name: other.display_name, title: t.title };
  const line = () =>
    stands === 'promised'
      ? tr('{name} said “{title}” would be done by now. Shall I send this?', words)
      : stands === 'unanswered'
        ? tr('{name} hasn’t answered about “{title}” yet. Shall I send this?', words)
        : tr('Still waiting on {name} for “{title}”. Shall I send this?', words);
  await asReader(ctx, t.owner_id, async () => {
    const draft = tr('Hi {name}, any news on “{title}”?', {
      name: firstName(other.display_name),
      title: t.title,
    });
    await postAs(
      ctx,
      CAI_ID,
      chat,
      {
        kind: 'text',
        body: `${line()}\n\n${draft}`,
        payload: { followUp: { taskId: t.id, conversationId: to, to: other.display_name, draft } },
      },
      { serverPayload: true },
    );
  });
  await notify(ctx, {
    userId: t.owner_id,
    kind: 'reminder',
    level: 'attention',
    title: () => tr('Cai'),
    body: line,
    data: { conversationId: chat, taskId: t.id },
  });
  return true;
}

interface FollowUpPayload {
  taskId: string;
  conversationId: string;
  to: string;
  draft: string;
  sentAt?: string;
  sentId?: string;
}

/** Cai's offer, sent as its owner's own message on their tap (R68), once. */
export async function sendFollowUp(
  ctx: AppContext,
  userId: string,
  offerId: string,
): Promise<FollowUpSentResponse> {
  const offer = await ctx.db
    .selectFrom('messages')
    .select(MESSAGE_COLUMNS)
    .where('id', '=', offerId)
    .where('sender_id', '=', CAI_ID)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
  const f = (offer?.payload as { followUp?: FollowUpPayload } | null)?.followUp;
  if (!offer || !f) throw notFound(tr('That follow-up'));
  // Only the person Cai offered it to: it's in their own chat with Cai.
  await membership(ctx, userId, offer.conversation_id);
  if (f.sentAt && f.sentId) return { conversationId: f.conversationId, messageId: f.sentId };
  const task = await ctx.db
    .selectFrom('tasks')
    .select(['id', 'status'])
    .where('id', '=', f.taskId)
    .where('owner_id', '=', userId)
    .executeTakeFirst();
  if (!task) throw notFound(tr('That wait'));
  if (task.status !== 'open' && task.status !== 'accepted')
    throw badRequest(tr('That’s no longer open.'));
  await membership(ctx, userId, f.conversationId);
  await assertCanWrite(ctx, f.conversationId, userId);
  const { message } = await postAs(ctx, userId, f.conversationId, f.draft, {
    clientId: `follow-up:${offerId}`,
    echo: true,
  });
  const now = ctx.now();
  const payload = {
    ...(offer.payload as object),
    followUp: { ...f, sentAt: now.toISOString(), sentId: message.id },
  };
  const [updated] = await ctx.db
    .updateTable('messages')
    .set({ payload: JSON.stringify(payload) })
    .where('id', '=', offerId)
    .returning(MESSAGE_COLUMNS)
    .execute();
  if (updated) {
    const [view] = await messageViews(ctx.db, [updated], userId);
    await ctx.bus.publish([userId], { type: 'message.updated', data: view });
  }
  // Cai keeps watching: it offers again in three days if nothing has changed.
  await ctx.db
    .updateTable('tasks')
    .set({ remind_at: new Date(now.getTime() + WATCH_AGAIN_MS), reminded_at: null })
    .where('id', '=', f.taskId)
    .where('cai_follow_up', '=', true)
    .execute();
  return { conversationId: f.conversationId, messageId: message.id };
}

/**
 * The next time the clock where they are reads `at` ("08:00"), a minute or more from now, on a
 * day they work (R76: no brief on their weekend; every day when the week is empty).
 */
export function nextBriefAt(
  now: Date,
  at: string,
  timeZone: string,
  workweek: number[] = [],
): Date {
  const [hour = 8, minute = 0] = at.split(':').map(Number);
  let zone = timeZone;
  let today: ReturnType<typeof zonedParts>;
  try {
    today = zonedParts(now, zone);
  } catch {
    zone = 'UTC';
    today = zonedParts(now, zone);
  }
  for (const days of [0, 1, 2, 3, 4, 5, 6, 7]) {
    const d = addDays(today, days);
    if (workweek.length && !workweek.includes(d.weekday)) continue;
    const when = zonedTimeToUtc({ ...d, hour, minute }, zone);
    if (when.getTime() > now.getTime() + 60_000) return when;
  }
  return new Date(now.getTime() + DAY_MS);
}

const BRIEF_SPREAD_MS = 5 * 60_000;
/** A person's own place in the five minutes after their hour: the same every day. */
export function briefJitterMs(userId: string): number {
  let h = 5381;
  for (let i = 0; i < userId.length; i++) h = (h * 33) ^ userId.charCodeAt(i);
  return (h >>> 0) % BRIEF_SPREAD_MS;
}

/** Queue someone's next brief, if they asked for one (idempotent: one job per day and hour). */
export async function scheduleBrief(ctx: AppContext, userId: string): Promise<void> {
  const me = await ctx.db
    .selectFrom('users')
    .select(['preferences', 'time_zone', 'workweek'])
    .where('id', '=', userId)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
  const at = (me?.preferences as { caiBrief?: string | null } | undefined)?.caiBrief;
  if (!me || !at) return;
  // Within five minutes of the hour, the same minutes for the same person (M25): a city's
  // briefs at 08:00 were one burst on one queue.
  const runAt = new Date(
    nextBriefAt(ctx.now(), at, me.time_zone, me.workweek ?? []).getTime() + briefJitterMs(userId),
  );
  await enqueue(
    ctx,
    BRIEF_JOB,
    { userId, at },
    { runAt, dedupeKey: `cai-brief:${userId}:${runAt.toISOString()}`, maxAttempts: 2 },
  );
}

/**
 * The brief, by the rules, in the reader's language: today, then what's open; and the one line
 * its notification says.
 */
export async function briefText(
  ctx: AppContext,
  userId: string,
): Promise<{ text: string; summary: string }> {
  const me = await person(ctx, userId);
  const now = ctx.now();
  let endOfDay: Date;
  try {
    endOfDay = zonedTimeToUtc(addDays(zonedParts(now, me.time_zone), 1), me.time_zone);
  } catch {
    endOfDay = new Date(now.getTime() + DAY_MS);
  }
  // Written into Cai's chat, which the server keeps and a model reads: nothing from a private
  // conversation (R18).
  const open = await openFor(ctx, me, { until: endOfDay, forModel: true });
  const counts = [
    open.counts.asked
      ? trn(open.counts.asked, 'One thing is asked of you.', '{n} things are asked of you.')
      : null,
    open.counts.waiting
      ? trn(open.counts.waiting, 'You’re waiting on one thing.', 'You’re waiting on {n} things.')
      : null,
    open.counts.mine
      ? trn(open.counts.mine, 'You said you’d do one thing.', 'You said you’d do {n} things.')
      : null,
  ].filter((l): l is string => l !== null);
  const today = open.coming.length
    ? [tr('Today:'), ...open.coming]
    : [tr('Nothing is planned for today.')];
  const text = [
    `${tr(greetingKey(now, me.time_zone), { name: firstName(me.display_name) })}.`,
    ...today,
    ...counts,
    tr('Ask me about any of it.'),
  ].join('\n');
  const summary = open.coming[0]?.replace(/^• /, '') ?? counts[0] ?? today[0] ?? '';
  return { text, summary };
}

async function briefJob(ctx: AppContext, payload: Record<string, unknown>): Promise<void> {
  const userId = String(payload.userId);
  const me = await ctx.db
    .selectFrom('users')
    .select(['preferences'])
    .where('id', '=', userId)
    .where('deleted_at', 'is', null)
    .where('suspended_at', 'is', null)
    .executeTakeFirst();
  const at = (me?.preferences as { caiBrief?: string | null } | undefined)?.caiBrief;
  // Turned off, or moved to another hour (whose own job is queued): nothing to say now.
  if (!me || !at || at !== payload.at) return;
  try {
    const { id: chat } = await openSystemConversation(ctx, userId, cai());
    const { text, summary } = await asReader(ctx, userId, () => briefText(ctx, userId));
    await postAs(ctx, CAI_ID, chat, text);
    await notify(ctx, {
      userId,
      kind: 'reminder',
      level: 'activity',
      title: () => tr('Cai'),
      body: summary,
      data: { conversationId: chat },
    });
  } finally {
    await scheduleBrief(ctx, userId);
  }
}

/**
 * The start of the next week they work (R76: its first day, `firstWorkday`) at `at`, where they
 * are, a minute or more from now.
 */
export function nextDigestAt(
  now: Date,
  at: string,
  timeZone: string,
  workweek: number[] = [],
): Date {
  const [hour = 9, minute = 0] = at.split(':').map(Number);
  const first = firstWorkday(workweek);
  let zone = timeZone;
  let today: ReturnType<typeof zonedParts>;
  try {
    today = zonedParts(now, zone);
  } catch {
    zone = 'UTC';
    today = zonedParts(now, zone);
  }
  for (const days of [0, 1, 2, 3, 4, 5, 6, 7]) {
    const d = addDays(today, days);
    if (d.weekday !== first) continue;
    const when = zonedTimeToUtc({ ...d, hour, minute }, zone);
    if (when.getTime() > now.getTime() + 60_000) return when;
  }
  return new Date(now.getTime() + WEEK_MS);
}

/** The hour someone's digest comes: their brief's, else nine. */
const digestHour = (preferences: unknown) =>
  (preferences as { caiBrief?: string | null } | undefined)?.caiBrief ?? DIGEST_AT;

/** Queue someone's next digest, if they asked for one (idempotent: one job per week and hour). */
export async function scheduleDigest(ctx: AppContext, userId: string): Promise<void> {
  const me = await ctx.db
    .selectFrom('users')
    .select(['preferences', 'time_zone', 'workweek'])
    .where('id', '=', userId)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
  if (!me || !(me.preferences as { caiDigest?: boolean }).caiDigest) return;
  const at = digestHour(me.preferences);
  const runAt = new Date(
    nextDigestAt(ctx.now(), at, me.time_zone, me.workweek ?? []).getTime() + briefJitterMs(userId),
  );
  await enqueue(
    ctx,
    DIGEST_JOB,
    { userId, at },
    { runAt, dedupeKey: `cai-digest:${userId}:${runAt.toISOString()}`, maxAttempts: 2 },
  );
}

/**
 * The weekly digest (R68), by the rules, in the reader's language: who they talked with last
 * week, what they did that they'd said they would, who has gone quiet, what they've waited on
 * longest, and the week ahead; and the one line its notification says. From their own
 * one-to-ones and tasks: counts, names and titles, never anyone's words. One round of queries.
 */
export async function digestText(
  ctx: AppContext,
  userId: string,
): Promise<{ text: string; summary: string }> {
  const me = await person(ctx, userId);
  const now = ctx.now();
  const weekAgo = new Date(now.getTime() - WEEK_MS);
  const quietFrom = new Date(now.getTime() - QUIET.sinceDays * DAY_MS);
  const quietSince = new Date(now.getTime() - QUIET.quietDays * DAY_MS);
  // Their one-to-ones with people (never Cai, a friend, a bot or a guest), answered on both
  // sides and nobody blocked. Both read when each last had a message (kept on the
  // conversation); only one that's gone quiet reads its last few, to know it was busy before.
  const pairs = sql`participants p1
    join conversations c on c.id = p1.conversation_id and c.kind = 'direct'
    join participants p2 on p2.conversation_id = c.id and p2.user_id <> ${userId}
    join users u on u.id = p2.user_id and u.kind = 'human' and u.deleted_at is null`;
  const mine = sql`p1.user_id = ${userId} and p1.left_at is null
    and coalesce(p1.request_state, 'accepted') = 'accepted'
    and coalesce(p2.request_state, 'accepted') = 'accepted'
    and not exists (select 1 from blocks b
      where (b.blocker_id = ${userId} and b.blocked_id = u.id)
         or (b.blocker_id = u.id and b.blocked_id = ${userId}))`;
  const [talked, kept, quiet, longest, ahead, teams] = await Promise.all([
    sql<{ n: number }>`
      select count(distinct u.id)::int as n from ${pairs}
      where ${mine} and c.last_message_at >= ${weekAgo}`.execute(ctx.db),
    // What they said they'd do (their own, as the brief counts it) and did this week.
    ctx.db
      .selectFrom('tasks')
      .select(sql<number>`count(*)::int`.as('n'))
      .where(visibleTasksSql(userId))
      .where('owner_id', '=', userId)
      .where('assignee_id', '=', userId)
      .where('status', '=', 'done')
      .where('completed_at', '>=', weekAgo)
      .executeTakeFirstOrThrow(),
    // Gone quiet: a one-to-one not put away whose last word was two to six weeks ago, with a
    // few before it in that time (its last messages, by the conversation's index).
    sql<{ name: string; last: Date }>`
      select u.display_name as name, c.last_message_at as last from ${pairs}
      where ${mine} and p1.archived_at is null and p2.left_at is null
        and c.last_message_at >= ${quietFrom} and c.last_message_at < ${quietSince}
        and (select m.created_at from messages m
          where m.conversation_id = c.id and m.deleted_at is null and m.kind <> 'system'
          order by m.seq desc offset ${QUIET.atLeast - 1} limit 1) >= ${quietFrom}
      order by c.last_message_at desc, u.id
      limit ${QUIET.shown}`.execute(ctx.db),
    // Their oldest wait, as the Attention home lists waits (R66).
    ctx.db
      .selectFrom('tasks as t')
      .leftJoin('users as a', 'a.id', 't.assignee_id')
      .leftJoin('conversations as c', 'c.id', 't.conversation_id')
      .select(['t.title', 'a.display_name as who'])
      .where(visibleTasksSql(userId, 't'))
      .where((eb) =>
        eb.or([eb('c.privacy_class', 'is', null), eb('c.privacy_class', '<>', 'private')]),
      )
      .where('t.owner_id', '=', userId)
      .where('t.assignee_id', 'is distinct from', userId)
      .where('t.status', 'in', ['open', 'accepted'])
      .orderBy('t.created_at', 'asc')
      .limit(1)
      .executeTakeFirst(),
    cardsAhead(ctx, userId, {
      from: now,
      until: new Date(now.getTime() + WEEK_MS),
      limit: 50,
      agreedOnly: true,
      series: { now },
    }),
    teamWeeks(ctx, userId, now),
  ]);
  const people = talked.rows[0]?.n ?? 0;
  const gone = quiet.rows.map((q) =>
    trn(
      Math.max(1, Math.floor((now.getTime() - new Date(q.last).getTime()) / WEEK_MS)),
      '• {name}: nothing for a week',
      '• {name}: nothing for {n} weeks',
      { name: q.name },
    ),
  );
  const locale = safeLocale(me.locale);
  const soon = ahead
    .slice(0, AHEAD_SHOWN)
    .map(
      (c) =>
        `• ${formatWhenAt(c.at.toISOString(), c.hasTime, now, me.time_zone, locale)} · ${c.title}`,
    );
  const lines = [
    people
      ? trn(
          people,
          'Last week you talked with one person.',
          'Last week you talked with {n} people.',
        )
      : null,
    kept.n
      ? trn(
          kept.n,
          'You did one thing you said you would.',
          'You did {n} things you said you would.',
        )
      : null,
    ...(gone.length ? [tr('Gone quiet:'), ...gone] : []),
    longest
      ? tr('You’ve waited longest on {name}: {title}.', {
          name: longest.who ?? tr('Someone'),
          title: longest.title,
        })
      : null,
    ahead.length
      ? trn(
          ahead.length,
          'One meeting or appointment this week.',
          '{n} meetings and appointments this week.',
        )
      : null,
    ...soon,
    ...teams,
  ].filter((l): l is string => l !== null);
  const text = [
    `${tr(greetingKey(now, me.time_zone), { name: firstName(me.display_name) })}.`,
    tr('Here’s your week with your people.'),
    ...(lines.length ? lines : [tr('A quiet week: nothing to tell you.')]),
    tr('Ask me about any of it.'),
  ].join('\n');
  const summary = gone.length
    ? trn(gone.length, 'One person has gone quiet.', '{n} people have gone quiet.')
    : (lines[0] ?? tr('A quiet week: nothing to tell you.'));
  return { text, summary };
}

async function digestJob(ctx: AppContext, payload: Record<string, unknown>): Promise<void> {
  const userId = String(payload.userId);
  const me = await ctx.db
    .selectFrom('users')
    .select(['preferences'])
    .where('id', '=', userId)
    .where('deleted_at', 'is', null)
    .where('suspended_at', 'is', null)
    .executeTakeFirst();
  // Turned off, or moved to another hour (whose own job is queued): nothing to say now.
  if (!me || !(me.preferences as { caiDigest?: boolean }).caiDigest) return;
  if (digestHour(me.preferences) !== payload.at) return;
  try {
    const { id: chat } = await openSystemConversation(ctx, userId, cai());
    const { text, summary } = await asReader(ctx, userId, () => digestText(ctx, userId));
    await postAs(ctx, CAI_ID, chat, text);
    await notify(ctx, {
      userId,
      kind: 'reminder',
      level: 'activity',
      title: () => tr('Cai'),
      body: summary,
      data: { conversationId: chat },
    });
  } finally {
    await scheduleDigest(ctx, userId);
  }
}

/** Settings · Cai: what it follows up, and what it has learned, a kind at a time. */
export async function caiSettings(ctx: AppContext, userId: string): Promise<CaiResponse> {
  const [me, followed, decided] = await Promise.all([
    ctx.db
      .selectFrom('users')
      .select(['preferences'])
      .where('id', '=', userId)
      .executeTakeFirstOrThrow(),
    ctx.db
      .selectFrom('tasks as t')
      .leftJoin('users as a', 'a.id', 't.assignee_id')
      .select(['t.id', 't.title', 't.remind_at', 't.reminded_at', 'a.display_name as who'])
      .where('t.owner_id', '=', userId)
      .where('t.cai_follow_up', '=', true)
      .where('t.status', 'in', ['open', 'accepted'])
      .orderBy('t.created_at')
      .limit(50)
      .execute(),
    // The last decisions on each kind since it (or everything) was forgotten: one query.
    sql<{ kind: SuggestionKind; status: string }>`
      select kind, status from (
        select s.kind, s.status,
          row_number() over (partition by s.kind order by s.resolved_at desc) as n
        from suggestions s join users u on u.id = s.user_id
        where s.user_id = ${userId}
          and s.status in ('accepted', 'dismissed')
          and s.resolved_at > greatest(
            coalesce((u.learning_reset ->> s.kind)::timestamptz, '-infinity'),
            coalesce((u.learning_reset ->> '*')::timestamptz, '-infinity'))
      ) d where n <= ${LEARN_WINDOW.kind}`.execute(ctx.db),
  ]);
  const followUps: CaiFollowUpView[] = followed.map((t) => ({
    taskId: t.id,
    title: t.title,
    who: t.who ?? tr('Someone'),
    at: t.reminded_at ? null : (t.remind_at?.toISOString() ?? null),
  }));
  const kinds = [...new Set(decided.rows.map((r) => r.kind))];
  const learned: CaiLearnedView[] = kinds.map((kind) => {
    const rows = decided.rows.filter((r) => r.kind === kind);
    const counts = {
      accepted: rows.filter((r) => r.status === 'accepted').length,
      dismissed: rows.filter((r) => r.status === 'dismissed').length,
    };
    return { kind, ...counts, lean: leanFrom(null, counts)?.lean ?? null };
  });
  return {
    followUps,
    learned,
    learning: (me.preferences as { learnFromChoices?: boolean }).learnFromChoices !== false,
  };
}

/** Forget what Cai learned of one kind, or of everything (R68): the decisions stay. */
export async function forgetLearned(
  ctx: AppContext,
  userId: string,
  kind: SuggestionKind | undefined,
): Promise<void> {
  await ctx.db
    .updateTable('users')
    .set({
      learning_reset: sql`learning_reset || jsonb_build_object(${kind ?? '*'}::text, ${ctx
        .now()
        .toISOString()}::text)`,
    })
    .where('id', '=', userId)
    .execute();
}

export function registerCaiJobs(): void {
  registerJob(BRIEF_JOB, briefJob);
  registerJob(DIGEST_JOB, digestJob);
}
