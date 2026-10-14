/**
 * What's coming up (PRD §41, §72): the meetings and appointments in someone's conversations,
 * read from their cards, for their calendar feed, a conversation's details and a space's page;
 * and what's owed by a day (review 2026-10-09 M14), a Pay card's or an invoice's due date, for
 * the calendar and Cai. Only where they may still read it: a conversation they're in and let in
 * (no request pending or declined), never a private one, never a card deleted, or deleted by
 * them for themselves. In a business conversation a team member (in every one of the
 * organization's, R15) has only the cards that are theirs to do: a booking naming them, or a
 * card made by hand in a thread assigned to them; the customer has them all. Every reader (the
 * calendar, the feed, Attention, Cai, busy times, slots) gets the same answer from here.
 */
import type { AppointmentBooking, UpcomingView } from '@caime/core';
import { AGREED_STATES as AGREED, DUE_STATES } from '@caime/core/kit-states';
import { isRepeat, type Repeat } from '@caime/core/repeat';
import { isDay, occurrencesBetween, seriesAgreed, seriesOf, timesAYear } from '@caime/core/series';
import { sql } from 'kysely';
import type { AppContext } from '../context';

export type CardKit = 'meeting' | 'appointment';
export type DueKit = 'payment_request' | 'invoice';

/** Asked, and not yet answered. */
const ASKED: Record<CardKit, string> = { meeting: 'proposed', appointment: 'requested' };

/**
 * The cards this person may read, by when they're for, in a window: the one query every reader
 * builds on. A team member's view of a business conversation is settled from the thread's
 * customer and assignee, and a booking's provider, once the rows are read (`theirsToDo`).
 */
function visibleCards(
  ctx: Pick<AppContext, 'db'>,
  userId: string,
  opts: { from: Date; until: Date; limit: number; conversationIds?: string[] },
) {
  return (
    ctx.db
      .selectFrom('messages as m')
      .innerJoin('participants as p', (j) =>
        j
          .onRef('p.conversation_id', '=', 'm.conversation_id')
          .on('p.user_id', '=', userId)
          .on('p.left_at', 'is', null),
      )
      .innerJoin('conversations as c', 'c.id', 'm.conversation_id')
      .leftJoin('business_threads as t', 't.conversation_id', 'm.conversation_id')
      .select([
        'm.id',
        'm.conversation_id',
        'm.seq',
        'm.payload',
        'm.created_at',
        'm.edited_at',
        't.customer_id',
        't.assignee_id',
      ])
      .where('m.kind', '=', 'kit')
      .where('m.deleted_at', 'is', null)
      .$if(Boolean(opts.conversationIds), (qb) =>
        qb.where('m.conversation_id', 'in', opts.conversationIds ?? []),
      )
      .where('c.privacy_class', '=', 'standard')
      .where((eb) =>
        eb.or([eb('p.request_state', 'is', null), eb('p.request_state', '=', 'accepted')]),
      )
      .where(({ not, exists, selectFrom }) =>
        not(
          exists(
            selectFrom('hidden_messages as h')
              .select('h.message_id')
              .whereRef('h.message_id', '=', 'm.id')
              .where('h.user_id', '=', userId),
          ),
        ),
      )
      // When it is, as it's kept (always an ISO time, so compared as text): only what's in the
      // window, soonest first, however long ago each was planned.
      .where('m.card_start_at', '>=', opts.from)
      .where('m.card_start_at', '<=', opts.until)
      .orderBy('m.card_start_at', 'asc')
      .limit(opts.limit)
  );
}

/** On the team of this thread's organization: only what's theirs to do. */
function theirsToDo(
  row: { customer_id: string | null; assignee_id: string | null },
  userId: string,
  booking: AppointmentBooking | null,
): boolean {
  const onTeam = row.customer_id !== null && row.customer_id !== userId;
  return !onTeam || (booking ? booking.providerId === userId : row.assignee_id === userId);
}

export interface CardAhead {
  messageId: string;
  conversationId: string;
  seq: number;
  kit: CardKit;
  title: string;
  at: Date;
  hasTime: boolean;
  durationMinutes: number | null;
  place: string | null;
  agreed: boolean;
  /** When it last changed: the last move on it, or when it was made or edited. */
  updated: Date;
  /** What it booked from a catalog (R58), if it did. */
  booking: AppointmentBooking | null;
  /** A meeting that repeats (R58): its series and which time this is. */
  series: { id: string; n: number } | null;
  /** How often it repeats, while it still does. */
  repeat: Repeat | null;
  /**
   * A time of a series still to be posted, looked ahead from the one that was: no card of its
   * own yet, so its message, conversation and place are the series' latest card's.
   */
  projected: boolean;
}

type CardPayload = {
  kit?: CardKit;
  title?: string;
  state?: string;
  fields?: {
    title?: unknown;
    start?: { at?: string; hasTime?: boolean };
    durationMinutes?: unknown;
    place?: unknown;
    repeat?: unknown;
    repeatUntil?: unknown;
  };
  history?: Array<{ at?: string; state?: string }>;
  booking?: AppointmentBooking | null;
  series?: unknown;
};

type CardRow = {
  id: string;
  conversation_id: string;
  seq: string | number;
  payload: unknown;
  created_at: Date;
  edited_at: Date | null;
};

/** A card read as what's ahead, at the time it's for (another, for a time looked ahead). */
function cardAhead(row: CardRow, payload: CardPayload, kit: CardKit, at: Date): CardAhead {
  const booking = payload.booking && typeof payload.booking === 'object' ? payload.booking : null;
  const minutes = Number(payload.fields?.durationMinutes);
  const moved = payload.history?.at(-1)?.at;
  const series = seriesOf(payload);
  return {
    messageId: row.id,
    conversationId: row.conversation_id,
    seq: Number(row.seq),
    kit,
    title: payload.title || (kit === 'meeting' ? 'Meeting' : 'Appointment'),
    at,
    hasTime: payload.fields?.start?.hasTime !== false,
    durationMinutes: Number.isFinite(minutes) && minutes > 0 ? minutes : null,
    place: typeof payload.fields?.place === 'string' ? payload.fields.place : null,
    agreed: payload.state === AGREED[kit],
    updated: moved ? new Date(moved) : (row.edited_at ?? row.created_at),
    booking,
    series: series ? { id: series.id, n: series.n } : null,
    repeat: isRepeat(payload.fields?.repeat) ? payload.fields.repeat : null,
    projected: false,
  };
}

export async function cardsAhead(
  ctx: Pick<AppContext, 'db'>,
  userId: string,
  opts: {
    from: Date;
    until: Date;
    limit: number;
    /** Only these conversations (a conversation's details, a space). */
    conversationIds?: string[];
    /** Only what's agreed, for a calendar; otherwise what's asked too. */
    agreedOnly?: boolean;
    /**
     * The times of repeating meetings not yet posted, as of `now` (R58): for a calendar, the
     * feed and the slots, which look past the next one; never for a list of what's next.
     */
    series?: { now: Date };
  },
): Promise<CardAhead[]> {
  if (opts.conversationIds && opts.conversationIds.length === 0) return [];
  const states = (kit: CardKit) => (opts.agreedOnly ? [AGREED[kit]] : [AGREED[kit], ASKED[kit]]);
  const rows = await visibleCards(ctx, userId, opts)
    .where(sql`m.payload->>'kit'`, 'in', ['meeting', 'appointment'])
    // A meeting moved to its own space (R84) is there now, once.
    .where(sql`m.payload->'movedTo'`, 'is', null)
    .where((eb) =>
      eb.or(
        (['meeting', 'appointment'] as const).map((kit) =>
          eb.and([
            eb(sql`m.payload->>'kit'`, '=', kit),
            eb(sql`m.payload->>'state'`, 'in', states(kit)),
          ]),
        ),
      ),
    )
    .execute();
  const ahead: CardAhead[] = [];
  for (const row of rows) {
    const payload = (row.payload ?? {}) as CardPayload;
    const kit = payload.kit;
    const at = payload.fields?.start?.at ? new Date(payload.fields.start.at) : null;
    if (!kit || !at || Number.isNaN(at.getTime()) || at < opts.from || at > opts.until) continue;
    const card = cardAhead(row, payload, kit, at);
    if (!theirsToDo(row, userId, card.booking)) continue;
    ahead.push(card);
  }
  if (opts.series)
    ahead.push(...(await seriesAhead(ctx, userId, { ...opts, now: opts.series.now })));
  return ahead.sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, opts.limit);
}

/** A day after a time with nothing posted after it, its series has ended: nothing is ahead. */
const SERIES_ENDED_MS = 86_400_000;

/**
 * The times of repeating meetings still to be posted, in a window (R58): from each series'
 * latest card (posted within the last day or ahead, agreed at some point, still repeating), the
 * times after it. The same visibility as the cards themselves; a series is never in a business
 * conversation, so a team member's view needs nothing more.
 */
async function seriesAhead(
  ctx: Pick<AppContext, 'db'>,
  userId: string,
  opts: { from: Date; until: Date; limit: number; conversationIds?: string[]; now: Date },
): Promise<CardAhead[]> {
  if (opts.until <= opts.now) return [];
  const rows = await visibleCards(ctx, userId, {
    from: new Date(opts.now.getTime() - SERIES_ENDED_MS),
    until: opts.until,
    limit: opts.limit,
    conversationIds: opts.conversationIds,
  })
    .where(sql`m.payload->>'kit'`, '=', 'meeting')
    .where(sql`m.payload->'series'`, 'is not', null)
    .where(sql`m.payload->'fields'->'repeat'`, 'is not', null)
    .where(sql`m.payload->'movedTo'`, 'is', null)
    .execute();
  // Each series' latest time: what's ahead of it hasn't been posted.
  const latest = new Map<string, { row: (typeof rows)[number]; n: number }>();
  for (const row of rows) {
    const series = seriesOf(row.payload);
    if (series && (latest.get(series.id)?.n ?? -1) < series.n)
      latest.set(series.id, { row, n: series.n });
  }
  const out: CardAhead[] = [];
  for (const { row } of latest.values()) {
    const payload = (row.payload ?? {}) as CardPayload;
    const series = seriesOf(payload);
    const repeat = payload.fields?.repeat;
    if (!series || !isRepeat(repeat)) continue;
    // Agreed (a time cancelled leaves the rest); a proposal not yet taken, nothing ahead.
    if (!seriesAgreed(payload)) continue;
    // At most a year of its times, and none after its last day.
    const lastDay = isDay(payload.fields?.repeatUntil) ? payload.fields.repeatUntil : null;
    for (const time of occurrencesBetween(
      series,
      repeat,
      opts.from,
      opts.until,
      timesAYear(repeat, series.days),
      lastDay,
    ))
      out.push({
        ...cardAhead(row, payload, 'meeting', time.at),
        agreed: true,
        series: { id: series.id, n: time.n },
        projected: true,
      });
  }
  return out;
}

/** What's owed by a day: a Pay card or an invoice with a due date, still open (M14). */
export interface CardDue {
  messageId: string;
  conversationId: string;
  seq: number;
  kit: DueKit;
  title: string;
  /** Midnight UTC of its due day, as `card_start_at` keeps it. */
  at: Date;
  amount: { value: number; currency: string } | null;
  state: string;
  /** Said overdue (an invoice marked so). */
  overdue: boolean;
  updated: Date;
}

/**
 * The Pay cards and invoices due in a window that are still owed (asked, sent but not received,
 * overdue), for the calendar, the feed and Cai; never for busy times or the slots, which a due
 * day doesn't hold. The same visibility as `cardsAhead`.
 */
export async function dueCards(
  ctx: Pick<AppContext, 'db'>,
  userId: string,
  opts: { from: Date; until: Date; limit: number; conversationIds?: string[] },
): Promise<CardDue[]> {
  if (opts.conversationIds && opts.conversationIds.length === 0) return [];
  const rows = await visibleCards(ctx, userId, opts)
    .where((eb) =>
      eb.or(
        (Object.keys(DUE_STATES) as DueKit[]).map((kit) =>
          eb.and([
            eb(sql`m.payload->>'kit'`, '=', kit),
            eb(sql`m.payload->>'state'`, 'in', [...DUE_STATES[kit]]),
          ]),
        ),
      ),
    )
    .execute();
  const due: CardDue[] = [];
  for (const row of rows) {
    const payload = (row.payload ?? {}) as {
      kit?: DueKit;
      title?: string;
      state?: string;
      fields?: { due?: unknown; amount?: { value?: unknown; currency?: unknown } };
      history?: Array<{ at?: string }>;
    };
    const kit = payload.kit;
    const day = payload.fields?.due;
    const at = typeof day === 'string' ? new Date(`${day}T00:00:00Z`) : null;
    if (!kit || !at || Number.isNaN(at.getTime()) || at < opts.from || at > opts.until) continue;
    if (!theirsToDo(row, userId, null)) continue;
    const a = payload.fields?.amount;
    const amount =
      a && typeof a.value === 'number' && typeof a.currency === 'string'
        ? { value: a.value, currency: a.currency }
        : null;
    const moved = payload.history?.at(-1)?.at;
    due.push({
      messageId: row.id,
      conversationId: row.conversation_id,
      seq: Number(row.seq),
      kit,
      title: payload.title || (kit === 'invoice' ? 'Invoice' : 'Pay'),
      at,
      amount,
      state: payload.state ?? '',
      overdue: payload.state === 'overdue',
      updated: moved ? new Date(moved) : (row.edited_at ?? row.created_at),
    });
  }
  return due.sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, opts.limit);
}

export function upcomingView(card: CardAhead): UpcomingView {
  return {
    messageId: card.messageId,
    conversationId: card.conversationId,
    seq: card.seq,
    kit: card.kit,
    title: card.title,
    at: card.at.toISOString(),
    hasTime: card.hasTime,
    durationMinutes: card.durationMinutes,
    place: card.place,
    agreed: card.agreed,
  };
}

/** Ahead, for a person reading their plans: from a little while ago (so what's on now shows). */
export function aheadWindow(now: Date): { from: Date; until: Date } {
  return {
    from: new Date(now.getTime() - 3 * 3_600_000),
    until: new Date(now.getTime() + 180 * 86_400_000),
  };
}
