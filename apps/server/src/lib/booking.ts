/**
 * Bookings (R51, R58): a host's bookable hours and catalog (`booking`, `booking_items` on
 * `organizations` and on `users`, core `BookingHours` and `BookingItem`), and the slots open
 * for one of its items, worked out on request from the appointment cards that hold them: an
 * organization's are those in its customer conversations (`orgBookings`), a person's are every
 * agreed or asked card in their own conversations (`cardsAhead`), so nothing but a card ever
 * holds a slot. A card booked from the catalog keeps what it booked on `payload.booking`
 * (`AppointmentBooking`), fixed then: the item's name, length, how many, the price, and, for
 * the team alone, who does it.
 */
import {
  type AppointmentBooking,
  type BookingAskInput,
  type BookingHours,
  type BookingItem,
  type Busy,
  bookableItems,
  bookingPrice,
  bookingSpan,
  canBook,
  openSlots,
  type Sphere,
  tr,
  zonedParts,
} from '@caime/core';
import type { AppContext } from '../context';
import type { Organization, User } from '../db/schema';
import { humanTeam } from './booking-team';
import { orgBookings } from './calendar';
import { AppError, forbidden } from './errors';
import { cardsAhead } from './upcoming';

/** Whose hours and catalog: an organization's or a person's. */
export interface BookingHost {
  kind: 'org' | 'person';
  id: string;
  hours: BookingHours | null;
  items: BookingItem[];
}

/** Someone's standing with the host, for an item's audience (core `canBook`). */
export interface Booker {
  isSelf?: boolean;
  isConnected: boolean;
  spheres: readonly Sphere[];
  adult: boolean;
}

/** The hours as kept, or null. */
export function bookingOf(
  row: Pick<Organization, 'booking'> | Pick<User, 'booking'>,
): BookingHours | null {
  return (row.booking as BookingHours | null) ?? null;
}

/** The catalog as kept (an older row has none). */
export function itemsOf(row: { booking_items?: unknown }): BookingItem[] {
  return Array.isArray(row.booking_items) ? (row.booking_items as BookingItem[]) : [];
}

export function orgHost(org: Pick<Organization, 'id' | 'booking' | 'booking_items'>): BookingHost {
  return { kind: 'org', id: org.id, hours: bookingOf(org), items: itemsOf(org) };
}

export function personHost(user: Pick<User, 'id' | 'booking' | 'booking_items'>): BookingHost {
  return { kind: 'person', id: user.id, hours: bookingOf(user), items: itemsOf(user) };
}

/** The items this booker may take from the host's catalog. */
export function itemsFor(host: BookingHost, booker: Booker): BookingItem[] {
  return bookableItems(host.items, booker, { adult: booker.adult });
}

interface Held {
  start: Date;
  end: Date;
  booking: AppointmentBooking | null;
}

/** When a card that holds a slot ends: as booked, else a slot of the hours. */
function endOf(
  hours: BookingHours,
  at: Date,
  booking: AppointmentBooking | null,
  minutes: number | null,
) {
  if (booking?.endAt) return new Date(booking.endAt);
  return new Date(at.getTime() + (minutes ?? hours.slotMinutes) * 60_000);
}

/** Everything the host has that holds a slot in the window. */
async function heldBy(
  ctx: AppContext,
  host: BookingHost,
  hours: BookingHours,
  window: { from: Date; to: Date },
): Promise<Held[]> {
  if (host.kind === 'org') {
    const booked = await orgBookings(ctx, host.id, { from: window.from, until: window.to });
    return booked.map((b) => {
      const start = new Date(b.at);
      return { start, end: endOf(hours, start, b.booking, null), booking: b.booking };
    });
  }
  // A person's own diary: every card in their own conversations, and, of an organization's
  // bookings (a team member is in every one of its conversations), only those they do.
  const cards = await cardsAhead(ctx, host.id, { from: window.from, until: window.to, limit: 500 });
  const ids = [...new Set(cards.map((c) => c.conversationId))];
  const business = new Set(
    ids.length
      ? (
          await ctx.db
            .selectFrom('business_threads')
            .select('conversation_id')
            .where('conversation_id', 'in', ids)
            .execute()
        ).map((r) => r.conversation_id)
      : [],
  );
  return cards
    .filter((c) => !business.has(c.conversationId) || c.booking?.providerId === host.id)
    .map((c) => ({
      start: c.at,
      end: endOf(hours, c.at, c.booking, c.durationMinutes),
      booking: c.booking,
    }));
}

/**
 * What's busy for one item: its own bookings take their quantity of its capacity; a card not
 * booked from the catalog, or a person's own meeting, blocks the time outright. Another item's
 * bookings don't count against this one (another chair, another room); their providers do.
 */
function busyFor(
  held: Held[],
  item: BookingItem | null,
): { busy: Busy[]; providersBusy: Busy[][] | undefined } {
  const busy: Busy[] = [];
  for (const h of held) {
    if (!h.booking) busy.push({ start: h.start, end: h.end, units: Infinity });
    else if (item && h.booking.itemId === item.id)
      busy.push({
        start: h.start,
        end: h.end,
        units: h.booking.unit === 'days' ? 1 : h.booking.quantity,
      });
    else if (!item) busy.push({ start: h.start, end: h.end, units: Infinity });
  }
  const providersBusy = item?.providers?.length
    ? item.providers.map((p) =>
        held
          .filter((h) => h.booking?.providerId === p)
          .map((h) => ({ start: h.start, end: h.end })),
      )
    : undefined;
  return { busy, providersBusy };
}

// A booking's window is looked at a little wider than asked, so a stay or a long card that
// began before the window still counts in it.
const BEFORE_MS = 31 * 86_400_000;

/** The slots open between two instants for an item (or the hours alone), at most `limit`. */
export async function openSlotsFor(
  ctx: AppContext,
  host: BookingHost,
  window: { from: Date; to: Date },
  opts: { item?: BookingItem | null; quantity?: number; limit?: number } = {},
): Promise<{ hours: BookingHours; slots: Date[] } | null> {
  const hours = host.hours;
  if (!hours) return null;
  const item = opts.item ?? null;
  const held = await heldBy(ctx, host, hours, {
    from: new Date(window.from.getTime() - BEFORE_MS),
    to: new Date(
      window.to.getTime() + (item?.unit === 'days' ? (opts.quantity ?? 1) * 86_400_000 : 0),
    ),
  });
  const { busy, providersBusy } = busyFor(held, item);
  return {
    hours,
    slots: openSlots(hours, {
      ...window,
      now: ctx.now(),
      busy,
      item,
      quantity: opts.quantity,
      providersBusy,
      limit: opts.limit ?? 200,
    }),
  };
}

/**
 * What a booker asked of the catalog, checked and fixed as the card will keep it: the item is
 * theirs to book, the quantity fits, and the slot is open for it now. Refuses with
 * `not_bookable` (403) or `slot_taken` (409).
 */
export async function bookingFor(
  ctx: AppContext,
  host: BookingHost,
  booker: Booker,
  ask: BookingAskInput,
  start: Date,
): Promise<AppointmentBooking> {
  const hours = host.hours;
  const item = host.items.find((i) => i.id === ask.itemId);
  if (!hours || !item || !canBook(item.audience, booker))
    throw new AppError(403, 'not_bookable', tr('That isn’t something you can book here.'));
  if (item.price && !booker.adult)
    throw new AppError(403, 'not_bookable', tr('Paid bookings are for people over 18.'));
  const quantity = Math.max(1, ask.quantity ?? 1);
  if (quantity > item.maxQuantity)
    throw new AppError(
      403,
      'not_bookable',
      tr('Up to {n} in one booking.', { n: item.maxQuantity }),
    );
  if (ask.providerId && !(item.providers ?? []).includes(ask.providerId))
    throw new AppError(403, 'not_bookable', tr('They don’t do that one.'));
  // The host may book their own slot for someone (a consultant filling their diary): the lead
  // time is for the other side.
  const end = bookingSpan(hours, item, quantity, start);
  const open = await openSlotsFor(
    ctx,
    booker.isSelf ? { ...host, hours: { ...hours, leadMinutes: 0 } } : host,
    { from: start, to: end },
    { item, quantity, limit: 1 },
  );
  if (!open?.slots.some((d) => d.getTime() === start.getTime()))
    throw new AppError(409, 'slot_taken', tr('That time has just been taken. Pick another.'));
  return {
    itemId: item.id,
    name: item.name,
    unit: item.unit,
    minutes: item.minutes,
    quantity,
    price: bookingPrice(item, quantity),
    endAt: end.toISOString(),
    providerId: ask.providerId ?? null,
    providerName: null,
  };
}

/**
 * Who on the team does it (R58), decided when the team confirms: the item's providers, or
 * anyone human on the team, whoever is free then with the fewest bookings that day. Null when
 * nobody is free.
 */
export async function pickProvider(
  ctx: AppContext,
  org: Pick<Organization, 'id' | 'booking' | 'booking_items'>,
  booking: AppointmentBooking,
  start: Date,
): Promise<{ id: string; name: string } | null> {
  const host = orgHost(org);
  const item = host.items.find((i) => i.id === booking.itemId);
  const team = await humanTeam(ctx.db, org.id);
  const eligible = team.filter((u) => !item?.providers || item.providers.includes(u.id));
  if (eligible.length === 0) return null;
  const end = new Date(booking.endAt);
  const day = new Date(start.getTime() - 86_400_000);
  const held = await orgBookings(ctx, org.id, {
    from: day,
    until: new Date(end.getTime() + 86_400_000),
  });
  const zone = host.hours?.timeZone ?? 'UTC';
  const sameDay = (at: string) => {
    const a = zonedParts(new Date(at), zone);
    const b = zonedParts(start, zone);
    return a.year === b.year && a.month === b.month && a.day === b.day;
  };
  const load = new Map<string, number>();
  const busy = new Set<string>();
  for (const h of held) {
    const p = h.booking?.providerId;
    if (!p) continue;
    const s = new Date(h.at).getTime();
    const e = new Date(h.booking?.endAt ?? h.at).getTime();
    if (s < end.getTime() && e > start.getTime()) busy.add(p);
    if (sameDay(h.at)) load.set(p, (load.get(p) ?? 0) + 1);
  }
  const free = eligible.filter((u) => !busy.has(u.id));
  if (free.length === 0) return null;
  free.sort(
    (a, b) =>
      (load.get(a.id) ?? 0) - (load.get(b.id) ?? 0) || a.display_name.localeCompare(b.display_name),
  );
  const chosen = free[0]!;
  return { id: chosen.id, name: chosen.display_name };
}

/** A person's own catalog names nobody; an organization's names its team. */
export function assertItemsFit(
  host: BookingHost,
  items: BookingItem[],
  teamIds: Set<string>,
  adult: boolean,
): void {
  for (const item of items) {
    if (host.kind === 'person') {
      if (item.providers) throw forbidden(tr('Your own bookings are yours to do.'));
      if (item.price && !adult) throw forbidden(tr('Paid bookings are for people over 18.'));
    } else {
      if (Array.isArray(item.audience))
        throw forbidden(tr('An organization’s items are public or for its customers.'));
      for (const p of item.providers ?? [])
        if (!teamIds.has(p)) throw forbidden(tr('Only people on the team can be providers.'));
    }
  }
}

/** "Thursday 8 October, 10:00" in the host's zone, for the agent and its customer. */
export function slotLine(at: Date, timeZone: string): string {
  const p = zonedParts(at, timeZone);
  const weekday = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][
    p.weekday
  ];
  const month = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ][p.month - 1];
  return `${weekday} ${p.day} ${month}, ${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

/** "<id> · Haircut · 45 min · EGP 200": the catalog as the agent reads it, one item per line. */
export function catalogLines(items: BookingItem[]): string | null {
  if (items.length === 0) return null;
  return items
    .map((i) =>
      [
        i.id,
        i.name,
        i.unit === 'minutes' ? `${i.minutes} min` : 'per day',
        i.price ? `${i.price.currency} ${i.price.value}` : 'free',
      ].join(' · '),
    )
    .join('\n');
}
