/**
 * A meeting that repeats (R58): agreed once, held every week, every two weeks or every month,
 * each time as a card of its own, so each time has its brief, its Join and "starting now", its
 * guests and its own Cancel. The first card carries the series (core `series.ts`: its id, which
 * time it is, when the first was and the proposer's zone); once it's accepted, the end of each
 * time posts the next (`meeting.next`, a minute after it ends), already accepted and told to
 * nobody: it's the series going on, not something anyone said. Its brief, its start and the
 * time after it are queued as any accepted meeting's are. A time cancelled leaves the rest;
 * "Stop repeating" on the time ahead ends the series there. Where its organizer can no longer
 * write (they left, or a block), the series ends quietly; the calendar stops looking ahead a
 * day after a time with no next one.
 */
import type { MessageView } from '@caime/core';
import { tr } from '@caime/core/i18n';
import { isRepeat, type Repeat } from '@caime/core/repeat';
import { type MeetingSeries, nextOccurrence, seriesAgreed, seriesOf } from '@caime/core/series';
import type { AppContext } from '../context';
import { MESSAGE_COLUMNS, type Message } from '../db/schema';
import { eachLimit } from './batch';
import { assertCanWrite } from './blocks';
import { queueBrief } from './briefs';
import { membership } from './conversation-views';
import { AppError, badRequest, notFound } from './errors';
import { enqueue, registerJob } from './jobs';
import { queueMeetingStart } from './meeting-start';
import { messageViews, participantsOf, sendMessage } from './messages';
import { notify } from './notify';

const NEXT_JOB = 'meeting.next';
/**
 * The next time is posted this long after one ends, and "Stop repeating" is taken only before
 * it ends: a stop pressed in the last moment is written before the next is looked for.
 */
export const NEXT_AFTER_MS = 60_000;
/** A meeting whose length isn't known holds an hour, as the calendar takes it. */
const DEFAULT_MINUTES = 60;

interface MeetingPayload {
  kit?: string;
  state?: string;
  title?: string;
  movedTo?: unknown;
  series?: unknown;
  fields?: {
    title?: unknown;
    start?: { at?: string; hasTime?: boolean };
    durationMinutes?: unknown;
    repeat?: unknown;
  } & Record<string, unknown>;
}

/** A card the series continues from: a meeting with its series and a repeat still on. */
export interface SeriesCard {
  series: MeetingSeries;
  repeat: Repeat;
}

export function seriesCard(payload: unknown): SeriesCard | null {
  const p = (payload ?? {}) as MeetingPayload;
  if (p.kit !== 'meeting') return null;
  const series = seriesOf(p);
  const repeat = p.fields?.repeat;
  return series && isRepeat(repeat) ? { series, repeat } : null;
}

/** The client id a time of a series is posted with: twice is once. */
export function occurrenceClientId(seriesId: string, n: number): string {
  return `series-${seriesId}-${n}`;
}

/**
 * The calendar event a meeting is (the feed, an invitation): a time of a series is the same
 * event before it's posted (the calendar looking ahead) and after, so a calendar app keeps one.
 */
export function meetingUid(messageId: string, series: Pick<MeetingSeries, 'id' | 'n'> | null) {
  return series ? `meeting-${series.id}-${series.n}@caime` : `meeting-${messageId}@caime`;
}

function endOf(p: MeetingPayload): number | null {
  const at = p.fields?.start?.at ? Date.parse(p.fields.start.at) : Number.NaN;
  if (!Number.isFinite(at)) return null;
  const minutes = Number(p.fields?.durationMinutes);
  return at + (Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_MINUTES) * 60_000;
}

/** Queued when a repeating meeting is accepted, and for each time posted: the next, at its end. */
export async function queueNextTime(ctx: AppContext, messageId: string): Promise<void> {
  const m = await ctx.db
    .selectFrom('messages')
    .select(['payload', 'kind', 'deleted_at'])
    .where('id', '=', messageId)
    .executeTakeFirst();
  if (m?.kind !== 'kit' || m.deleted_at) return;
  const p = (m.payload ?? {}) as MeetingPayload;
  const end = endOf(p);
  if (!seriesCard(p) || end === null || !seriesAgreed(p)) return;
  await enqueue(
    ctx,
    NEXT_JOB,
    { messageId },
    {
      runAt: new Date(Math.max(ctx.now().getTime(), end + NEXT_AFTER_MS)),
      dedupeKey: `meeting-next:${messageId}`,
      maxAttempts: 3,
    },
  );
}

type Posted = (ctx: AppContext, posted: Message, from: Message) => Promise<void>;
const whenPosted: Posted[] = [];

/** Something more that follows a time posted (a meeting space's guests asked again). */
export function onOccurrencePosted(handler: Posted): void {
  if (!whenPosted.includes(handler)) whenPosted.push(handler);
}

async function nextJob(ctx: AppContext, payload: Record<string, unknown>): Promise<void> {
  const from = await ctx.db
    .selectFrom('messages')
    .select(MESSAGE_COLUMNS)
    .where('id', '=', String(payload.messageId))
    .executeTakeFirst();
  if (from?.kind !== 'kit' || from.deleted_at || !from.sender_id) return;
  const p = (from.payload ?? {}) as MeetingPayload;
  const card = seriesCard(p);
  // Stopped, moved to its own space (its copy there goes on), or never agreed: nothing follows.
  if (!card || p.movedTo || !seriesAgreed(p)) return;
  const next = nextOccurrence(card.series, card.repeat, ctx.now());
  if (!next) return;
  let posted: { message: Message; created: boolean };
  try {
    posted = await sendMessage(
      ctx,
      from.sender_id,
      from.conversation_id,
      {
        clientId: occurrenceClientId(card.series.id, next.n),
        kind: 'kit',
        payload: {
          kit: 'meeting',
          fields: {
            ...p.fields,
            start: { at: next.at.toISOString(), hasTime: p.fields?.start?.hasTime !== false },
          },
        },
      },
      { occurrence: { series: { ...card.series, n: next.n }, agreed: true } },
    );
  } catch (err) {
    // Its organizer can no longer write there (they left, a block, the group closed): the
    // series ends with the time before.
    if (err instanceof AppError) {
      ctx.log.info({ messageId: from.id, code: err.code }, 'a meeting series ended');
      return;
    }
    throw err;
  }
  const { message } = posted;
  if (posted.created) {
    const members = (await participantsOf(ctx.db, message.conversation_id)).map((x) => x.user_id);
    const [view] = await messageViews(ctx.db, [message], from.sender_id);
    if (view)
      await ctx.bus.publish(members, {
        type: 'message.created',
        data: { ...view, clientId: null },
      });
  }
  await queueBrief(ctx, message.id);
  await queueMeetingStart(ctx, message.id);
  await queueNextTime(ctx, message.id);
  if (posted.created) for (const handler of whenPosted) await handler(ctx, message, from);
}

export function registerSeriesJob(): void {
  registerJob(NEXT_JOB, nextJob);
}

/**
 * "Stop repeating" (R58): on the time ahead, by anyone it's for; the series ends with it. Under
 * the card's row lock, and only before it ends, so the next is never posted after a stop.
 */
export async function stopRepeating(
  ctx: AppContext,
  messageId: string,
  actorId: string,
): Promise<MessageView> {
  const found = await ctx.db
    .selectFrom('messages')
    .select(['conversation_id', 'kind', 'deleted_at'])
    .where('id', '=', messageId)
    .executeTakeFirst();
  if (found?.kind !== 'kit' || found.deleted_at) throw notFound(tr('That message'));
  await membership(ctx, actorId, found.conversation_id);
  await assertCanWrite(ctx, found.conversation_id, actorId);
  const stopped = await ctx.db.transaction().execute(async (trx) => {
    const m = await trx
      .selectFrom('messages')
      .select(MESSAGE_COLUMNS)
      .where('id', '=', messageId)
      .forUpdate()
      .executeTakeFirstOrThrow();
    const p = (m.payload ?? {}) as MeetingPayload;
    if (!seriesCard(p) || p.movedTo) throw badRequest(tr('That meeting doesn’t repeat.'));
    const end = endOf(p);
    if (end === null || end <= ctx.now().getTime())
      throw badRequest(tr('That one is over. Stop it from the next one.'));
    const { repeat: _, ...fields } = p.fields ?? {};
    return trx
      .updateTable('messages')
      .set({
        payload: JSON.stringify({
          ...p,
          fields,
          repeatStopped: { by: actorId, at: ctx.now().toISOString() },
        }),
      })
      .where('id', '=', messageId)
      .returning(MESSAGE_COLUMNS)
      .executeTakeFirstOrThrow();
  });
  const [view] = await messageViews(ctx.db, [stopped], actorId);
  if (!view) throw notFound(tr('That message'));
  const members = (await participantsOf(ctx.db, stopped.conversation_id)).map((x) => x.user_id);
  await ctx.bus.publish(members, { type: 'message.updated', data: { ...view, clientId: null } });
  const mover = await ctx.db
    .selectFrom('users')
    .select('display_name')
    .where('id', '=', actorId)
    .executeTakeFirstOrThrow();
  const title = (stopped.payload as MeetingPayload).title ?? '';
  // Everyone else it was for hears it, a few at a time (convention 14), each in their language.
  await eachLimit(
    members.filter((userId) => userId !== actorId),
    4,
    async (userId) => {
      await notify(ctx, {
        userId,
        kind: 'kit',
        level: 'activity',
        title: () => tr('{name}: stopped repeating', { name: mover.display_name }),
        body: () => `${tr('Meeting')} · ${title}`,
        // A card's changes are one notification, its latest.
        groupKey: `kit:${messageId}`,
        data: { conversationId: stopped.conversation_id, messageId },
      });
    },
  );
  return view;
}
