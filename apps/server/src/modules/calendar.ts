/**
 * Someone's calendar (PRD §72): a secret address that Google Calendar, Outlook or Apple Calendar
 * subscribes to, with their open actions that have a due date and the meetings and appointments
 * agreed in their conversations. Caime stays the record; the calendar shows it and changes
 * nothing. The address is shown once, as it's made, and only its hash is kept; making a new one
 * ends the old one. Only a signed-in person over 18 makes one (no token reaches these routes).
 */
import {
  BookingBody,
  type BookingItem,
  buildIcs,
  type CalendarFeedView,
  type CalendarView,
  canManageOrg,
  type IcsEvent,
  KITS,
  type OrgCalendarView,
  type SlotsView,
  type TaskView,
  zonedParts,
} from '@caime/core';
import type {
  BookingResponse,
  BriefView,
  CalendarFeedCreatedResponse,
  CalendarFeedResponse,
  OkResponse,
} from '@caime/core/api';
import { tr } from '@caime/core/i18n';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context';
import { audit } from '../lib/audit';
import {
  assertItemsFit,
  type Booker,
  type BookingHost,
  itemsFor,
  itemsOf,
  openSlotsFor,
  orgHost,
  personHost,
} from '../lib/booking';
import { humanTeam } from '../lib/booking-team';
import { briefFor } from '../lib/briefs';
import { calendarItems, orgBookings, overdueTasks } from '../lib/calendar';
import { hashToken, newToken } from '../lib/crypto';
import { badRequest, forbidden, notFound } from '../lib/errors';
import { orgById, orgSeat } from '../lib/orgs';
import { viewerRelation } from '../lib/relations';
import { cardsAhead } from '../lib/upcoming';
import { minorOf } from '../lib/users';
import { parse } from '../lib/validate';
import { requireAuth } from '../plugins/auth';
import { taskViews } from './actions';

const DAY_MS = 86_400_000;
/** What a calendar shows: from a few months back to a couple of years ahead, and never all. */
const PAST_MS = 90 * DAY_MS;
const AHEAD_MS = 2 * 365 * DAY_MS;
const MAX_EVENTS = 500;
/** A timed action is a half-hour mark on the calendar; a meeting without a length, an hour. */
const TASK_MINUTES = 30;
const MEETING_MINUTES = 60;
/** Calendar apps read every hour or so; the last read is kept to the nearest ten minutes. */
const READ_EVERY_MS = 10 * 60_000;
const FILE = /^(cal_[A-Za-z0-9_-]{43})\.ics$/;

function feedView(
  row: { created_at: Date; last_read_at: Date | null } | undefined,
): CalendarFeedView {
  return {
    enabled: Boolean(row),
    createdAt: row?.created_at.toISOString() ?? null,
    lastReadAt: row?.last_read_at?.toISOString() ?? null,
  };
}

/** YYYY-MM-DD of an instant in someone's own time zone. */
function localDate(at: Date, timeZone: string): string {
  const p = zonedParts(at, timeZone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

function taskSummary(t: TaskView): string {
  if (t.direction === 'waiting' || t.direction === 'i_asked')
    return `Waiting on ${t.assignee.displayName}: ${t.title}`;
  return t.title;
}

function taskWho(t: TaskView): string {
  if (t.direction === 'asked_me') return `${t.owner.displayName} asked you.`;
  if (t.direction === 'mine') return 'One of your actions.';
  return `You’re waiting on ${t.assignee.displayName}.`;
}

export async function calendarEvents(
  ctx: AppContext,
  userId: string,
  timeZone: string,
): Promise<IcsEvent[]> {
  const now = ctx.now();
  const from = new Date(now.getTime() - PAST_MS);
  const until = new Date(now.getTime() + AHEAD_MS);
  const base = ctx.config.PUBLIC_URL.replace(/\/$/, '');
  const where = (conversationId: string | null) =>
    conversationId ? `${base}/c/${conversationId}` : `${base}/actions`;
  // Open actions with a due date that are theirs to see: their own, and what they were asked,
  // never from a message request they haven't accepted (or declined). What's ahead comes first,
  // so however much is overdue, what's coming is there.
  const rows = await overdueTasks(ctx, userId, { from, until });
  const views = await taskViews(ctx, rows, userId);
  const events: IcsEvent[] = [];
  rows.forEach((row, i) => {
    const t = views[i];
    if (!t?.dueAt) return;
    const due = new Date(t.dueAt);
    const url = where(t.conversationId);
    const notes = t.notes ? `${t.notes}\n\n` : '';
    events.push({
      uid: `task-${t.id}@caime`,
      summary: taskSummary(t),
      description: `${notes}${taskWho(t)} In Caime: ${url}`,
      url,
      ...(t.dueHasTime
        ? { start: due, end: new Date(due.getTime() + TASK_MINUTES * 60_000) }
        : { date: localDate(due, timeZone) }),
      updated: row.updated_at as Date,
    });
  });
  // Meetings and appointments agreed in conversations they're still in, never one taken back.
  for (const card of await cardsAhead(ctx, userId, {
    from,
    until,
    limit: MAX_EVENTS,
    agreedOnly: true,
  })) {
    const url = where(card.conversationId);
    const minutes = card.durationMinutes ?? MEETING_MINUTES;
    events.push({
      uid: `${card.kit}-${card.messageId}@caime`,
      summary: card.title,
      description: `${KITS[card.kit].name}, agreed in Caime: ${url}`,
      location: card.place,
      url,
      ...(card.hasTime
        ? { start: card.at, end: new Date(card.at.getTime() + minutes * 60_000) }
        : { date: localDate(card.at, timeZone) }),
      updated: card.updated,
      busy: true,
    });
  }
  return events;
}

/** From one instant to another, at most a year apart: what a calendar screen asks for. */
const WindowQuery = z
  .object({
    from: z.string().datetime({ offset: true }),
    to: z.string().datetime({ offset: true }),
  })
  .strict();
const MAX_WINDOW_MS = 366 * DAY_MS;
function windowOf(query: unknown): { from: Date; until: Date } {
  const q = parse(WindowQuery, query);
  const from = new Date(q.from);
  const until = new Date(q.to);
  if (until <= from || until.getTime() - from.getTime() > MAX_WINDOW_MS)
    throw badRequest(tr('Ask for up to a year, from one instant to a later one.'));
  return { from, until };
}

export async function calendarRoutes(app: FastifyInstance, ctx: AppContext) {
  // The calendar in the app (R51): what the feed shows, with whom it's with.
  app.get('/calendar', async (req): Promise<CalendarView> => {
    const auth = requireAuth(req);
    const window = windowOf(req.query);
    const items = await calendarItems(ctx, auth.userId, window, (rows) =>
      taskViews(ctx, rows, auth.userId),
    );
    return { from: window.from.toISOString(), to: window.until.toISOString(), items };
  });

  // An organization's bookings (R51), for its team: the appointments in its conversations.
  app.get('/orgs/:id/calendar', async (req): Promise<OrgCalendarView> => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const window = windowOf(req.query);
    await orgById(ctx.db, id);
    if (!(await orgSeat(ctx.db, auth.userId, id))) throw notFound(tr('That organization'));
    const items = await orgBookings(ctx, id, window);
    return { from: window.from.toISOString(), to: window.until.toISOString(), items };
  });

  // Bookable hours (R51) and the catalog (R58): set by the organization's owner or admins; null
  // hours take bookings off. An item's providers are people on the team.
  app.put('/orgs/:id/booking', async (req): Promise<BookingResponse> => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const body = parse(BookingBody, req.body);
    const org = await orgById(ctx.db, id);
    const seat = await orgSeat(ctx.db, auth.userId, id);
    if (!seat) throw notFound(tr('That organization'));
    if (!canManageOrg(seat.role))
      throw forbidden(tr('Only the organization’s owner and admins can.'));
    const team = await humanTeam(ctx.db, id);
    assertItemsFit(orgHost(org), body.items, new Set(team.map((u) => u.id)), true);
    await ctx.db
      .updateTable('organizations')
      .set({
        booking: body.booking ? JSON.stringify(body.booking) : null,
        booking_items: JSON.stringify(body.items),
        updated_at: ctx.now(),
      })
      .where('id', '=', id)
      .execute();
    await audit(ctx.db, {
      actorId: auth.userId,
      action: body.booking ? 'org.booking_set' : 'org.booking_off',
      target: id,
      ip: req.ip,
      metadata: { items: body.items.length },
    });
    return { booking: body.booking, items: body.items };
  });

  const SlotsQuery = WindowQuery.extend({
    item: z.string().max(40).optional(),
    quantity: z.coerce.number().int().min(1).max(100).optional(),
  });

  /** The slots for a host, for this booker: of the item asked, else the hours alone. */
  async function slotsView(host: BookingHost, booker: Booker, query: unknown): Promise<SlotsView> {
    const q = parse(SlotsQuery, query);
    const window = windowOf({ from: q.from, to: q.to });
    const none: SlotsView = { timeZone: null, slotMinutes: null, item: null, slots: [] };
    if (!host.hours) return none;
    let item: BookingItem | null = null;
    if (q.item) {
      item = itemsFor(host, booker).find((i) => i.id === q.item) ?? null;
      if (!item) return none;
    }
    const open = await openSlotsFor(
      ctx,
      host,
      { from: window.from, to: window.until },
      { item, quantity: q.quantity },
    );
    if (!open) return none;
    return {
      timeZone: open.hours.timeZone,
      slotMinutes: item?.minutes ?? open.hours.slotMinutes,
      item: item
        ? {
            id: item.id,
            name: item.name,
            unit: item.unit,
            minutes: item.minutes,
            maxQuantity: item.maxQuantity,
            price: item.price,
          }
        : null,
      slots: open.slots.map((d) => d.toISOString()),
    };
  }

  async function adultViewer(userId: string): Promise<boolean> {
    const me = await ctx.db
      .selectFrom('users')
      .select(['birth_date', 'time_zone'])
      .where('id', '=', userId)
      .executeTakeFirstOrThrow();
    return !minorOf(me, ctx.now());
  }

  // The open slots (R51), for anyone signed in: a customer books from them, so may the team.
  app.get('/orgs/:id/slots', async (req): Promise<SlotsView> => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const org = await orgById(ctx.db, id);
    // Anyone signed in is a customer to an organization (its "connections" audience); the team
    // books its own slots for customers.
    const seat = await orgSeat(ctx.db, auth.userId, id);
    return slotsView(
      orgHost(org),
      {
        isSelf: Boolean(seat),
        isConnected: true,
        spheres: [],
        adult: await adultViewer(auth.userId),
      },
      req.query,
    );
  });

  // A person's own bookings (R58): their hours and catalog, as an organization's.
  app.get('/me/booking', async (req): Promise<BookingResponse> => {
    const auth = requireAuth(req);
    const me = await ctx.db
      .selectFrom('users')
      .select(['booking', 'booking_items'])
      .where('id', '=', auth.userId)
      .executeTakeFirstOrThrow();
    return { booking: (me.booking as BookingResponse['booking']) ?? null, items: itemsOf(me) };
  });

  app.put('/me/booking', async (req): Promise<BookingResponse> => {
    const auth = requireAuth(req);
    const body = parse(BookingBody, req.body);
    const me = await ctx.db
      .selectFrom('users')
      .select(['id', 'booking', 'booking_items', 'birth_date', 'time_zone'])
      .where('id', '=', auth.userId)
      .executeTakeFirstOrThrow();
    assertItemsFit(personHost(me), body.items, new Set(), !minorOf(me, ctx.now()));
    await ctx.db
      .updateTable('users')
      .set({
        booking: body.booking ? JSON.stringify(body.booking) : null,
        booking_items: JSON.stringify(body.items),
        updated_at: ctx.now(),
      })
      .where('id', '=', auth.userId)
      .execute();
    await audit(ctx.db, {
      actorId: auth.userId,
      action: body.booking ? 'account.booking_set' : 'account.booking_off',
      ip: req.ip,
      metadata: { items: body.items.length },
    });
    return { booking: body.booking, items: body.items };
  });

  // A person's open slots (R58), for whoever their items let book: a connection, a sphere, or
  // anyone for a public item. Someone they blocked, or who blocked them, finds nothing.
  app.get('/people/:id/slots', async (req): Promise<SlotsView> => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const user = await ctx.db
      .selectFrom('users')
      .select(['id', 'booking', 'booking_items', 'kind'])
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
      .where('suspended_at', 'is', null)
      .executeTakeFirst();
    if (!user || user.kind !== 'human') throw notFound(tr('That person'));
    const relation = await viewerRelation(ctx.db, id, auth.userId);
    if (relation.blocked) throw notFound(tr('That person'));
    return slotsView(
      personHost(user),
      {
        isSelf: relation.isSelf,
        isConnected: relation.isConnected,
        spheres: relation.ownerSpheresForViewer,
        adult: await adultViewer(auth.userId),
      },
      req.query,
    );
  });

  // The brief before a meeting or an appointment (R58): read from the card, the reader's own.
  app.get('/messages/:id/brief', async (req): Promise<BriefView> => {
    const auth = requireAuth(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    return briefFor(ctx, auth.userId, id, { withModel: true });
  });

  app.get('/calendar/feed', async (req): Promise<CalendarFeedResponse> => {
    const auth = requireAuth(req);
    const row = await ctx.db
      .selectFrom('calendar_feeds')
      .select(['created_at', 'last_read_at'])
      .where('user_id', '=', auth.userId)
      .executeTakeFirst();
    return { feed: feedView(row) };
  });

  // A new address, shown this once; any old one stops working.
  app.post('/calendar/feed', async (req): Promise<CalendarFeedCreatedResponse> => {
    const auth = requireAuth(req);
    const me = await ctx.db
      .selectFrom('users')
      .select(['birth_date', 'time_zone'])
      .where('id', '=', auth.userId)
      .executeTakeFirstOrThrow();
    if (minorOf(me, ctx.now())) throw forbidden(tr('Calendars are for people over 18.'));
    ctx.limiter.hit(`calendar-feed:${auth.userId}`, ctx.config.isTest ? 1000 : 10, 3_600_000);
    const token = newToken('cal');
    const row = await ctx.db
      .insertInto('calendar_feeds')
      .values({
        user_id: auth.userId,
        token_hash: hashToken(token),
        created_at: ctx.now(),
        last_read_at: null,
      })
      .onConflict((oc) =>
        oc.column('user_id').doUpdateSet({
          token_hash: (eb) => eb.ref('excluded.token_hash'),
          created_at: (eb) => eb.ref('excluded.created_at'),
          last_read_at: null,
        }),
      )
      .returning(['created_at', 'last_read_at'])
      .executeTakeFirstOrThrow();
    await audit(ctx.db, { actorId: auth.userId, action: 'calendar.feed_created', ip: req.ip });
    const base = ctx.config.PUBLIC_URL.replace(/\/$/, '');
    return { feed: feedView(row), url: `${base}/v1/calendar/${token}.ics` };
  });

  app.delete('/calendar/feed', async (req): Promise<OkResponse> => {
    const auth = requireAuth(req);
    const gone = await ctx.db
      .deleteFrom('calendar_feeds')
      .where('user_id', '=', auth.userId)
      .executeTakeFirst();
    if (Number(gone.numDeletedRows) > 0)
      await audit(ctx.db, { actorId: auth.userId, action: 'calendar.feed_stopped', ip: req.ip });
    return { ok: true };
  });

  // What the calendar app reads. The address is the only credential: no session, no token.
  app.get('/calendar/:file', async (req, reply): Promise<FastifyReply> => {
    const { file } = parse(z.object({ file: z.string().max(80) }), req.params);
    const token = FILE.exec(file)?.[1];
    if (!token) throw notFound(tr('That calendar'));
    const hash = hashToken(token);
    const feed = await ctx.db
      .selectFrom('calendar_feeds as f')
      .innerJoin('users as u', 'u.id', 'f.user_id')
      .select(['f.user_id', 'f.last_read_at', 'u.time_zone', 'u.birth_date'])
      .where('f.token_hash', '=', hash)
      .where('u.deleted_at', 'is', null)
      .executeTakeFirst();
    if (!feed) {
      ctx.limiter.hit(`calendar-miss:${req.ip}`, ctx.config.isTest ? 10_000 : 300, 3_600_000);
      throw notFound(tr('That calendar'));
    }
    ctx.limiter.hit(
      `calendar:${hash.toString('hex')}`,
      ctx.config.isTest ? 10_000 : 120,
      3_600_000,
    );
    if (minorOf(feed, ctx.now())) throw notFound(tr('That calendar'));
    const now = ctx.now();
    const events = await calendarEvents(ctx, feed.user_id, feed.time_zone);
    if (!feed.last_read_at || now.getTime() - feed.last_read_at.getTime() > READ_EVERY_MS) {
      await ctx.db
        .updateTable('calendar_feeds')
        .set({ last_read_at: now })
        .where('user_id', '=', feed.user_id)
        .where('token_hash', '=', hash)
        .execute();
    }
    const body = buildIcs({
      name: 'Caime',
      description: 'Your actions with a due date, and the meetings you agreed in Caime.',
      timeZone: feed.time_zone,
      refreshMinutes: 60,
      now,
      events,
    });
    return reply
      .header('content-type', 'text/calendar; charset=utf-8')
      .header('content-disposition', 'inline; filename="caime.ics"')
      .header('cache-control', 'private, no-store')
      .header('x-robots-tag', 'noindex, nofollow')
      .send(body);
  });
}
