/**
 * Someone's calendar (PRD §72): a secret address that Google Calendar, Outlook or Apple Calendar
 * subscribes to, with their open actions that have a due date and the meetings and appointments
 * agreed in their conversations. Caishy stays the record; the calendar shows it and changes
 * nothing. The address is shown once, as it's made, and only its hash is kept; making a new one
 * ends the old one. Only a signed-in person over 18 makes one (no token reaches these routes).
 */
import {
  buildIcs,
  type CalendarFeedView,
  type IcsEvent,
  KITS,
  type TaskView,
  zonedParts,
} from '@caishy/core';
import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { z } from 'zod';
import type { AppContext } from '../context';
import { audit } from '../lib/audit';
import { hashToken, newToken } from '../lib/crypto';
import { overdueAtSql } from '../lib/due';
import { forbidden, notFound } from '../lib/errors';
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
  const rows = await ctx.db
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
    .where('due_at', '>', from)
    .where('due_at', '<', until)
    .orderBy(sql`${overdueAtSql} < ${now}`)
    .orderBy('due_at')
    .limit(MAX_EVENTS)
    .execute();
  const views = await taskViews(ctx, rows, userId);
  const events: IcsEvent[] = [];
  rows.forEach((row, i) => {
    const t = views[i];
    if (!t?.dueAt) return;
    const due = new Date(t.dueAt);
    const url = where(t.conversationId);
    const notes = t.notes ? `${t.notes}\n\n` : '';
    events.push({
      uid: `task-${t.id}@caishy`,
      summary: taskSummary(t),
      description: `${notes}${taskWho(t)} In Caishy: ${url}`,
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
      uid: `${card.kit}-${card.messageId}@caishy`,
      summary: card.title,
      description: `${KITS[card.kit].name}, agreed in Caishy: ${url}`,
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

export async function calendarRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get('/calendar/feed', async (req): Promise<{ feed: CalendarFeedView }> => {
    const auth = requireAuth(req);
    const row = await ctx.db
      .selectFrom('calendar_feeds')
      .select(['created_at', 'last_read_at'])
      .where('user_id', '=', auth.userId)
      .executeTakeFirst();
    return { feed: feedView(row) };
  });

  // A new address, shown this once; any old one stops working.
  app.post('/calendar/feed', async (req): Promise<{ feed: CalendarFeedView; url: string }> => {
    const auth = requireAuth(req);
    const me = await ctx.db
      .selectFrom('users')
      .select(['birth_date', 'time_zone'])
      .where('id', '=', auth.userId)
      .executeTakeFirstOrThrow();
    if (minorOf(me, ctx.now())) throw forbidden('Calendars are for people over 18.');
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

  app.delete('/calendar/feed', async (req) => {
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
  app.get('/calendar/:file', async (req, reply) => {
    const { file } = parse(z.object({ file: z.string().max(80) }), req.params);
    const token = FILE.exec(file)?.[1];
    if (!token) throw notFound('That calendar');
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
      throw notFound('That calendar');
    }
    ctx.limiter.hit(
      `calendar:${hash.toString('hex')}`,
      ctx.config.isTest ? 10_000 : 120,
      3_600_000,
    );
    if (minorOf(feed, ctx.now())) throw notFound('That calendar');
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
      name: 'Caishy',
      description: 'Your actions with a due date, and the meetings you agreed in Caishy.',
      timeZone: feed.time_zone,
      refreshMinutes: 60,
      now,
      events,
    });
    return reply
      .header('content-type', 'text/calendar; charset=utf-8')
      .header('content-disposition', 'inline; filename="caishy.ics"')
      .header('cache-control', 'private, no-store')
      .header('x-robots-tag', 'noindex, nofollow')
      .send(body);
  });
}
