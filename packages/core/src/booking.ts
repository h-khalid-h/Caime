/**
 * Bookings (R51, R58): a host's bookable hours, the catalog of what can be booked in them, and
 * the open slots for one item. A host is an organization or a person; the shape is one. Pure:
 * the server works out the slots (taking out what's booked) and the app shows them; nothing
 * here touches a clock or a store. Times are the host's own, in its time zone; a slot is an
 * instant, so a booker anywhere sees it in theirs.
 */
import { msg, tr } from './i18n';
import type { Sphere } from './taxonomy';
import { addDays, zonedParts, zonedTimeToUtc } from './time';

export const SLOT_MINUTES = [15, 20, 30, 45, 60, 90, 120] as const;
export type SlotMinutes = (typeof SLOT_MINUTES)[number];

/** How far ahead a customer may book, at most, and how soon. */
export const BOOKING_HORIZON_DAYS_MAX = 90;
export const BOOKING_LEAD_MINUTES_MAX = 7 * 24 * 60;

/** A catalog holds at most this many items; an item is taken by at most this many at once. */
export const BOOKING_ITEMS_MAX = 50;
export const BOOKING_CAPACITY_MAX = 100;
/** A stay of at most this many days, in one booking. */
export const BOOKING_DAYS_MAX = 30;

export interface BookingDay {
  /** 0 is Sunday, as JavaScript counts. */
  weekday: number;
  /** "HH:MM", the host's local time; `end` after `start`, on the same day. */
  start: string;
  end: string;
}

export interface BookingHours {
  /** An IANA time zone: the host's own. */
  timeZone: string;
  /** The grid a day is cut into; an item without a length of its own lasts one of these. */
  slotMinutes: SlotMinutes;
  days: BookingDay[];
  /** Nothing sooner than this from now may be booked. */
  leadMinutes: number;
  /** Nothing further ahead than this many days may be booked. */
  horizonDays: number;
}

/**
 * Minutes (an appointment, a lesson), days (a room, a rental), or each: ordered by the piece
 * (R60: a dish, a cake, a bag of coffee), taken on an Order card, never a slot.
 */
export type BookingUnit = 'minutes' | 'days' | 'each';

/** How a host takes orders (R60): how they reach the customer, and a line they read first. */
export interface OrderingSettings {
  fulfilment: Array<'pickup' | 'delivery'>;
  note: string | null;
}

/** One line of an order as asked: an item of the catalog and how many. */
export interface OrderAsk {
  lines: Array<{ itemId: string; quantity: number }>;
  fulfilment?: 'pickup' | 'delivery' | null;
}

/** What an Order card keeps of what was ordered (`payload.order`), fixed when it was placed. */
export interface PlacedOrder {
  lines: Array<{
    itemId: string;
    name: string;
    quantity: number;
    /** The line's price (each times the quantity), as it was then. */
    price: { value: number; currency: string } | null;
  }>;
  /** The whole order's, where every priced line is in one currency; else null. */
  total: { value: number; currency: string } | null;
  fulfilment: 'pickup' | 'delivery' | null;
}

/** An order holds at most this many lines. */
export const ORDER_LINES_MAX = 30;

/** Booked in time (an appointment, a stay), or ordered by the piece. */
export const isOrdered = (item: Pick<BookingItem, 'unit'>) => item.unit === 'each';
export const isBooked = (item: Pick<BookingItem, 'unit'>) => item.unit !== 'each';

/**
 * Checks an order against the host's catalog and fixes it as the card keeps it: every line an
 * item sold by the piece this booker may order, its quantity within the item's, the fulfilment
 * one the host offers. An error is the reader's sentence, through `tr` by the caller.
 */
export function placeOrder(
  settings: OrderingSettings | null,
  items: readonly BookingItem[],
  ask: OrderAsk,
):
  | { ok: true; order: PlacedOrder }
  | { ok: false; reason: 'off' | 'item' | 'quantity' | 'fulfilment' | 'empty'; max?: number } {
  if (!settings) return { ok: false, reason: 'off' };
  const merged = new Map<string, number>();
  for (const l of ask.lines) merged.set(l.itemId, (merged.get(l.itemId) ?? 0) + l.quantity);
  if (merged.size === 0) return { ok: false, reason: 'empty' };
  const lines: PlacedOrder['lines'] = [];
  for (const [itemId, quantity] of merged) {
    const item = items.find((i) => i.id === itemId);
    if (!item || !isOrdered(item)) return { ok: false, reason: 'item' };
    if (quantity < 1 || quantity > item.maxQuantity)
      return { ok: false, reason: 'quantity', max: item.maxQuantity };
    lines.push({ itemId, name: item.name, quantity, price: bookingPrice(item, quantity) });
  }
  const fulfilment = ask.fulfilment ?? settings.fulfilment[0] ?? null;
  if (fulfilment && !settings.fulfilment.includes(fulfilment))
    return { ok: false, reason: 'fulfilment' };
  const priced = lines.flatMap((l) => (l.price ? [l.price] : []));
  const currencies = new Set(priced.map((p) => p.currency));
  const total =
    priced.length && currencies.size === 1
      ? {
          value: Math.round(priced.reduce((sum, p) => sum + p.value, 0) * 100) / 100,
          currency: priced[0]?.currency ?? '',
        }
      : null;
  return { ok: true, order: { lines, total, fulfilment } };
}

/** "2 × Shawarma, 1 × Fries": an order in one line, for the card's summary. */
export function orderSummary(order: Pick<PlacedOrder, 'lines'>): string {
  return order.lines.map((l) => `${l.quantity} × ${l.name}`).join(', ');
}

/**
 * Who may book an item: anyone (a visitor signs up for it), anyone connected (or any customer
 * of an organization), or the people in these spheres (a person's rate for friends). An
 * organization's items are public or for its customers; spheres are a person's.
 */
export type BookingAudience = 'public' | 'connections' | Sphere[];

/**
 * One thing a host can be booked for (R58). A free item has no price. For minutes, a booking
 * takes `minutes` at the slot and `quantity` places of `capacity` ("for 2"); for days it takes
 * `quantity` days from the slot's day and one of `capacity` each day (a room). An item names
 * the team members who do it, or nobody in particular (any of them); a person's own items are
 * the person's. `askTopic` lets the booker write what it's for.
 */
export interface BookingItem {
  id: string;
  name: string;
  price: { value: number; currency: string } | null;
  unit: BookingUnit;
  /** For minutes; a days item has none (a day is a day). */
  minutes: SlotMinutes | null;
  capacity: number;
  maxQuantity: number;
  audience: BookingAudience;
  /** Team members' ids (an organization's); null for anyone on the team, or a person's own. */
  providers: string[] | null;
  askTopic: boolean;
  /** Its address under the host's (R61): `/o/<handle>/<slug>` for a public item. */
  slug: string;
  /** A line or two about it, shown on its page and under its name in a picker. */
  description: string | null;
  /** The collection it's in (R61), or none. */
  collectionId: string | null;
}

/** What a card keeps of the item it booked (`payload.booking`), fixed at the time of booking. */
export interface AppointmentBooking {
  itemId: string;
  name: string;
  unit: BookingUnit;
  minutes: number | null;
  quantity: number;
  /** The whole booking's price (the item's, times the quantity), as it was then. */
  price: { value: number; currency: string } | null;
  /** When it ends: the slot plus its length, or the last day's end. */
  endAt: string;
  /** Who on the team does it; the customer never sees this (R15). */
  providerId: string | null;
  providerName: string | null;
}

export interface Busy {
  start: Date;
  end: Date;
  /** How many of an item's capacity it takes; Infinity blocks the whole time (a host's own meeting). */
  units?: number;
}

const minutesOf = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map((x) => Number(x));
  return (h ?? 0) * 60 + (m ?? 0);
};

const DAY_MS = 86_400_000;

export interface SlotQuery {
  from: Date;
  to: Date;
  now: Date;
  /** What's booked of this item (its own bookings; a host's meetings as Infinity). */
  busy: Busy[];
  /** The item booked; without one, the hours alone (a slot of `slotMinutes`, one at a time). */
  item?: Pick<BookingItem, 'unit' | 'minutes' | 'capacity'> | null;
  /** Places (minutes) or days (days) wanted; 1 without. */
  quantity?: number;
  /**
   * For an item with named providers: each one's own bookings. A slot is open only while one
   * of them is free for it (a person does one thing at a time, whatever the item's capacity).
   */
  providersBusy?: Busy[][];
  limit?: number;
}

/** What a booking of this item occupies from `start`, in ms, and the end instant. */
export function bookingSpan(
  hours: Pick<BookingHours, 'slotMinutes'>,
  item: Pick<BookingItem, 'unit' | 'minutes'> | null | undefined,
  quantity: number,
  start: Date,
): Date {
  if (item?.unit === 'days') return new Date(start.getTime() + Math.max(1, quantity) * DAY_MS);
  const minutes = item?.minutes ?? hours.slotMinutes;
  return new Date(start.getTime() + minutes * 60_000);
}

/** Whether `want` more of `capacity` fit in [start, end) beside what's busy. */
function roomFor(busy: Busy[], start: number, end: number, want: number, capacity: number) {
  let used = 0;
  for (const b of busy) {
    if (b.start.getTime() < end && b.end.getTime() > start) used += b.units ?? 1;
    if (used + want > capacity) return false;
  }
  return true;
}

/**
 * The slots open between `from` and `to`: each day's hours cut into the grid, from the first
 * that starts at or after `from` and at least the lead time after `now`, to the last whose
 * booking ends by the day's end (minutes) or within the horizon (days), with room in the
 * item's capacity for the quantity wanted beside what's booked, and, for an item with named
 * providers, one of them free. Soonest first, at most `limit`.
 */
export function openSlots(hours: BookingHours, opts: SlotQuery): Date[] {
  const limit = opts.limit ?? 200;
  const item = opts.item ?? null;
  // Ordered by the piece (R60): no time to hold.
  if (item?.unit === 'each') return [];
  const want = Math.max(1, opts.quantity ?? 1);
  const capacity = item?.capacity ?? 1;
  const earliest = Math.max(opts.from.getTime(), opts.now.getTime() + hours.leadMinutes * 60_000);
  const latest = Math.min(opts.to.getTime(), opts.now.getTime() + hours.horizonDays * DAY_MS);
  if (latest <= earliest || hours.days.length === 0) return [];
  const days = item?.unit === 'days';
  const lengthMs = days ? want * DAY_MS : (item?.minutes ?? hours.slotMinutes) * 60_000;
  const stepMinutes = hours.slotMinutes;
  const out: Date[] = [];
  const open = (start: number, end: number): boolean => {
    // A stay is checked a day at a time: two rooms taken on different nights are not two taken
    // on one.
    const pieces = days
      ? Array.from({ length: want }, (_, i) => [start + i * DAY_MS, start + (i + 1) * DAY_MS])
      : [[start, end]];
    const fits = pieces.every(([s, e]) =>
      roomFor(opts.busy, s ?? 0, e ?? 0, days ? 1 : want, capacity),
    );
    if (!fits) return false;
    if (!opts.providersBusy || opts.providersBusy.length === 0) return true;
    return opts.providersBusy.some((theirs) => roomFor(theirs, start, end, 1, 1));
  };
  // Walk the days in the host's zone, from the day `earliest` falls on.
  const first = zonedParts(new Date(earliest), hours.timeZone);
  for (let offset = 0; offset <= hours.horizonDays + 1 && out.length < limit; offset++) {
    const d = addDays(first, offset);
    for (const day of hours.days) {
      if (day.weekday !== d.weekday) continue;
      const openAt = minutesOf(day.start);
      const close = minutesOf(day.end);
      const at = (m: number) =>
        zonedTimeToUtc(
          { year: d.year, month: d.month, day: d.day, hour: Math.floor(m / 60), minute: m % 60 },
          hours.timeZone,
        ).getTime();
      if (days) {
        // One slot a day, at the day's opening (a check-in time); the stay ends within the horizon.
        const start = at(openAt);
        const end = start + lengthMs;
        if (start < earliest) continue;
        if (start >= latest) break;
        if (end > opts.now.getTime() + (hours.horizonDays + 1) * DAY_MS) break;
        if (open(start, end)) out.push(new Date(start));
        continue;
      }
      for (let m = openAt; m * 60_000 + lengthMs <= close * 60_000; m += stepMinutes) {
        const start = at(m);
        const end = start + lengthMs;
        if (start < earliest) continue;
        if (end > latest) {
          if (start >= latest) break;
          continue;
        }
        if (open(start, end)) out.push(new Date(start));
        if (out.length >= limit) break;
      }
      if (out.length >= limit) break;
    }
  }
  return out.sort((a, b) => a.getTime() - b.getTime()).slice(0, limit);
}

/** Whether someone in this standing may book an item with this audience. */
export function canBook(
  audience: BookingAudience,
  viewer: { isSelf?: boolean; isConnected: boolean; spheres: readonly Sphere[] },
): boolean {
  if (viewer.isSelf) return true;
  if (audience === 'public') return true;
  if (audience === 'connections') return viewer.isConnected;
  return audience.some((s) => viewer.spheres.includes(s));
}

/**
 * The items this viewer may book, in the host's order: the item's audience allows them, and its
 * collection's too (R61), when it's in one.
 */
export function bookableItems(
  items: readonly BookingItem[],
  viewer: { isSelf?: boolean; isConnected: boolean; spheres: readonly Sphere[] },
  opts: {
    adult: boolean;
    collections?: ReadonlyArray<{ id: string; audience: BookingAudience }>;
  } = { adult: true },
): BookingItem[] {
  const shelf = new Map((opts.collections ?? []).map((c) => [c.id, c.audience]));
  const shelfAllows = (i: BookingItem) => {
    const audience = i.collectionId ? shelf.get(i.collectionId) : undefined;
    return audience === undefined || canBook(audience, viewer);
  };
  // A paid item is a card about money: adults only (R29, R38).
  return items.filter(
    (i) => canBook(i.audience, viewer) && shelfAllows(i) && (opts.adult || i.price === null),
  );
}

/** The whole booking's price: the item's, times the quantity. */
export function bookingPrice(
  item: Pick<BookingItem, 'price'>,
  quantity: number,
): { value: number; currency: string } | null {
  if (!item.price) return null;
  return {
    value: Math.round(item.price.value * Math.max(1, quantity) * 100) / 100,
    currency: item.price.currency,
  };
}

/** A week's days, short, as keys (Sunday first, as JavaScript counts): shown through `tr`. */
export const DAY_SHORT = [
  msg('Sun'),
  msg('Mon'),
  msg('Tue'),
  msg('Wed'),
  msg('Thu'),
  msg('Fri'),
  msg('Sat'),
];
const day = (n: number | undefined) => tr(DAY_SHORT[n ?? 0] ?? 'Sun');

/** "Sun–Thu 9:00–17:00, Sat 9:00–13:00 · 30 min": how a page says the hours. */
export function describeHours(hours: BookingHours): string {
  const byRange = new Map<string, number[]>();
  for (const d of [...hours.days].sort((a, b) => a.weekday - b.weekday)) {
    const key = `${d.start}–${d.end}`;
    byRange.set(key, [...(byRange.get(key) ?? []), d.weekday]);
  }
  const runs = (days: number[]): string => {
    const parts: string[] = [];
    let i = 0;
    while (i < days.length) {
      let j = i;
      while (j + 1 < days.length && days[j + 1] === (days[j] ?? 0) + 1) j++;
      parts.push(
        j - i >= 2
          ? `${day(days[i])}–${day(days[j])}`
          : days
              .slice(i, j + 1)
              .map((x) => day(x))
              .join(', '),
      );
      i = j + 1;
    }
    return parts.join(', ');
  };
  const trim = (hhmm: string) => hhmm.replace(/^0/, '');
  const ranges = [...byRange].map(
    ([range, days]) => `${runs(days)} ${range.split('–').map(trim).join('–')}`,
  );
  return `${ranges.join(', ')} · ${tr('{m} min', { m: hours.slotMinutes })}`;
}

// Grouping by collection (R61) lives here, beside the items, so a picker that only groups
// doesn't pull the catalog's address rules (catalog.ts) into every chunk.
/** The items of a collection, or those in none, in the host's order. */
export function itemsIn<I extends Pick<BookingItem, 'collectionId'>>(
  items: readonly I[],
  collectionId: string | null,
): I[] {
  return items.filter((i) => (i.collectionId ?? null) === collectionId);
}

/**
 * The catalog grouped for a picker or a page: each collection with its items (empty ones
 * left out), then whatever is in none, under a null heading.
 */
export function grouped<
  I extends Pick<BookingItem, 'collectionId'>,
  C extends { id: string; name: string },
>(items: readonly I[], collections: readonly C[]): Array<{ collection: C | null; items: I[] }> {
  const known = new Set(collections.map((c) => c.id));
  const out: Array<{ collection: C | null; items: I[] }> = collections
    .map((c) => ({ collection: c as C | null, items: itemsIn(items, c.id) }))
    .filter((g) => g.items.length > 0);
  const loose = items.filter((i) => !i.collectionId || !known.has(i.collectionId));
  if (loose.length) out.push({ collection: null, items: loose });
  return out;
}
