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
  type BookingItemInput,
  type Busy,
  bookableItems,
  bookingPrice,
  bookingSpan,
  type CatalogCollection,
  type CollectionInput,
  canBook,
  isBooked,
  isOrdered,
  type OrderAsk,
  type OrderingSettings,
  openSlots,
  orderableMax,
  type PaymentSettings,
  type PlacedOrder,
  placeOrder,
  type Sphere,
  tr,
  withSlugs,
  zonedParts,
} from '@caime/core';
import type { AppContext } from '../context';
import type { Organization, User } from '../db/schema';
import { humanTeam } from './booking-team';
import { orgBookings } from './calendar';
import { AppError, badRequest, forbidden } from './errors';
import { busyElsewhere } from './external-busy';
import { bookablePlaceIds, bookingWhere } from './places';
import { soldOut } from './stock';
import { cardsAhead } from './upcoming';

/** Whose hours and catalog: an organization's or a person's. */
export interface BookingHost {
  kind: 'org' | 'person';
  id: string;
  hours: BookingHours | null;
  items: BookingItem[];
  /** How it takes orders (R60), or null. */
  ordering: OrderingSettings | null;
  /** Its collections (R61). */
  collections: CatalogCollection[];
  /** How it's paid (R62), or null. */
  payments: PaymentSettings | null;
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

/**
 * The catalog and its collections as kept, each with its address (R61): an item kept before
 * addresses gets one from its name, the same one every time, since the order is the host's.
 */
export function catalogOf(row: { booking_items?: unknown; collections?: unknown }): {
  items: BookingItem[];
  collections: CatalogCollection[];
} {
  const items = (Array.isArray(row.booking_items) ? row.booking_items : []) as BookingItem[];
  const collections = (
    Array.isArray(row.collections) ? row.collections : []
  ) as CatalogCollection[];
  return withSlugs(
    items.map((i) => ({
      ...i,
      description: i.description ?? null,
      collectionId: i.collectionId ?? null,
    })),
    collections.map((c) => ({ ...c, description: c.description ?? null })),
  );
}

/** The catalog as kept (an older row has none). */
export function itemsOf(row: { booking_items?: unknown; collections?: unknown }): BookingItem[] {
  return catalogOf(row).items;
}

type CatalogRow = {
  id: string;
  booking: unknown;
  booking_items: unknown;
  ordering?: unknown;
  collections?: unknown;
  payments?: unknown;
};

/** How a host is paid (R62), as kept (a row read without the column has none). */
export function paymentsOf(row: { payments?: unknown }): PaymentSettings | null {
  return (row.payments as PaymentSettings | null | undefined) ?? null;
}

/** How a host takes orders, as kept (a row read without the column has none). */
export function orderingOf(row: { ordering?: unknown }): OrderingSettings | null {
  return (row.ordering as OrderingSettings | null | undefined) ?? null;
}

export function orgHost(org: CatalogRow): BookingHost {
  return {
    kind: 'org',
    id: org.id,
    hours: bookingOf(org as Pick<Organization, 'booking'>),
    ...catalogOf(org),
    ordering: orderingOf(org),
    payments: paymentsOf(org),
  };
}

export function personHost(user: CatalogRow): BookingHost {
  return {
    kind: 'person',
    id: user.id,
    hours: bookingOf(user as Pick<User, 'booking'>),
    ...catalogOf(user),
    ordering: orderingOf(user),
    payments: paymentsOf(user),
  };
}

/**
 * An order checked against the host's catalog and fixed as the card keeps it (R60): items sold
 * by the piece this booker may order, within each item's quantity, a way the host offers.
 */
export function orderFor(host: BookingHost, booker: Booker, ask: OrderAsk): PlacedOrder {
  const allowed = itemsFor(host, booker);
  const placed = placeOrder(host.ordering, allowed, ask);
  if (placed.ok) return placed.order;
  // Fewer left than asked (R60): how many, or none.
  if (placed.reason === 'stock') throw soldOut(placed.name ?? '', placed.max ?? 0);
  // An option not chosen as it asks (R60): which, for what.
  if (placed.reason === 'choice')
    throw new AppError(
      400,
      'invalid_request',
      tr('Choose from “{option}” for {name}.', {
        option: placed.option ?? '',
        name: placed.name ?? '',
      }),
    );
  const why = {
    off: () => tr('Orders aren’t taken here.'),
    item: () => tr('That isn’t something you can order here.'),
    quantity: () => tr('Up to {n} of that in one order.', { n: placed.max ?? 1 }),
    fulfilment: () => tr('They don’t offer that way.'),
    empty: () => tr('Pick something to order.'),
  }[placed.reason];
  throw new AppError(403, 'not_bookable', why());
}

/** Whether anyone at all may see an item (R61, R63): public, in no collection or a public one. */
export function isPublicItem(host: Pick<BookingHost, 'collections'>, item: BookingItem): boolean {
  if (item.audience !== 'public') return false;
  if (!item.collectionId) return true;
  return host.collections.find((c) => c.id === item.collectionId)?.audience === 'public';
}

/**
 * Photos set on a save (R63) are images the person saving uploaded; a photo the catalog already
 * had stays as it is, whoever set it.
 */
export async function assertItemPhotos(
  ctx: AppContext,
  userId: string,
  next: BookingItem[],
  before: BookingItem[],
): Promise<void> {
  const kept = new Set(before.map((i) => i.photoFileId).filter(Boolean));
  const fresh = [
    ...new Set(
      next.map((i) => i.photoFileId).filter((f): f is string => Boolean(f) && !kept.has(f)),
    ),
  ];
  if (!fresh.length) return;
  const mine = await ctx.db
    .selectFrom('files')
    .select('id')
    .where('id', 'in', fresh)
    .where('owner_id', '=', userId)
    .where('kind', '=', 'image')
    // Re-encoded at upload (a JPEG, PNG or WebP): an original would keep its metadata.
    .where('thumb_key', 'is not', null)
    .execute();
  if (mine.length !== fresh.length) throw badRequest(tr('Choose an image you uploaded.'));
}

/** The items as anyone off the team sees them: who on the team does one is the team's to know. */
export function withoutProviders<T extends { providers?: string[] | null }>(items: T[]): T[] {
  return items.map(({ providers: _providers, ...item }) => item as T);
}

/** The items this booker may take from the host's catalog. */
export function itemsFor(host: BookingHost, booker: Booker): BookingItem[] {
  return bookableItems(host.items, booker, {
    adult: booker.adult,
    collections: host.collections,
  });
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
  exceptSeries?: string,
): Promise<Held[]> {
  // Every card in the window, never a page of them: a card left out reads as a free slot; and
  // the times ahead of a repeating appointment (R58), which hold theirs before each is posted.
  if (host.kind === 'org') {
    const booked = await orgBookings(
      ctx,
      host.id,
      { from: window.from, until: window.to },
      { limit: HELD_MAX, ahead: { now: ctx.now(), exceptSeries } },
    );
    return booked.map((b) => {
      const start = new Date(b.at);
      return { start, end: endOf(hours, start, b.booking, null), booking: b.booking };
    });
  }
  // A person's own diary: every card in their own conversations and, of an organization's,
  // only those they do (`cardsAhead` keeps a team member to what's theirs); and the times of a
  // meeting that repeats (R58) before each is posted, which hold their time as the card will.
  const cards = await cardsAhead(ctx, host.id, {
    from: window.from,
    until: window.to,
    limit: HELD_MAX,
    series: { now: ctx.now() },
  });
  // And when they're busy in their other calendar (R90): held outright, as their own meeting.
  const elsewhere = (await busyElsewhere(ctx.db, [host.id], window)).get(host.id) ?? [];
  return [
    ...cards
      .filter((c) => !(exceptSeries && c.projected && c.series?.id === exceptSeries))
      .map((c) => ({
        start: c.at,
        end: endOf(hours, c.at, c.booking, c.durationMinutes),
        booking: c.booking,
      })),
    ...elsewhere.map((b) => ({ start: b.start, end: b.end, booking: null })),
  ];
}

/** More cards than any window holds; a bound on the read, never a page. */
const HELD_MAX = 10_000;

/**
 * What's busy for one item: its own bookings take their quantity of its capacity; a card not
 * booked from the catalog, or a person's own meeting, blocks the time outright. Another item's
 * bookings don't count against this one (another chair, another room); their providers do, and
 * so do they against a resource the two share (R58: one set of chairs for a cut and a colour).
 */
function busyFor(
  held: Held[],
  item: BookingItem | null,
  host: Pick<BookingHost, 'hours' | 'items'>,
): {
  busy: Busy[];
  providersBusy: Busy[][] | undefined;
  resource: { capacity: number; busy: Busy[] } | null;
} {
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
  // A shared resource (R58): what every item using it has booked, against how many there are.
  const shared = item?.resourceId
    ? host.hours?.resources?.find((r) => r.id === item.resourceId)
    : undefined;
  const sharing = shared
    ? new Set(host.items.filter((i) => i.resourceId === shared.id).map((i) => i.id))
    : null;
  const resource =
    shared && sharing
      ? {
          capacity: shared.capacity,
          busy: held
            .filter((h) => h.booking && sharing.has(h.booking.itemId))
            .map((h) => ({
              start: h.start,
              end: h.end,
              units: h.booking?.unit === 'days' ? 1 : (h.booking?.quantity ?? 1),
            })),
        }
      : null;
  return { busy, providersBusy, resource };
}

// A booking's window is looked at a little wider than asked, so a card that began before it
// and is still on counts in it: a day for anything timed, a month for a stay.
const BEFORE_MS = 86_400_000;
const BEFORE_STAY_MS = 31 * 86_400_000;

/** The slots open between two instants for an item (or the hours alone), at most `limit`. */
export async function openSlotsFor(
  ctx: AppContext,
  host: BookingHost,
  window: { from: Date; to: Date },
  opts: {
    item?: BookingItem | null;
    quantity?: number;
    limit?: number;
    /** A repeating appointment booking its next time (R58): its own times ahead hold nothing. */
    exceptSeries?: string;
  } = {},
): Promise<{ hours: BookingHours; slots: Date[] } | null> {
  const hours = host.hours;
  if (!hours) return null;
  const item = opts.item ?? null;
  const held = await heldBy(
    ctx,
    host,
    hours,
    {
      from: new Date(window.from.getTime() - (item?.unit === 'days' ? BEFORE_STAY_MS : BEFORE_MS)),
      to: new Date(
        window.to.getTime() + (item?.unit === 'days' ? (opts.quantity ?? 1) * 86_400_000 : 0),
      ),
    },
    opts.exceptSeries,
  );
  const { busy, providersBusy, resource } = busyFor(held, item, host);
  // An organization's providers are busy in their other calendars too (R90).
  if (host.kind === 'org' && item?.providers?.length && providersBusy) {
    const elsewhere = await busyElsewhere(ctx.db, item.providers, window);
    item.providers.forEach((p, i) => {
      for (const b of elsewhere.get(p) ?? []) providersBusy[i]?.push(b);
    });
  }
  return {
    hours,
    slots: openSlots(hours, {
      ...window,
      now: ctx.now(),
      busy,
      item,
      quantity: opts.quantity,
      providersBusy,
      resource,
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
  /**
   * A later time of a repeating appointment (R58): agreed with the series, so the lead time and
   * the horizon are behind it, and its own times ahead aren't in its way.
   */
  opts: { series?: string } = {},
): Promise<AppointmentBooking> {
  const hours = host.hours;
  const item = host.items.find((i) => i.id === ask.itemId);
  if (!hours || !item || !isBooked(item) || !canBook(item.audience, booker))
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
  // Who does it is the team's to say (`pickProvider`, the reassign route): a booker names
  // someone only when the catalog is their own.
  if (ask.providerId && !booker.isSelf)
    throw new AppError(403, 'not_bookable', tr('Who does it is for the team to say.'));
  if (ask.providerId && !(item.providers ?? []).includes(ask.providerId))
    throw new AppError(403, 'not_bookable', tr('They don’t do that one.'));
  // The host may book their own slot for someone (a consultant filling their diary): the lead
  // time is for the other side.
  const end = bookingSpan(hours, item, quantity, start);
  const daysOut = Math.ceil((start.getTime() - ctx.now().getTime()) / 86_400_000) + 1;
  const open = await openSlotsFor(
    ctx,
    opts.series
      ? {
          ...host,
          hours: { ...hours, leadMinutes: 0, horizonDays: Math.max(hours.horizonDays, daysOut) },
        }
      : booker.isSelf
        ? { ...host, hours: { ...hours, leadMinutes: 0 } }
        : host,
    { from: start, to: end },
    { item, quantity, limit: 1, exceptSeries: opts.series },
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
    // Where (R92): the branch's address as written now, copied into the card.
    ...(host.kind === 'org' && item.placeId
      ? { where: await bookingWhere(ctx, host.id, item.placeId) }
      : {}),
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
  /**
   * A later time of a repeating appointment (R58): whoever did the time before keeps it while
   * they're free, and the series' own times ahead don't hold them.
   */
  opts: { prefer?: string | null; exceptSeries?: string } = {},
): Promise<{ id: string; name: string } | null> {
  const host = orgHost(org);
  const item = host.items.find((i) => i.id === booking.itemId);
  const team = await humanTeam(ctx.db, org.id);
  const eligible = team.filter((u) => !item?.providers || item.providers.includes(u.id));
  if (eligible.length === 0) return null;
  const end = new Date(booking.endAt);
  const day = new Date(start.getTime() - 86_400_000);
  const held = await orgBookings(
    ctx,
    org.id,
    { from: day, until: new Date(end.getTime() + 86_400_000) },
    { ahead: { now: ctx.now(), exceptSeries: opts.exceptSeries } },
  );
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
  // Busy in their other calendar at that time (R90) is busy here too.
  const elsewhere = await busyElsewhere(
    ctx.db,
    eligible.map((u) => u.id),
    { from: start, to: end },
  );
  for (const [id, blocks] of elsewhere) if (blocks.length) busy.add(id);
  const free = eligible.filter((u) => !busy.has(u.id));
  if (free.length === 0) return null;
  const preferred = opts.prefer ? free.find((u) => u.id === opts.prefer) : undefined;
  if (preferred) return { id: preferred.id, name: preferred.display_name };
  free.sort(
    (a, b) =>
      (load.get(a.id) ?? 0) - (load.get(b.id) ?? 0) || a.display_name.localeCompare(b.display_name),
  );
  const chosen = free[0]!;
  return { id: chosen.id, name: chosen.display_name };
}

/** A person's own catalog names nobody; an organization's names its team. */
/**
 * What a save keeps (R61): the catalog as sent, its collections as sent (else as they were),
 * an item in a collection no longer there in none, and every address unique.
 */
export function catalogFrom(
  body: { items: BookingItemInput[]; collections?: CollectionInput[] },
  kept: CatalogCollection[],
  hours: Pick<BookingHours, 'resources'> | null = null,
): { items: BookingItem[]; collections: CatalogCollection[] } {
  const collections = body.collections ?? kept;
  const ids = new Set(collections.map((c) => c.id));
  // A shared resource (R58) is one the hours keep, for something held at a time.
  const shared = new Set((hours?.resources ?? []).map((r) => r.id));
  return withSlugs(
    // A count isn't the catalog's: it's kept apart (lib/stock.ts).
    body.items.map(({ stock: _stock, ...i }) => ({
      ...i,
      collectionId: i.collectionId && ids.has(i.collectionId) ? i.collectionId : null,
      resourceId:
        i.resourceId && i.unit !== 'each' && shared.has(i.resourceId) ? i.resourceId : null,
      // Where it's done (R92) is for something booked at a time; `assertPlacesFit` checks it.
      placeId: i.unit !== 'each' ? (i.placeId ?? null) : null,
    })),
    collections,
  ) as { items: BookingItem[]; collections: CatalogCollection[] };
}

/**
 * Ways to be paid fit their host (R62): an adult's (a card about money is adults-only, R29), and
 * an organization's for everyone or its customers, as its items are.
 */
export function assertPaymentsFit(
  host: Pick<BookingHost, 'kind'>,
  payments: PaymentSettings | null | undefined,
  adult: boolean,
): void {
  if (!payments) return;
  if (!adult) throw forbidden(tr('Ways to be paid are for people over 18.'));
  if (host.kind === 'org' && payments.methods.some((m) => Array.isArray(m.audience)))
    throw forbidden(tr('An organization’s items are public or for its customers.'));
}

export function assertItemsFit(
  host: BookingHost,
  items: BookingItem[],
  teamIds: Set<string>,
  adult: boolean,
  collections: CatalogCollection[] = [],
): void {
  // An organization's shelves are for everyone or its customers, as its items are.
  if (host.kind === 'org' && collections.some((c) => Array.isArray(c.audience)))
    throw forbidden(tr('An organization’s items are public or for its customers.'));
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

/**
 * An organization's items and branches' days point at its own places, for its customers or
 * everyone (R92): a booking copies the address to whoever booked. A person's catalog has none.
 */
export async function assertPlacesFit(
  ctx: Pick<AppContext, 'db'>,
  host: Pick<BookingHost, 'kind' | 'id'>,
  items: BookingItem[],
  hours: BookingHours | null,
): Promise<void> {
  const wanted = [
    ...items.flatMap((i) => (i.placeId ? [i.placeId] : [])),
    ...(hours?.placeHours ?? []).map((p) => p.placeId),
  ];
  if (wanted.length === 0) return;
  if (host.kind === 'person')
    throw forbidden(tr('Only an organization’s items are done at its places.'));
  const open = await bookablePlaceIds(ctx, host.id);
  if (wanted.some((id) => !open.has(id)))
    throw badRequest(tr('Choose one of your places that customers may see.'));
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

/**
 * "<id> · Kunafa · EGP 60 · up to 5", "… · sold out": what a customer may order (R60), as the
 * agent reads it, one item per line, from the items as that customer sees them (a count only
 * where it limits their order).
 */
export function menuLines(all: BookingItem[]): string | null {
  const items = all.filter(isOrdered);
  if (items.length === 0) return null;
  return items
    .map((i) =>
      [
        [
          i.id,
          i.name,
          i.price ? `${i.price.currency} ${i.price.value}` : 'free',
          orderableMax(i) === 0 ? 'sold out' : `up to ${orderableMax(i)}`,
        ].join(' · '),
        // Its options (R60), one per line under it: "  option Size (one, required): s=Small,
        // l=Large +10".
        ...(i.options ?? []).map(
          (o) =>
            `  option ${o.name} (${o.pick}${o.required ? ', required' : ''}): ${o.choices
              .map((c) => `${c.id}=${c.name}${c.price ? ` +${c.price}` : ''}`)
              .join(', ')}`,
        ),
      ].join('\n'),
    )
    .join('\n');
}

/** "<id> · Haircut · 45 min · EGP 200": the catalog as the agent reads it, one item per line. */
export function catalogLines(
  all: BookingItem[],
  /** Where each place is (R92), for an item done at one. */
  places: ReadonlyMap<string, string> = new Map(),
): string | null {
  const items = all.filter(isBooked);
  if (items.length === 0) return null;
  return items
    .map((i) =>
      [
        i.id,
        i.name,
        i.unit === 'minutes' ? `${i.minutes} min` : 'per day',
        i.price ? `${i.price.currency} ${i.price.value}` : 'free',
        ...(i.placeId && places.get(i.placeId) ? [`at ${places.get(i.placeId)}`] : []),
      ].join(' · '),
    )
    .join('\n');
}
