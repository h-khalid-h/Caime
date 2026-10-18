/**
 * The calendar in the app (R51): someone's dated items, as their calendar feed has them
 * (modules/calendar.ts), with whom each is with; and an organization's bookings, the
 * appointments in its customer conversations, for its team. Caime stays the record: the
 * calendar shows what conversations and actions hold, and changes nothing.
 */

import type {
  AppointmentBooking,
  CalendarItemView,
  OrgBookingView,
  OrgRef,
  Sphere,
  TaskView,
} from '@caime/core';
import { HELD_APPOINTMENT_STATES } from '@caime/core/kit-states';
import { cardEndMs } from '@caime/core/meetings';
import { isRepeat } from '@caime/core/repeat';
import { isDay, occurrencesBetween, seriesAgreed, seriesOf, timesAYear } from '@caime/core/series';
import { sql } from 'kysely';
import type { AppContext } from '../context';
import { ORG_COLUMNS } from '../db/schema';
import { orgRef } from './business';
import { overdueAtSql } from './due';
import { personViewsFor } from './people-batch';
import { activeRelationships, relationshipView } from './relations';
import { cardsAhead, dueCards, SERIES_ENDED_MS } from './upcoming';

/**
 * How long a card holds, by core's one rule (`cardEndMs`: as booked, as its field says, else an
 * hour). The app's calendar and the feed both read it (review 2026-10-09 M16), so a booking ends
 * at the same minute in each.
 */
export function minutesOf(c: {
  at: Date;
  durationMinutes: number | null;
  booking: AppointmentBooking | null;
}) {
  const at = c.at.getTime();
  return Math.round((cardEndMs(at, c) - at) / 60_000);
}
const MAX_ITEMS = 500;
const dayOf = (at: Date) => new Date(Math.floor(at.getTime() / 86_400_000) * 86_400_000);

export interface Window {
  from: Date;
  until: Date;
}

/** Whom a conversation is with, for the viewer: a person, an organization, or a title. */
async function conversationsFor(
  ctx: AppContext,
  viewerId: string,
  conversationIds: string[],
): Promise<Map<string, { otherId: string | null; org: OrgRef | null; title: string | null }>> {
  const out = new Map<
    string,
    { otherId: string | null; org: OrgRef | null; title: string | null }
  >();
  const ids = [...new Set(conversationIds)];
  if (ids.length === 0) return out;
  const [rows, others, threads] = await Promise.all([
    ctx.db
      .selectFrom('conversations')
      .select(['id', 'kind', 'title'])
      .where('id', 'in', ids)
      .execute(),
    ctx.db
      .selectFrom('participants')
      .select(['conversation_id', 'user_id'])
      .where('conversation_id', 'in', ids)
      .where('user_id', '<>', viewerId)
      .where('left_at', 'is', null)
      .execute(),
    ctx.db
      .selectFrom('business_threads as t')
      .innerJoin('organizations as o', 'o.id', 't.org_id')
      .select([
        't.conversation_id',
        'o.id',
        'o.name',
        'o.handle',
        'o.kind',
        'o.domain',
        'o.verified_at',
        'o.country',
        'o.avatar_file_id',
      ])
      .where('t.conversation_id', 'in', ids)
      .execute(),
  ]);
  const othersOf = new Map<string, string[]>();
  for (const p of others)
    othersOf.set(p.conversation_id, [...(othersOf.get(p.conversation_id) ?? []), p.user_id]);
  const orgOf = new Map(threads.map((t) => [t.conversation_id, orgRef(t)]));
  for (const c of rows) {
    const them = othersOf.get(c.id) ?? [];
    out.set(c.id, {
      otherId: c.kind === 'direct' && them.length === 1 ? (them[0] ?? null) : null,
      org: orgOf.get(c.id) ?? null,
      title: c.kind === 'direct' || c.kind === 'business' ? null : c.title,
    });
  }
  return out;
}

/**
 * Someone's calendar between two instants: their open actions with a due date (as the feed
 * lists them: their own, and what they were asked and accepted), and the meetings and
 * appointments in their conversations, agreed or asked. Soonest first.
 */
export async function calendarItems(
  ctx: AppContext,
  userId: string,
  window: Window,
  taskViews: (rows: Awaited<ReturnType<typeof overdueTasks>>) => Promise<TaskView[]>,
): Promise<CalendarItemView[]> {
  const [tasks, cards, owed] = await Promise.all([
    overdueTasks(ctx, userId, window),
    // With the times of repeating meetings ahead of the one posted (R58).
    cardsAhead(ctx, userId, {
      ...window,
      limit: MAX_ITEMS,
      agreedOnly: false,
      series: { now: ctx.now() },
    }),
    // A due day is kept as its midnight UTC: a window that starts later in the day still has it.
    dueCards(ctx, userId, { ...window, from: dayOf(window.from), limit: MAX_ITEMS }),
  ]);
  const views = await taskViews(tasks);
  const conversationIds = [
    ...cards.map((c) => c.conversationId),
    ...owed.map((c) => c.conversationId),
    ...views.flatMap((t) => (t.conversationId ? [t.conversationId] : [])),
  ];
  const about = await conversationsFor(ctx, userId, conversationIds);
  const now = ctx.now();
  const peopleIds = [
    ...cards.flatMap((c) => about.get(c.conversationId)?.otherId ?? []),
    ...owed.flatMap((c) => about.get(c.conversationId)?.otherId ?? []),
    ...views.flatMap((t) => {
      if (t.direction === 'asked_me') return [t.owner.id];
      if (t.assignee.id && t.assignee.id !== userId) return [t.assignee.id];
      return [];
    }),
  ];
  const [people, rels] = await Promise.all([
    personViewsFor(ctx, userId, peopleIds),
    activeRelationships(ctx.db, userId, [...new Set(peopleIds)]),
  ]);
  const relOf = new Map<string, { label: string; sphere: Sphere }>();
  for (const r of rels)
    if (!relOf.has(r.subject_id))
      relOf.set(r.subject_id, {
        label: relationshipView(r, people.get(r.subject_id)?.gender ?? null).label,
        sphere: r.sphere as Sphere,
      });
  const withOf = (id: string | null) => {
    const person = id ? (people.get(id) ?? null) : null;
    return { with: person, relationship: id ? (relOf.get(id) ?? null) : null };
  };
  const items: CalendarItemView[] = [];
  for (const c of cards) {
    const a = about.get(c.conversationId);
    const minutes = minutesOf(c);
    items.push({
      kind: c.kit,
      // A time still to be posted is its series' time, not a card (yet).
      id: c.projected && c.series ? `${c.series.id}:${c.series.n}` : c.messageId,
      seq: c.seq,
      title: c.title,
      at: c.at.toISOString(),
      hasTime: c.hasTime,
      endAt: c.hasTime ? new Date(c.at.getTime() + minutes * 60_000).toISOString() : null,
      place: c.place,
      repeat: c.repeat,
      projected: c.projected,
      amount: null,
      conversationId: c.conversationId,
      ...withOf(a?.otherId ?? null),
      org: a?.org ?? null,
      conversationTitle: a?.title ?? null,
      state: c.agreed ? 'agreed' : 'asked',
    });
  }
  // What's owed by a day (M14): on its day, all day, overdue only when said so.
  for (const c of owed) {
    const a = about.get(c.conversationId);
    items.push({
      kind: c.kit,
      id: c.messageId,
      seq: c.seq,
      title: c.title,
      at: c.at.toISOString(),
      hasTime: false,
      endAt: null,
      place: null,
      repeat: null,
      projected: false,
      amount: c.amount,
      conversationId: c.conversationId,
      ...withOf(a?.otherId ?? null),
      org: a?.org ?? null,
      conversationTitle: a?.title ?? null,
      state: c.overdue ? 'overdue' : 'open',
    });
  }
  for (const t of views) {
    if (!t.dueAt) continue;
    const a = t.conversationId ? about.get(t.conversationId) : undefined;
    const waiting = t.direction === 'waiting' || t.direction === 'i_asked';
    const other = t.direction === 'asked_me' ? t.owner.id : waiting ? t.assignee.id : null;
    const due = new Date(t.dueAt);
    items.push({
      kind: 'task',
      id: t.id,
      seq: null,
      title: waiting ? `Waiting on ${t.assignee.displayName}: ${t.title}` : t.title,
      at: t.dueAt,
      hasTime: t.dueHasTime,
      endAt: null,
      place: null,
      repeat: null,
      projected: false,
      amount: null,
      conversationId: t.conversationId,
      ...withOf(other && other !== userId ? other : null),
      org: a?.org ?? null,
      conversationTitle: a?.title ?? null,
      state: waiting ? 'waiting' : due < now && t.dueHasTime ? 'overdue' : 'open',
    });
  }
  return items.sort((x, y) => x.at.localeCompare(y.at)).slice(0, MAX_ITEMS);
}

/** Open actions with a due date in the window, as the feed selects them (modules/calendar.ts). */
export async function overdueTasks(ctx: AppContext, userId: string, window: Window) {
  return ctx.db
    .selectFrom('tasks')
    .selectAll()
    .where((eb) =>
      eb.or([
        eb('owner_id', '=', userId),
        eb.and([
          eb('assignee_id', '=', userId),
          eb('shared', '=', true),
          eb.not(
            eb.exists(
              eb
                .selectFrom('participants as p')
                .select('p.user_id')
                .whereRef('p.conversation_id', '=', 'tasks.conversation_id')
                .where('p.user_id', '=', userId)
                .where('p.request_state', 'in', ['pending', 'declined']),
            ),
          ),
        ]),
      ]),
    )
    .where('status', 'in', ['open', 'accepted'])
    .where('due_at', 'is not', null)
    .where('due_at', '>=', window.from)
    .where('due_at', '<=', window.until)
    .orderBy(sql`${overdueAtSql} < ${ctx.now()}`)
    .orderBy('due_at')
    .limit(MAX_ITEMS)
    .execute();
}

/**
 * An organization's bookings between two instants: the appointment cards in its customer
 * conversations, asked or confirmed, soonest first, with the customer. For its team.
 */
export async function orgBookings(
  ctx: AppContext,
  orgId: string,
  window: Window,
  /**
   * A view takes a page; the slots take every card in the window (nothing read as free). With
   * `ahead`, the times of repeating appointments (R58) not yet posted are there too, as their
   * series will book them (less one series, booking its own next time).
   */
  opts: { limit?: number; ahead?: { now: Date; exceptSeries?: string } } = {},
): Promise<OrgBookingView[]> {
  const base = () =>
    ctx.db
      .selectFrom('messages as m')
      .innerJoin('business_threads as t', 't.conversation_id', 'm.conversation_id')
      .leftJoin('users as c', 'c.id', 't.customer_id')
      .select([
        'm.id',
        'm.conversation_id',
        'm.payload',
        'c.id as customer_id',
        'c.display_name',
        't.customer_org_id',
      ])
      .where('t.org_id', '=', orgId)
      .where('m.kind', '=', 'kit')
      .where('m.deleted_at', 'is', null)
      .where(sql`m.payload->>'kit'`, '=', 'appointment');
  const limit = opts.limit ?? MAX_ITEMS;
  const rows = await base()
    .where(sql`m.payload->>'state'`, 'in', HELD_APPOINTMENT_STATES)
    .where('m.card_start_at', '>=', window.from)
    .where('m.card_start_at', '<=', window.until)
    .orderBy('m.card_start_at', 'asc')
    .limit(limit)
    .execute();
  // Each repeating appointment's latest time (posted within the last day, or ahead): the times
  // after it hold their slots before each is posted.
  const ahead: Array<{ row: (typeof rows)[number]; at: Date; n: number }> = [];
  if (opts.ahead && window.until > opts.ahead.now) {
    const latest = new Map<string, { row: (typeof rows)[number]; n: number }>();
    for (const row of await base()
      .where(sql`m.payload->'series'`, 'is not', null)
      .where(sql`m.payload->'fields'->'repeat'`, 'is not', null)
      .where('m.card_start_at', '>=', new Date(opts.ahead.now.getTime() - SERIES_ENDED_MS))
      .where('m.card_start_at', '<=', window.until)
      .limit(MAX_ITEMS)
      .execute()) {
      const series = seriesOf(row.payload);
      if (!series || series.id === opts.ahead.exceptSeries) continue;
      if ((latest.get(series.id)?.n ?? -1) < series.n) latest.set(series.id, { row, n: series.n });
    }
    for (const { row } of latest.values()) {
      const payload = (row.payload ?? {}) as {
        fields?: { repeat?: unknown; repeatUntil?: unknown };
      };
      const series = seriesOf(payload);
      const repeat = payload.fields?.repeat;
      if (!series || !isRepeat(repeat) || !seriesAgreed(payload)) continue;
      const lastDay = isDay(payload.fields?.repeatUntil) ? payload.fields.repeatUntil : null;
      for (const time of occurrencesBetween(
        series,
        repeat,
        window.from,
        window.until,
        timesAYear(repeat, series.days),
        lastDay,
      ))
        ahead.push({ row, at: time.at, n: time.n });
    }
  }
  // The organizations customers book for (R64, M17), in one query.
  const forOrgIds = [
    ...new Set(
      [...rows, ...ahead.map((a) => a.row)]
        .map((r) => r.customer_org_id)
        .filter((x): x is string => Boolean(x)),
    ),
  ];
  const forOrgs = forOrgIds.length
    ? await ctx.db
        .selectFrom('organizations')
        .select(ORG_COLUMNS)
        .where('id', 'in', forOrgIds)
        .execute()
    : [];
  const viewOf = (
    row: (typeof rows)[number],
    timeAhead: { at: Date; n: number } | null,
  ): OrgBookingView | null => {
    const payload = (row.payload ?? {}) as {
      state?: string;
      series?: unknown;
      fields?: {
        title?: unknown;
        start?: { at?: string; hasTime?: boolean };
        place?: unknown;
        repeat?: unknown;
      };
      booking?: AppointmentBooking | null;
    };
    const at = payload.fields?.start?.at;
    if (!at) return null;
    const forOrg = row.customer_org_id
      ? forOrgs.find((o) => o.id === row.customer_org_id)
      : undefined;
    let booking = payload.booking && typeof payload.booking === 'object' ? payload.booking : null;
    // A time ahead lasts as its series' latest does, from its own start.
    if (timeAhead && booking)
      booking = {
        ...booking,
        endAt: new Date(
          timeAhead.at.getTime() + Date.parse(booking.endAt) - Date.parse(at),
        ).toISOString(),
      };
    const series = seriesOf(payload);
    return {
      id: timeAhead && series ? `${series.id}:${timeAhead.n}` : row.id,
      messageId: row.id,
      conversationId: row.conversation_id,
      customer: row.customer_id
        ? { id: row.customer_id, displayName: row.display_name ?? '' }
        : null,
      customerOrg: forOrg ? orgRef(forOrg) : null,
      title: typeof payload.fields?.title === 'string' ? payload.fields.title : 'Appointment',
      at: timeAhead ? timeAhead.at.toISOString() : at,
      hasTime: payload.fields?.start?.hasTime !== false,
      place: typeof payload.fields?.place === 'string' ? payload.fields.place : null,
      state: timeAhead || payload.state === 'confirmed' ? 'confirmed' : 'requested',
      booking,
      ahead: Boolean(timeAhead),
      repeat: series && isRepeat(payload.fields?.repeat) ? payload.fields.repeat : null,
    };
  };
  const out = [...rows.map((r) => viewOf(r, null)), ...ahead.map((a) => viewOf(a.row, a))].filter(
    (v): v is OrgBookingView => v !== null,
  );
  if (!ahead.length) return out;
  return out.sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).slice(0, limit);
}

export interface BusyNow {
  /** When the last of what's on ends. */
  until: Date;
  title: string;
  conversationId: string;
}

/**
 * What someone is in right now (R51), or null: the agreed meeting or appointment, from the cards
 * in their conversations that started in the last few hours and haven't ended, that ends last.
 * One query; run only where someone may know (their own hold, a viewer their rules allow).
 */
export async function busyNow(ctx: AppContext, userId: string, now: Date): Promise<BusyNow | null> {
  const cards = await cardsAhead(ctx, userId, {
    from: new Date(now.getTime() - 6 * 3_600_000),
    until: now,
    limit: 20,
    agreedOnly: true,
  });
  let busy: BusyNow | null = null;
  for (const c of cards) {
    if (!c.hasTime) continue;
    const end = new Date(c.at.getTime() + minutesOf(c) * 60_000);
    if (end > now && (!busy || end > busy.until))
      busy = { until: end, title: c.title, conversationId: c.conversationId };
  }
  return busy;
}

/** Until when someone is in a meeting right now, or null. */
export async function busyUntilFor(
  ctx: AppContext,
  userId: string,
  now: Date,
): Promise<Date | null> {
  return (await busyNow(ctx, userId, now))?.until ?? null;
}
