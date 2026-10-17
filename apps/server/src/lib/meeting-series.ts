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
import type { AppointmentBooking, MessageView } from '@caime/core';
import { formatWhenAt } from '@caime/core/format';
import { tr } from '@caime/core/i18n';
import { safeLocale } from '@caime/core/locale';
import { isRepeat, type Repeat } from '@caime/core/repeat';
import {
  isDay,
  type MeetingSeries,
  nextOccurrence,
  seriesAgreed,
  seriesOf,
} from '@caime/core/series';
import type { AppContext } from '../context';
import { MESSAGE_COLUMNS, type Message } from '../db/schema';
import { eachLimit } from './batch';
import { assertCanWrite } from './blocks';
import { pickProvider } from './booking';
import { queueBrief } from './briefs';
import { queueCalendarPush } from './calendar-push';
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
  booking?: AppointmentBooking | null;
  state?: string;
  title?: string;
  movedTo?: unknown;
  series?: unknown;
  fields?: {
    title?: unknown;
    start?: { at?: string; hasTime?: boolean };
    durationMinutes?: unknown;
    repeat?: unknown;
    repeatUntil?: unknown;
  } & Record<string, unknown>;
}

/**
 * A card the series continues from: a meeting or an appointment (R58) with its series and a
 * repeat still on.
 */
export interface SeriesCard {
  kit: 'meeting' | 'appointment';
  series: MeetingSeries;
  repeat: Repeat;
  /** The last day a time may fall on, on the series' clock, if its proposer said one. */
  until: string | null;
}

export function seriesCard(payload: unknown): SeriesCard | null {
  const p = (payload ?? {}) as MeetingPayload;
  if (p.kit !== 'meeting' && p.kit !== 'appointment') return null;
  const series = seriesOf(p);
  const repeat = p.fields?.repeat;
  const until = isDay(p.fields?.repeatUntil) ? p.fields.repeatUntil : null;
  return series && isRepeat(repeat) ? { kit: p.kit, series, repeat, until } : null;
}

/** The client id a time of a series is posted with: twice is once. */
export function occurrenceClientId(seriesId: string, n: number): string {
  return `series-${seriesId}-${n}`;
}

/**
 * The calendar event a meeting is (the feed, an invitation): a time of a series is the same
 * event before it's posted (the calendar looking ahead) and after, so a calendar app keeps one.
 */
export function meetingUid(
  messageId: string,
  series: Pick<MeetingSeries, 'id' | 'n'> | null,
  kit: 'meeting' | 'appointment' = 'meeting',
) {
  return series ? `${kit}-${series.id}-${series.n}@caime` : `${kit}-${messageId}@caime`;
}

function endOf(p: MeetingPayload): number | null {
  const at = p.fields?.start?.at ? Date.parse(p.fields.start.at) : Number.NaN;
  if (!Number.isFinite(at)) return null;
  // A booked appointment ends as it was booked (its length, its nights).
  const booked = p.booking?.endAt ? Date.parse(p.booking.endAt) : Number.NaN;
  if (Number.isFinite(booked) && booked > at) return booked;
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

/** How many times in a row a repeating appointment may find taken before it gives up for now. */
const SKIPS_MAX = 4;

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
  let after = card.series;
  let posted: { message: Message; created: boolean } | null = null;
  for (let tries = 0; tries <= SKIPS_MAX && !posted; tries++) {
    const next = nextOccurrence(after, card.repeat, ctx.now(), card.until);
    if (!next) return;
    try {
      posted = await sendMessage(
        ctx,
        from.sender_id,
        from.conversation_id,
        {
          clientId: occurrenceClientId(card.series.id, next.n),
          kind: 'kit',
          payload: {
            kit: card.kit,
            fields: {
              ...p.fields,
              start: { at: next.at.toISOString(), hasTime: p.fields?.start?.hasTime !== false },
            },
            // An appointment from a catalog books each time as it's posted (R58): the same item
            // and quantity, the slot checked as any booking is.
            ...(card.kit === 'appointment' && p.booking
              ? { booking: { itemId: p.booking.itemId, quantity: p.booking.quantity } }
              : {}),
          },
        },
        // Nobody is told of a time the series posts itself (A3: the sweep leaves it be too).
        { occurrence: { series: { ...card.series, n: next.n }, agreed: true }, effects: false },
      );
    } catch (err) {
      if (!(err instanceof AppError)) throw err;
      // That time is taken (booked over before the series held it, the hours changed): it's
      // skipped, its people are told, and the series goes on with the one after.
      if (err.code === 'slot_taken') {
        await tellSkipped(ctx, from, card, next.at);
        after = { ...card.series, n: next.n };
        continue;
      }
      // Its organizer can no longer write there (they left, a block, the group closed), or what
      // was booked is no longer offered: the series ends with the time before.
      ctx.log.info({ messageId: from.id, code: err.code }, 'a series ended');
      if (card.kit === 'appointment') await tellEnded(ctx, from, card);
      return;
    }
  }
  if (!posted) return;
  let { message } = posted;
  // Whoever on the team did the time before does this one while they're free (R58).
  if (posted.created && card.kit === 'appointment') message = await keepProvider(ctx, message, p);
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
  if (card.kit === 'meeting') await queueMeetingStart(ctx, message.id);
  await queueNextTime(ctx, message.id);
  if (posted.created && card.kit === 'meeting')
    for (const handler of whenPosted) await handler(ctx, message, from);
}

/** A time of an organization's repeating appointment, given to whoever did the one before. */
async function keepProvider(ctx: AppContext, message: Message, before: MeetingPayload) {
  const p = (message.payload ?? {}) as MeetingPayload;
  const start = p.fields?.start?.at ? new Date(p.fields.start.at) : null;
  if (!p.booking || p.booking.providerId || !start) return message;
  const thread = await ctx.db
    .selectFrom('business_threads as t')
    .innerJoin('organizations as o', 'o.id', 't.org_id')
    .select(['o.id', 'o.booking', 'o.booking_items'])
    .where('t.conversation_id', '=', message.conversation_id)
    .executeTakeFirst();
  if (!thread) return message;
  const who = await pickProvider(ctx, thread, p.booking, start, {
    prefer: before.booking?.providerId ?? null,
    exceptSeries: seriesOf(p)?.id,
  });
  if (!who) return message;
  const booking = { ...p.booking, providerId: who.id, providerName: who.name };
  return ctx.db
    .updateTable('messages')
    .set({ payload: JSON.stringify({ ...p, booking }) })
    .where('id', '=', message.id)
    .returning(MESSAGE_COLUMNS)
    .executeTakeFirstOrThrow();
}

/** Everyone a card is for, with where they are and the language they read in. */
async function readersOf(ctx: AppContext, conversationId: string) {
  const ids = (await participantsOf(ctx.db, conversationId)).map((x) => x.user_id);
  if (!ids.length) return [];
  return ctx.db
    .selectFrom('users')
    .select(['id', 'time_zone', 'locale'])
    .where('id', 'in', ids)
    .where('kind', '=', 'human')
    .execute();
}

/** A time of a repeating appointment that couldn't be booked: said to everyone it's for. */
async function tellSkipped(ctx: AppContext, from: Message, card: SeriesCard, at: Date) {
  const title = (from.payload as MeetingPayload).title ?? '';
  await eachLimit(await readersOf(ctx, from.conversation_id), 4, async (u) => {
    const when = formatWhenAt(
      at.toISOString(),
      true,
      ctx.now(),
      u.time_zone || 'UTC',
      safeLocale(u.locale),
    );
    await notify(ctx, {
      userId: u.id,
      kind: 'kit',
      level: 'attention',
      title: () => tr('{when} couldn’t be booked', { when }),
      body: () =>
        `${tr('Appointment')} · ${title}. ${tr('That time was taken. The times after it go on.')}`,
      groupKey: `series-skip:${card.series.id}:${at.toISOString()}`,
      data: { conversationId: from.conversation_id, messageId: from.id },
    });
  });
}

/** A repeating appointment whose next time can't be booked at all any more: it ends, and says so. */
async function tellEnded(ctx: AppContext, from: Message, card: SeriesCard) {
  const title = (from.payload as MeetingPayload).title ?? '';
  await eachLimit(await readersOf(ctx, from.conversation_id), 4, async (u) => {
    await notify(ctx, {
      userId: u.id,
      kind: 'kit',
      level: 'attention',
      title: () => tr('It stopped repeating'),
      body: () =>
        `${tr('Appointment')} · ${title}. ${tr('It can’t be booked any more. Book again to go on.')}`,
      groupKey: `series-end:${card.series.id}`,
      data: { conversationId: from.conversation_id, messageId: from.id },
    });
  });
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
    const { repeat: _, repeatUntil: __, ...fields } = p.fields ?? {};
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
  // Its times ahead leave its people's own calendars (R96).
  await queueCalendarPush(ctx, members);
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
        body: () =>
          `${(stopped.payload as MeetingPayload).kit === 'appointment' ? tr('Appointment') : tr('Meeting')} · ${title}`,
        // A card's changes are one notification, its latest.
        groupKey: `kit:${messageId}`,
        data: { conversationId: stopped.conversation_id, messageId },
      });
    },
  );
  return view;
}
