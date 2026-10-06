/**
 * Cai keeps going (R68): what Cai does for someone between their messages to it, always in its
 * own chat, and never in anyone's name without their tap.
 *
 * - A wait handed to Cai (`tasks.cai_follow_up`): at its remind time the reminders sweep asks
 *   `offerFollowUp`, which writes in Cai's chat who hasn't answered about what, with a
 *   follow-up ready to send (`payload.followUp`), and tells its owner once. `sendFollowUp` sends
 *   that follow-up as its owner, in their conversation with whom it waits on, only on their tap
 *   and only once (its client id is the offer's), then watches again in three days.
 * - The morning brief (`preferences.caiBrief`, off by default): one `cai.brief` job a day at the
 *   hour chosen, where the person is; it says, by the rules, what's on today and what's open,
 *   and queues the next day's. A brief whose hour has changed, or that was turned off, does
 *   nothing: the change queued its own.
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
  type SuggestionKind,
  systemAccountOf,
  tr,
  trn,
  zonedParts,
  zonedTimeToUtc,
} from '@caime/core';
import { greetingKey } from '@caime/core/home';
import { LEARN_WINDOW, leanFrom } from '@caime/core/learning';
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

const BRIEF_JOB = 'cai.brief';
const DAY_MS = 86_400_000;
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
export async function offerFollowUp(ctx: AppContext, t: Followed): Promise<boolean> {
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
  const line = () =>
    tr('{name} hasn’t answered about “{title}” yet. Shall I send this?', {
      name: other.display_name,
      title: t.title,
    });
  await asReader(ctx, t.owner_id, async () => {
    const draft = tr('Hi {name}, any news on “{title}”?', {
      name: firstName(other.display_name),
      title: t.title,
    });
    await postAs(ctx, CAI_ID, chat, {
      kind: 'text',
      body: `${line()}\n\n${draft}`,
      payload: { followUp: { taskId: t.id, conversationId: to, to: other.display_name, draft } },
    });
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

/** The next time the clock where they are reads `at` ("08:00"), a minute or more from now. */
export function nextBriefAt(now: Date, at: string, timeZone: string): Date {
  const [hour = 8, minute = 0] = at.split(':').map(Number);
  let zone = timeZone;
  let today: ReturnType<typeof zonedParts>;
  try {
    today = zonedParts(now, zone);
  } catch {
    zone = 'UTC';
    today = zonedParts(now, zone);
  }
  for (const days of [0, 1, 2]) {
    const d = addDays(today, days);
    const when = zonedTimeToUtc({ ...d, hour, minute }, zone);
    if (when.getTime() > now.getTime() + 60_000) return when;
  }
  return new Date(now.getTime() + DAY_MS);
}

/** Queue someone's next brief, if they asked for one (idempotent: one job per day and hour). */
export async function scheduleBrief(ctx: AppContext, userId: string): Promise<void> {
  const me = await ctx.db
    .selectFrom('users')
    .select(['preferences', 'time_zone'])
    .where('id', '=', userId)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
  const at = (me?.preferences as { caiBrief?: string | null } | undefined)?.caiBrief;
  if (!me || !at) return;
  const runAt = nextBriefAt(ctx.now(), at, me.time_zone);
  await enqueue(
    ctx,
    BRIEF_JOB,
    { userId, at },
    { runAt, dedupeKey: `brief:${userId}:${runAt.toISOString()}`, maxAttempts: 2 },
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
  const open = await openFor(ctx, me, { until: endOfDay });
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
}
