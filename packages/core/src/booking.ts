/**
 * Bookings (R51, R58): a host's bookable hours, the catalog of what can be booked in them, and
 * the open slots for one item. A host is an organization or a person; the shape is one. Pure:
 * the server works out the slots (taking out what's booked) and the app shows them; nothing
 * here touches a clock or a store. Times are the host's own, in its time zone; a slot is an
 * instant, so a booker anywhere sees it in theirs.
 */
import { msg, tr, trn } from './i18n';
import type { Sphere } from './taxonomy';
import { addDays, weekOrder, zonedParts, zonedTimeToUtc } from './time';

export const SLOT_MINUTES = [15, 20, 30, 45, 60, 90, 120] as const;
export type SlotMinutes = (typeof SLOT_MINUTES)[number];

/** How far ahead a customer may book, at most, and how soon. */
export const BOOKING_HORIZON_DAYS_MAX = 90;
export const BOOKING_LEAD_MINUTES_MAX = 7 * 24 * 60;

/** A catalog holds at most this many items; an item is taken by at most this many at once. */
export const BOOKING_ITEMS_MAX = 50;
export const BOOKING_CAPACITY_MAX = 100;
/**
 * Shared resources a host keeps (R58): chairs, rooms, a table. Seven, so an item's choice of one,
 * with "Nothing shared" beside them, stays within a row of eight chips (R77).
 */
export const RESOURCES_MAX = 7;
/** A stay of at most this many days, in one booking. */
export const BOOKING_DAYS_MAX = 30;
/** A count of stock (R60) is at most this. */
export const STOCK_MAX = 100_000;

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
  /** What several items share (R58), each with how many there are. */
  resources?: SharedResource[];
  /**
   * A branch's own days (R92): an item done at one of the host's places is booked on that
   * place's days, and on the host's where the place has none.
   */
  placeHours?: PlaceHours[];
}

/**
 * A branch of the host's (R92): its own weekdays and their ranges (none: the host's), and the
 * people of the team who work there (none: whoever does the item).
 */
export interface PlaceHours {
  placeId: string;
  days: BookingDay[];
  staff?: string[] | null;
}

/** The branch an item is done at, as the hours keep it, if they keep anything of it. */
function branchOf(
  hours: Pick<BookingHours, 'placeHours'> | null | undefined,
  item: Pick<BookingItem, 'placeId'> | null | undefined,
): PlaceHours | undefined {
  return item?.placeId ? hours?.placeHours?.find((p) => p.placeId === item.placeId) : undefined;
}

/** The hours an item is booked by (R92): its place's days when the place has its own. */
export function hoursFor(
  hours: BookingHours,
  item: Pick<BookingItem, 'placeId'> | null | undefined,
): BookingHours {
  const own = branchOf(hours, item);
  return own?.days.length ? { ...hours, days: own.days } : hours;
}

/**
 * Who on the team may do an item (R58, R92): the people the item names, else the people of the
 * branch it's done at, else null (anyone on the team). Every reader of an item's providers
 * (the slots, who's picked, the reassign route) asks here.
 */
export function providersFor(
  hours: Pick<BookingHours, 'placeHours'> | null | undefined,
  item: Pick<BookingItem, 'placeId' | 'providers'> | null | undefined,
): string[] | null {
  if (item?.providers?.length) return item.providers;
  const staff = branchOf(hours, item)?.staff;
  return staff?.length ? staff : null;
}

/**
 * Something several of a host's items share (R58): three chairs for a haircut and a colour, two
 * rooms for two kinds of stay. A time is open for an item that uses one only while there's room
 * in it beside every booking of every item that uses it, as well as in the item's own capacity.
 */
export interface SharedResource {
  id: string;
  name: string;
  capacity: number;
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

/** An item's options (R60): at most this many, each with at most this many choices. */
export const ITEM_OPTIONS_MAX = 5;
export const OPTION_CHOICES_MAX = 12;

/** One way an item can be had (R60): a size, a milk, an extra; its price is added to the item's. */
export interface ItemChoice {
  id: string;
  name: string;
  /** Added to the item's price, each; null adds nothing. Only an item with a price has these. */
  price: number | null;
}

/**
 * An option on something sold by the piece (R60): one of its choices ("Size": Small, Large), or
 * any of them ("Extras": Cheese, Olives); a required one must be chosen in every order of it.
 */
export interface ItemOption {
  id: string;
  name: string;
  pick: 'one' | 'any';
  required: boolean;
  choices: ItemChoice[];
}

/**
 * One line of an order as asked: an item of the catalog, how many, and its choices by id (R60);
 * the same item with other choices is a line of its own.
 */
export interface OrderAsk {
  lines: Array<{ itemId: string; quantity: number; choices?: string[] }>;
  fulfilment?: 'pickup' | 'delivery' | null;
  /** Where to deliver it (R92): one of the customer's places as a line, for a delivery. */
  deliverTo?: string | null;
}

/** What an Order card keeps of what was ordered (`payload.order`), fixed when it was placed. */
export interface PlacedOrder {
  lines: Array<{
    itemId: string;
    name: string;
    quantity: number;
    /** The line's price (each, choices included, times the quantity), as it was then. */
    price: { value: number; currency: string } | null;
    /** What was chosen of its options (R60), as they were named then; none without options. */
    choices?: Array<{ id: string; name: string }>;
  }>;
  /** The whole order's, where every priced line is in one currency; else null. */
  total: { value: number; currency: string } | null;
  fulfilment: 'pickup' | 'delivery' | null;
  /** Where it's delivered (R92), copied from the customer's place when it was placed. */
  deliverTo?: string | null;
}

/**
 * How many of an item one order may take (R60): its own most, or fewer when fewer are left.
 * Zero is sold out.
 */
export function orderableMax(item: Pick<BookingItem, 'maxQuantity' | 'stock'>): number {
  return item.stock === undefined ? item.maxQuantity : Math.min(item.maxQuantity, item.stock);
}

/**
 * A count as its reader sees it (R60), or nothing where none is shown: "Sold out", and for a
 * customer "Only 2 left" (they see a count only once it limits their order), for its host
 * "12 in stock".
 */
export function stockLine(stock: number | undefined, forHost = false): string | null {
  if (stock === undefined) return null;
  if (stock === 0) return tr('Sold out');
  return forHost
    ? trn(stock, 'One in stock', '{n} in stock')
    : trn(stock, 'Only one left', 'Only {n} left');
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
  | {
      ok: false;
      reason: 'off' | 'item' | 'quantity' | 'stock' | 'choice' | 'fulfilment' | 'empty';
      max?: number;
      name?: string;
      /** With `choice`: the option that wasn't chosen as it asks. */
      option?: string;
    } {
  if (!settings) return { ok: false, reason: 'off' };
  // One line per item and set of choices; a repeat adds to its line.
  const merged = new Map<string, { itemId: string; choices: string[]; quantity: number }>();
  for (const l of ask.lines) {
    const choices = [...new Set(l.choices ?? [])].sort();
    const key = lineKey(l.itemId, choices);
    const at = merged.get(key);
    merged.set(key, { itemId: l.itemId, choices, quantity: (at?.quantity ?? 0) + l.quantity });
  }
  if (merged.size === 0) return { ok: false, reason: 'empty' };
  const lines: PlacedOrder['lines'] = [];
  const perItem = new Map<string, number>();
  for (const { itemId, choices, quantity } of merged.values()) {
    const item = items.find((i) => i.id === itemId);
    if (!item || !isOrdered(item)) return { ok: false, reason: 'item' };
    if (quantity < 1) return { ok: false, reason: 'quantity', max: item.maxQuantity };
    const chosen = chosenOf(item, choices);
    if (!chosen.ok) return { ok: false, reason: 'choice', name: item.name, option: chosen.option };
    perItem.set(itemId, (perItem.get(itemId) ?? 0) + quantity);
    const each = piecePrice(item, choices);
    lines.push({
      itemId,
      name: item.name,
      quantity,
      price: each ? { value: round2(each.value * quantity), currency: each.currency } : null,
      ...(chosen.choices.length ? { choices: chosen.choices } : {}),
    });
  }
  // How many of an item, over its lines: within its most, and within what's left (R60).
  for (const [itemId, quantity] of perItem) {
    const item = items.find((i) => i.id === itemId) as BookingItem;
    if (quantity > item.maxQuantity)
      return { ok: false, reason: 'quantity', max: item.maxQuantity };
    // Fewer left than asked: the reader hears how many, as the picker showed them.
    if (quantity > orderableMax(item))
      return { ok: false, reason: 'stock', max: orderableMax(item), name: item.name };
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
  // An address is said for a delivery alone, and copied: the place may change after.
  const deliverTo = fulfilment === 'delivery' ? ask.deliverTo?.trim() || null : null;
  return { ok: true, order: { lines, total, fulfilment, ...(deliverTo ? { deliverTo } : {}) } };
}

/** "2 × Coffee (Large, Oat milk), 1 × Fries": an order in one line, for the card's summary. */
export function orderSummary(order: Pick<PlacedOrder, 'lines'>): string {
  return order.lines
    .map(
      (l) =>
        `${l.quantity} × ${l.name}${l.choices?.length ? ` (${l.choices.map((c) => c.name).join(', ')})` : ''}`,
    )
    .join(', ');
}

/** A line's identity in an order (R60): its item and its choices, in one order. */
export function lineKey(itemId: string, choices: readonly string[] = []): string {
  return choices.length ? `${itemId}|${[...choices].sort().join(',')}` : itemId;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** One piece's price with these choices: the item's, plus each choice's (R60); null for free. */
export function piecePrice(
  item: Pick<BookingItem, 'price' | 'options'>,
  choices: readonly string[] = [],
): { value: number; currency: string } | null {
  if (!item.price) return null;
  const all = (item.options ?? []).flatMap((o) => o.choices);
  const extra = choices.reduce((sum, id) => sum + (all.find((c) => c.id === id)?.price ?? 0), 0);
  return { value: round2(item.price.value + extra), currency: item.price.currency };
}

/**
 * The choices as an item's options ask (R60): each a choice of one of them, one at most where an
 * option picks one, one at least where it's required. What was chosen, named, in option order;
 * else the first option not chosen as it asks.
 */
export function chosenOf(
  item: Pick<BookingItem, 'options'>,
  choices: readonly string[],
): { ok: true; choices: Array<{ id: string; name: string }> } | { ok: false; option: string } {
  const options = item.options ?? [];
  const known = new Set(options.flatMap((o) => o.choices.map((c) => c.id)));
  const stray = choices.find((id) => !known.has(id));
  if (stray !== undefined) return { ok: false, option: options[0]?.name ?? '' };
  const named: Array<{ id: string; name: string }> = [];
  for (const o of options) {
    const picked = o.choices.filter((c) => choices.includes(c.id));
    if ((o.pick === 'one' && picked.length > 1) || (o.required && picked.length === 0))
      return { ok: false, option: o.name };
    named.push(...picked.map((c) => ({ id: c.id, name: c.name })));
  }
  return { ok: true, choices: named };
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
  /** The shared resource it takes one of per place (R58), or none. */
  resourceId?: string | null;
  /** Its photo (R63): an image the host uploaded, shown with it wherever it is. */
  photoFileId?: string | null;
  /** Its options (R60), for something sold by the piece: a size to choose, extras to add. */
  options?: ItemOption[];
  /**
   * Where it's done (R92): one of an organization's places, its customers' or everyone's; its
   * days are that place's when it has its own (`hoursFor`), and a booking copies its address.
   */
  placeId?: string | null;
  /**
   * How many are left of something sold by the piece (R60), kept apart from the catalog: its
   * host reads the count, anyone else only once it's fewer than one order may take (0 is sold
   * out). Left out when it isn't counted, or doesn't limit this reader.
   */
  stock?: number;
}

/**
 * Where an item's photo is served (R63), for the app and the public pages alike; the `v` changes
 * with the photo, so a browser keeps it until then. Null without one.
 */
export function itemPhotoPath(
  host: { kind: 'org' | 'person'; id: string },
  item: Pick<BookingItem, 'id' | 'photoFileId'>,
): string | null {
  if (!item.photoFileId) return null;
  const kind = host.kind === 'org' ? 'orgs' : 'people';
  return `/v1/${kind}/${host.id}/items/${encodeURIComponent(item.id)}/photo?v=${item.photoFileId.slice(-8)}`;
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
  /** Where (R92): the item's place as it was written when booked, copied into the card. */
  where?: string | null;
  /** The branch it's at (R92), for the team to see its bookings by branch. */
  placeId?: string | null;
  /**
   * Whose catalog it's from (R96): the organization's id, or the person's. A booking from a
   * person's own catalog holds their time while the booker's message request waits.
   */
  hostId?: string;
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
  item?: Pick<BookingItem, 'unit' | 'minutes' | 'capacity' | 'placeId'> | null;
  /** Places (minutes) or days (days) wanted; 1 without. */
  quantity?: number;
  /**
   * For an item with named providers: each one's own bookings. A slot is open only while one
   * of them is free for it (a person does one thing at a time, whatever the item's capacity).
   */
  providersBusy?: Busy[][];
  /**
   * For an item that uses a shared resource (R58): how many there are, and what every item
   * using it has booked. A slot is open only while the resource has room as well.
   */
  resource?: { capacity: number; busy: Busy[] } | null;
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
export function openSlots(all: BookingHours, opts: SlotQuery): Date[] {
  const limit = opts.limit ?? 200;
  const item = opts.item ?? null;
  const hours = hoursFor(all, item);
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
    const fits = pieces.every(
      ([s, e]) =>
        roomFor(opts.busy, s ?? 0, e ?? 0, days ? 1 : want, capacity) &&
        (!opts.resource ||
          roomFor(opts.resource.busy, s ?? 0, e ?? 0, days ? 1 : want, opts.resource.capacity)),
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

/**
 * "Sun–Thu 9:00–17:00, Sat 9:00–13:00 · 30 min": how a page says the hours, the days in the
 * order the host's week runs (R76: Saturday first in Egypt, so "Sat–Wed" reads as one run).
 */
export function describeHours(hours: BookingHours, weekStart = 0): string {
  const order = weekOrder(weekStart);
  const rank = (day: number) => order.indexOf(day);
  const byRange = new Map<string, number[]>();
  for (const d of [...hours.days].sort((a, b) => rank(a.weekday) - rank(b.weekday))) {
    const key = `${d.start}–${d.end}`;
    byRange.set(key, [...(byRange.get(key) ?? []), d.weekday]);
  }
  const runs = (days: number[]): string => {
    const parts: string[] = [];
    let i = 0;
    while (i < days.length) {
      let j = i;
      while (j + 1 < days.length && rank(days[j + 1] ?? 0) === rank(days[j] ?? 0) + 1) j++;
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
