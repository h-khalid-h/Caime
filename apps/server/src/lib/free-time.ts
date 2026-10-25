/**
 * When someone is free (M17 I7): the hours that count as their day, what holds them (their agreed
 * meetings and appointments through `cardsAhead`, and their connected calendars' busy times
 * through `busyElsewhere`, read fresh first, R96), and the gaps left (core `free-time.ts`). Cai
 * answers "when am I free Thursday" from it, by the rules, in the writer's language; a meeting Cai
 * prepares asks `clashFor` before it's offered. A day is their own booking hours for it, else nine
 * to six on a day of their week worked, on their clock; a day off says so.
 */
import {
  dateFormat,
  formatClock,
  formatDue,
  formatWhenAt,
  safeLocale,
  zonedParts,
} from '@caime/core';
import { defaultWorkweek } from '@caime/core/countries';
import {
  clashes,
  dayWindow,
  FREE_MIN_MS,
  freeGaps,
  mergeBusy,
  nextFree,
  type Span,
} from '@caime/core/free-time';
import { listed, tr } from '@caime/core/i18n';
import { cardEndMs } from '@caime/core/meetings';
import { workHours } from '@caime/core/time';
import { firstFutureWhen } from '@caime/core/when';
import type { AppContext } from '../context';
import { bookingOf } from './booking';
import { busyElsewhere, freshenBusy } from './external-busy';
import { cardsAhead } from './upcoming';

/** What holds a stretch of someone's day: a card of theirs (agreed or still asked), or a calendar. */
export interface Held extends Span {
  /** A card's title; null for a connected calendar's busy time, which keeps no more. */
  title: string | null;
  /** Agreed, so it holds the time; a card still asked is shown, never in the way. */
  agreed: boolean;
}

/** At most this many cards are read for one day. */
const CARDS_A_DAY = 50;
const DAY_MS = 86_400_000;

/**
 * What holds the window for them: their cards that overlap it and their calendars' busy times;
 * `except` a card of theirs being moved, whose own time holds nothing against it.
 */
export async function heldIn(
  ctx: AppContext,
  userId: string,
  window: Span,
  except?: string,
): Promise<Held[]> {
  await freshenBusy(ctx, [userId]);
  const [cards, busy] = await Promise.all([
    // A card that began before the window may still run into it.
    cardsAhead(ctx, userId, {
      from: new Date(window.start - DAY_MS),
      until: new Date(window.end),
      limit: CARDS_A_DAY,
      series: { now: ctx.now() },
    }),
    busyElsewhere(ctx.db, [userId], { from: new Date(window.start), to: new Date(window.end) }),
  ]);
  const held: Held[] = cards
    .filter((c) => c.hasTime && (c.projected || c.messageId !== except))
    .map((c) => {
      const start = c.at.getTime();
      return { start, end: cardEndMs(start, c), title: c.title, agreed: c.agreed };
    })
    .filter((h) => h.end > window.start && h.start < window.end);
  for (const b of busy.get(userId) ?? [])
    held.push({ start: b.start.getTime(), end: b.end.getTime(), title: null, agreed: true });
  return held.sort((a, b) => a.start - b.start);
}

interface Who {
  id: string;
  time_zone: string;
  locale: string;
}

/** The hours that count as their day on the date `at` falls on, and the zone they're read in. */
async function theirDay(ctx: AppContext, who: Who, at: Date) {
  const row = await ctx.db
    .selectFrom('users')
    .select(['booking', 'country'])
    .where('id', '=', who.id)
    .executeTakeFirstOrThrow();
  const own = bookingOf(row);
  const zone = own?.days.length ? own.timeZone : who.time_zone;
  const week = workHours(defaultWorkweek(row.country));
  const hours = own?.days.length
    ? own.days
    : week.days.map((weekday) => ({ weekday, start: week.start, end: week.end }));
  return { zone, window: dayWindow(at, zone, hours) };
}

/**
 * Cai's answer to "when am I free …": the day the words name (today when they name none), its
 * free stretches and what holds the rest; with an hour named, whether that hour is free and, if
 * not, the next that is.
 */
export async function freeAnswer(ctx: AppContext, who: Who, text: string): Promise<string> {
  const now = ctx.now();
  const locale = safeLocale(who.locale);
  const asked = firstFutureWhen(text, { now, timeZone: who.time_zone, locale });
  const at = asked ? new Date(asked.at) : now;
  const { zone, window } = await theirDay(ctx, who, at);
  const clock = (ms: number) => formatClock(new Date(ms).toISOString(), zone, locale);
  const range = (s: Span) => `${clock(s.start)}–${clock(s.end)}`;
  const day = dayName(at, now, zone, locale);
  const dayWide = window ?? wholeDay(at, zone);
  const held = await heldIn(ctx, who.id, dayWide);
  const busy = held.filter((h) => h.agreed);
  const named = (h: Held) => `${range(h)} · ${h.title ?? tr('Busy in your calendar')}`;
  const lines: string[] = [];

  if (asked?.time) {
    const ms = at.getTime();
    const span = { start: ms, end: ms + FREE_MIN_MS };
    const taken = busy.filter((h) => clashes(span, [h]));
    if (taken.length === 0) {
      const until = busy.find((h) => h.start >= ms)?.start ?? dayWide.end;
      return tr('{when} is free, until {until}.', {
        when: formatWhenAt(asked.at, true, now, zone, locale),
        until: clock(Math.max(until, span.end)),
      });
    }
    lines.push(
      tr('{when} is taken: {what}.', {
        when: formatWhenAt(asked.at, true, now, zone, locale),
        what: listed(taken.map(named)),
      }),
    );
    const next = nextFree(dayWide, busy, ms, FREE_MIN_MS);
    lines.push(
      next === null
        ? tr('Nothing else is free that day.')
        : tr('The next free time that day: {next}.', { next: clock(next) }),
    );
    return lines.join(' ');
  }

  if (!window) {
    lines.push(tr('{day} isn’t one of your working days.', { day }));
    lines.push(
      held.length
        ? tr('Busy: {items}.', { items: listed(held.map(named)) })
        : tr('Nothing is planned.'),
    );
    return lines.join(' ');
  }
  const gaps = freeGaps(window, busy);
  const hours = range(window);
  if (mergeBusy(window, busy).length === 0)
    lines.push(tr('{day}: you’re free all day, {hours}.', { day, hours }));
  else if (gaps.length === 0)
    lines.push(tr('{day}: nothing is free in your day, {hours}.', { day, hours }));
  else lines.push(tr('{day}: you’re free {times}.', { day, times: listed(gaps.map(range)) }));
  if (busy.length) lines.push(tr('Busy: {items}.', { items: listed(busy.map(named)) }));
  const pending = held.filter((h) => !h.agreed);
  if (pending.length)
    lines.push(tr('Asked, not yet agreed: {items}.', { items: listed(pending.map(named)) }));
  return lines.join(' ');
}

/**
 * A day as a sentence names it: "Today", "Tomorrow", else in full ("Friday 23 October"), never
 * the short form a list's line takes.
 */
function dayName(at: Date, now: Date, zone: string, locale: string): string {
  const a = zonedParts(at, zone);
  const n = zonedParts(now, zone);
  const days = Math.round(
    (Date.UTC(a.year, a.month - 1, a.day) - Date.UTC(n.year, n.month - 1, n.day)) / DAY_MS,
  );
  if (days === 0 || days === 1) return formatDue(at.toISOString(), now, zone, locale);
  return dateFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(a.year !== n.year ? { year: 'numeric' as const } : {}),
    timeZone: zone,
  }).format(at);
}

/** A whole day on their clock, for a day off: what's planned on it, if anything. */
function wholeDay(at: Date, zone: string): Span {
  const all = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, start: '00:00', end: '23:59' }));
  const w = dayWindow(at, zone, all)!;
  return { start: w.start, end: w.end };
}

/**
 * Whether a meeting at `at` for `minutes` would meet something that holds their time, and if so
 * what, and the next free start that day the meeting fits (null when none does).
 */
export async function clashFor(
  ctx: AppContext,
  who: Who,
  at: Date,
  minutes: number,
  /** A card being moved (M17 I7): its own time is no clash. */
  except?: string,
): Promise<{ with: Held[]; next: Date | null } | null> {
  const ms = minutes * 60_000;
  const { window } = await theirDay(ctx, who, at);
  const span = { start: at.getTime(), end: at.getTime() + ms };
  const look = window ?? { start: span.start, end: span.end };
  const held = await heldIn(
    ctx,
    who.id,
    { start: Math.min(look.start, span.start), end: Math.max(look.end, span.end) },
    except,
  );
  const busy = held.filter((h) => h.agreed);
  const meets = busy.filter((h) => clashes(span, [h]));
  if (meets.length === 0) return null;
  const next = window ? nextFree(window, busy, span.start, ms) : null;
  return { with: meets, next: next === null ? null : new Date(next) };
}
