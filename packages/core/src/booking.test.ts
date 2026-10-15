import { describe, expect, it } from 'vitest';
import {
  type BookingHours,
  type BookingItem,
  type Busy,
  bookableItems,
  bookingPrice,
  bookingSpan,
  canBook,
  describeHours,
  hoursFor,
  isBooked,
  isOrdered,
  lineKey,
  openSlots,
  orderableMax,
  orderSummary,
  piecePrice,
  placeOrder,
  stockLine,
} from './booking';
import type { Sphere } from './taxonomy';

const cairo: BookingHours = {
  timeZone: 'Africa/Cairo',
  slotMinutes: 30,
  // Sunday to Thursday 9:00–12:00, Saturday 9:00–10:00 (Cairo, UTC+3 in October 2026).
  days: [
    ...[0, 1, 2, 3, 4].map((weekday) => ({ weekday, start: '09:00', end: '12:00' })),
    { weekday: 6, start: '09:00', end: '10:00' },
  ],
  leadMinutes: 120,
  horizonDays: 14,
};

describe('a branch’s own days (R92)', () => {
  const MAADI = '7f0c2c1e-1b6a-4c55-9a51-3d8e1a2b4c5d';
  const branched: BookingHours = {
    ...cairo,
    // The Maadi branch opens on Friday afternoons only.
    placeHours: [{ placeId: MAADI, days: [{ weekday: 5, start: '14:00', end: '15:00' }] }],
  };
  const now = new Date('2026-10-01T05:00:00Z');
  const window = { from: now, to: new Date('2026-10-03T00:00:00Z'), now, busy: [] };

  it('books an item done at a branch on that branch’s days', () => {
    const atMaadi = { unit: 'minutes' as const, minutes: 30 as const, capacity: 1, placeId: MAADI };
    expect(openSlots(branched, { ...window, item: atMaadi }).map((d) => d.toISOString())).toEqual([
      '2026-10-02T11:00:00.000Z',
      '2026-10-02T11:30:00.000Z',
    ]);
    expect(hoursFor(branched, atMaadi).days).toEqual([
      { weekday: 5, start: '14:00', end: '15:00' },
    ]);
  });

  it('books anything else, and an item at a place with no days of its own, on the host’s', () => {
    const anywhere = { unit: 'minutes' as const, minutes: 30 as const, capacity: 1, placeId: null };
    const elsewhere = { ...anywhere, placeId: '0e5b3d2a-9c41-4f7e-8a6d-1b2c3d4e5f60' };
    const thursday = openSlots(cairo, { ...window, item: anywhere }).map((d) => d.toISOString());
    expect(openSlots(branched, { ...window, item: anywhere }).map((d) => d.toISOString())).toEqual(
      thursday,
    );
    expect(openSlots(branched, { ...window, item: elsewhere }).map((d) => d.toISOString())).toEqual(
      thursday,
    );
  });
});

describe('open slots (R51)', () => {
  it('cuts each day’s hours into slots in the organization’s zone, within the window', () => {
    // Thursday 1 October 2026, 05:00 UTC (08:00 in Cairo): the day's slots start at 09:00.
    const now = new Date('2026-10-01T05:00:00Z');
    const slots = openSlots(cairo, {
      from: now,
      to: new Date('2026-10-02T00:00:00Z'),
      now,
      busy: [],
    });
    expect(slots.map((d) => d.toISOString())).toEqual([
      '2026-10-01T07:00:00.000Z',
      '2026-10-01T07:30:00.000Z',
      '2026-10-01T08:00:00.000Z',
      '2026-10-01T08:30:00.000Z',
    ]);
    // With a two-hour lead from 08:00, the first is 10:00; the last starts at 11:30 and ends at
    // the day's end; none at 12:00.
    // Friday has no hours; Saturday has one hour: two slots.
    const weekend = openSlots(cairo, {
      from: new Date('2026-10-02T00:00:00Z'),
      to: new Date('2026-10-04T00:00:00Z'),
      now,
      busy: [],
    });
    expect(weekend.map((d) => d.toISOString())).toEqual([
      '2026-10-03T06:00:00.000Z',
      '2026-10-03T06:30:00.000Z',
    ]);
  });

  it('keeps the lead time, the horizon and the limit, and skips what’s busy', () => {
    const now = new Date('2026-10-01T06:30:00Z'); // 09:30 in Cairo: with a two-hour lead, 11:30 is first.
    const today = openSlots(cairo, {
      from: now,
      to: new Date('2026-10-02T00:00:00Z'),
      now,
      busy: [],
    });
    expect(today.map((d) => d.toISOString())).toEqual(['2026-10-01T08:30:00.000Z']);
    // Busy from 11:15 to 11:45 (Cairo) takes the 11:30 slot.
    expect(
      openSlots(cairo, {
        from: now,
        to: new Date('2026-10-02T00:00:00Z'),
        now,
        busy: [{ start: new Date('2026-10-01T08:15:00Z'), end: new Date('2026-10-01T08:45:00Z') }],
      }),
    ).toEqual([]);
    // Nothing past the horizon, however far the window reaches.
    const far = openSlots(cairo, {
      from: new Date('2026-10-20T00:00:00Z'),
      to: new Date('2026-11-01T00:00:00Z'),
      now,
      busy: [],
    });
    expect(far).toEqual([]);
    // At most `limit`, soonest first.
    const few = openSlots(cairo, {
      from: now,
      to: new Date('2026-10-10T00:00:00Z'),
      now,
      busy: [],
      limit: 3,
    });
    expect(few).toHaveLength(3);
    expect(few[0]?.toISOString()).toBe('2026-10-01T08:30:00.000Z');
    // No days, no slots.
    expect(
      openSlots(
        { ...cairo, days: [] },
        { from: now, to: new Date('2026-10-10T00:00:00Z'), now, busy: [] },
      ),
    ).toEqual([]);
  });

  it('says the hours as a page does', () => {
    expect(describeHours(cairo)).toBe('Sun–Thu 9:00–12:00, Sat 9:00–10:00 · 30 min');
    // In the host's own week (R76): Saturday first in Egypt, so Saturday leads and a week worked
    // across the Sunday boundary reads as one run.
    expect(describeHours(cairo, 6)).toBe('Sat 9:00–10:00, Sun–Thu 9:00–12:00 · 30 min');
    expect(
      describeHours(
        {
          ...cairo,
          days: [6, 0, 1, 2, 3].map((weekday) => ({ weekday, start: '09:00', end: '17:00' })),
        },
        6,
      ),
    ).toBe('Sat–Wed 9:00–17:00 · 30 min');
    expect(
      describeHours({
        ...cairo,
        slotMinutes: 60,
        days: [
          { weekday: 1, start: '10:00', end: '18:00' },
          { weekday: 3, start: '10:00', end: '18:00' },
        ],
      }),
    ).toBe('Mon, Wed 10:00–18:00 · 60 min');
  });
});

describe('catalog items (R58)', () => {
  const now = new Date('2026-10-01T05:00:00Z'); // 08:00 Cairo, Thursday; hours 09:00–12:00.
  const window = { from: now, to: new Date('2026-10-02T00:00:00Z'), now };
  const noLead = { ...cairo, leadMinutes: 0 };
  const haircut = { unit: 'minutes' as const, minutes: 45 as const, capacity: 2 };

  it('cuts slots on the grid with the item’s own length, ending by the day’s end', () => {
    const slots = openSlots(noLead, { ...window, busy: [], item: haircut });
    // 09:00, 09:30, … 11:00 Cairo (06:00 UTC on) ends by 12:00; 11:30 would end 12:15.
    expect(slots.map((d) => d.toISOString().slice(11, 16))).toEqual([
      '06:00',
      '06:30',
      '07:00',
      '07:30',
      '08:00',
    ]);
  });

  it('is full only when the capacity is: two chairs take two bookings, a want of two takes both', () => {
    const at = (hhmm: string) => new Date(`2026-10-01T${hhmm}:00Z`);
    const one: Busy[] = [{ start: at('07:00'), end: at('07:45') }];
    const open = (busy: typeof one, quantity = 1) =>
      openSlots(noLead, { ...window, busy, item: haircut, quantity }).map((d) =>
        d.toISOString().slice(11, 16),
      );
    expect(open(one)).toContain('07:00');
    expect(open(one, 2)).not.toContain('07:00');
    expect(open([...one, ...one])).not.toContain('07:00');
    // A host's own meeting blocks the whole time, whatever the capacity.
    expect(open([{ start: at('07:00'), end: at('07:30'), units: Infinity }])).not.toContain(
      '07:00',
    );
    expect(open([{ start: at('07:00'), end: at('07:30'), units: Infinity }])).toContain('07:30');
  });

  it('a named provider does one thing at a time, whatever the item’s capacity', () => {
    const at = (hhmm: string) => new Date(`2026-10-01T${hhmm}:00Z`);
    const slots = openSlots(noLead, {
      ...window,
      busy: [],
      item: haircut,
      providersBusy: [
        [{ start: at('07:00'), end: at('07:45') }],
        [{ start: at('07:00'), end: at('09:00') }],
      ],
    }).map((d) => d.toISOString().slice(11, 16));
    // 06:30 would run into both; 07:00 and 07:30 too; at 08:00 the first is free again.
    expect(slots).toEqual(['06:00', '08:00']);
  });

  it('a shared resource (R58) is full when every item using it has taken its places', () => {
    const at = (hhmm: string) => new Date(`2026-10-01T${hhmm}:00Z`);
    const open = (resourceBusy: Busy[], capacity = 2, quantity = 1) =>
      openSlots(noLead, {
        ...window,
        // The haircut's own bookings: none; the colour, beside it, holds the chairs.
        busy: [],
        item: haircut,
        quantity,
        resource: { capacity, busy: resourceBusy },
      }).map((d) => d.toISOString().slice(11, 16));
    const colour: Busy = { start: at('07:00'), end: at('08:00'), units: 1 };
    // Two chairs: one taken by a colour leaves one for a haircut at 07:00, not two.
    expect(open([colour])).toContain('07:00');
    expect(open([colour], 2, 2)).not.toContain('07:00');
    // Both taken: no haircut until the colours are done, whatever the haircut's own capacity.
    expect(open([colour, colour])).not.toContain('07:00');
    expect(open([colour, colour])).not.toContain('07:30');
    expect(open([colour, colour])).toContain('08:00');
    // One chair alone is full with one: a haircut at 06:30 would run into the colour too.
    expect(open([colour], 1)).not.toContain('06:30');
    expect(open([colour], 1)).toContain('08:00');
  });

  it('a stay is one slot a day at opening, checked a night at a time', () => {
    const room = { unit: 'days' as const, minutes: null, capacity: 2 };
    const wide = { from: now, to: new Date('2026-10-08T00:00:00Z'), now };
    const days = openSlots(noLead, { ...wide, busy: [], item: room }).map((d) => d.toISOString());
    // Thursday, then Saturday (Friday has no hours), Sunday to Thursday: at 09:00 Cairo.
    expect(days[0]).toBe('2026-10-01T06:00:00.000Z');
    expect(days[1]).toBe('2026-10-03T06:00:00.000Z');
    // Both rooms taken on the night of the 3rd: a two-night stay from the 3rd is out, from the
    // 4th is in; a one-night stay from the 1st is in.
    const taken = (d: string) => ({
      start: new Date(`2026-10-0${d}T06:00:00Z`),
      end: new Date(`2026-10-0${Number(d) + 1}T06:00:00Z`),
    });
    const two = openSlots(noLead, {
      ...wide,
      busy: [taken('3'), taken('3')],
      item: room,
      quantity: 2,
    }).map((d) => d.toISOString().slice(0, 10));
    expect(two).not.toContain('2026-10-03');
    expect(two).not.toContain('2026-10-02');
    expect(two).toContain('2026-10-04');
    expect(two).toContain('2026-10-01');
  });

  it('bookingSpan, canBook, bookableItems and bookingPrice', () => {
    const start = new Date('2026-10-01T07:00:00Z');
    expect(bookingSpan(cairo, haircut, 1, start).toISOString()).toBe('2026-10-01T07:45:00.000Z');
    expect(bookingSpan(cairo, null, 1, start).toISOString()).toBe('2026-10-01T07:30:00.000Z');
    expect(bookingSpan(cairo, { unit: 'days', minutes: null }, 3, start).toISOString()).toBe(
      '2026-10-04T07:00:00.000Z',
    );
    const stranger = { isConnected: false, spheres: [] as Sphere[] };
    const friend = { isConnected: true, spheres: ['friend'] as Sphere[] };
    expect(canBook('public', stranger)).toBe(true);
    expect(canBook('connections', stranger)).toBe(false);
    expect(canBook('connections', friend)).toBe(true);
    expect(canBook(['family'], friend)).toBe(false);
    expect(canBook(['family', 'friend'], friend)).toBe(true);
    expect(canBook(['family'], { ...stranger, isSelf: true })).toBe(true);
    const item = (id: string, audience: BookingItem['audience'], price: BookingItem['price']) => ({
      id,
      name: id,
      price,
      unit: 'minutes' as const,
      minutes: 30 as const,
      capacity: 1,
      maxQuantity: 1,
      audience,
      providers: null,
      askTopic: false,
      slug: id,
      description: null,
      collectionId: null,
    });
    const items = [
      item('a', 'public', { value: 200, currency: 'EGP' }),
      item('b', 'connections', null),
      item('c', ['friend'], null),
    ];
    expect(bookableItems(items, stranger).map((i) => i.id)).toEqual(['a']);
    expect(bookableItems(items, friend).map((i) => i.id)).toEqual(['a', 'b', 'c']);
    // A minor sees no paid item.
    expect(bookableItems(items, friend, { adult: false }).map((i) => i.id)).toEqual(['b', 'c']);
    expect(bookingPrice(items[0] as BookingItem, 3)).toEqual({ value: 600, currency: 'EGP' });
    expect(bookingPrice(items[1] as BookingItem, 3)).toBeNull();
  });
});

describe('orders from the catalog (R60)', () => {
  const item = (id: string, patch: Partial<BookingItem> = {}): BookingItem => ({
    id,
    name: id,
    price: { value: 50, currency: 'EGP' },
    unit: 'each',
    minutes: null,
    capacity: 1,
    maxQuantity: 5,
    audience: 'public',
    providers: null,
    askTopic: false,
    slug: id,
    description: null,
    collectionId: null,
    ...patch,
  });
  const menu = [
    item('shawarma', { price: { value: 85.5, currency: 'EGP' } }),
    item('fries', { maxQuantity: 2 }),
    item('water', { price: null }),
    item('haircut', { unit: 'minutes', minutes: 45 }),
  ];
  const settings = {
    fulfilment: ['pickup', 'delivery'] as Array<'pickup' | 'delivery'>,
    note: null,
  };

  it('fixes the lines and the total, merging repeats; the first way is the default', () => {
    const placed = placeOrder(settings, menu, {
      lines: [
        { itemId: 'shawarma', quantity: 2 },
        { itemId: 'fries', quantity: 1 },
        { itemId: 'water', quantity: 3 },
        { itemId: 'shawarma', quantity: 1 },
      ],
    });
    if (!placed.ok) throw new Error(placed.reason);
    expect(placed.order.lines).toEqual([
      {
        itemId: 'shawarma',
        name: 'shawarma',
        quantity: 3,
        price: { value: 256.5, currency: 'EGP' },
      },
      { itemId: 'fries', name: 'fries', quantity: 1, price: { value: 50, currency: 'EGP' } },
      { itemId: 'water', name: 'water', quantity: 3, price: null },
    ]);
    expect(placed.order.total).toEqual({ value: 306.5, currency: 'EGP' });
    expect(placed.order.fulfilment).toBe('pickup');
    expect(orderSummary(placed.order)).toBe('3 × shawarma, 1 × fries, 3 × water');
  });

  it('keeps a delivery address for a delivery alone, copied as a line (R92)', () => {
    const lines = [{ itemId: 'shawarma', quantity: 1 }];
    const delivered = placeOrder(settings, menu, {
      lines,
      fulfilment: 'delivery',
      deliverTo: '  Floor 3, 9 Road 233, Maadi, Cairo, Egypt  ',
    });
    if (!delivered.ok) throw new Error(delivered.reason);
    expect(delivered.order.deliverTo).toBe('Floor 3, 9 Road 233, Maadi, Cairo, Egypt');
    const pickedUp = placeOrder(settings, menu, {
      lines,
      fulfilment: 'pickup',
      deliverTo: 'Somewhere',
    });
    if (!pickedUp.ok) throw new Error(pickedUp.reason);
    expect(pickedUp.order.deliverTo).toBeUndefined();
  });

  it('takes no more than is left (R60): a count limits an order, none is sold out', () => {
    const counted = [item('fries', { maxQuantity: 5, stock: 2 }), item('shawarma', { stock: 0 })];
    expect(orderableMax(counted[0] as BookingItem)).toBe(2);
    expect(orderableMax(item('fries', { maxQuantity: 5 }))).toBe(5);
    expect(orderableMax(item('fries', { maxQuantity: 3, stock: 40 }))).toBe(3);
    expect(placeOrder(settings, counted, { lines: [{ itemId: 'fries', quantity: 2 }] }).ok).toBe(
      true,
    );
    expect(
      placeOrder(settings, counted, { lines: [{ itemId: 'fries', quantity: 3 }] }),
    ).toMatchObject({ ok: false, reason: 'stock', max: 2, name: 'fries' });
    expect(
      placeOrder(settings, counted, { lines: [{ itemId: 'shawarma', quantity: 1 }] }),
    ).toMatchObject({ ok: false, reason: 'stock', max: 0 });
    expect(stockLine(undefined)).toBeNull();
    expect(stockLine(0)).toBe('Sold out');
    expect(stockLine(1)).toBe('Only one left');
    expect(stockLine(3)).toBe('Only 3 left');
    expect(stockLine(12, true)).toBe('12 in stock');
    expect(stockLine(0, true)).toBe('Sold out');
  });

  it('takes options (R60): one of a size, any extras, priced per piece, a line per set', () => {
    const coffee = item('coffee', {
      price: { value: 40, currency: 'EGP' },
      maxQuantity: 5,
      options: [
        {
          id: 'size',
          name: 'Size',
          pick: 'one',
          required: true,
          choices: [
            { id: 's', name: 'Small', price: null },
            { id: 'l', name: 'Large', price: 10 },
          ],
        },
        {
          id: 'extra',
          name: 'Extras',
          pick: 'any',
          required: false,
          choices: [
            { id: 'oat', name: 'Oat milk', price: 5 },
            { id: 'shot', name: 'Extra shot', price: 8 },
          ],
        },
      ],
    });
    const placed = placeOrder(settings, [coffee], {
      lines: [
        { itemId: 'coffee', quantity: 2, choices: ['l', 'oat'] },
        { itemId: 'coffee', quantity: 1, choices: ['s'] },
        { itemId: 'coffee', quantity: 1, choices: ['oat', 'l'] },
      ],
    });
    if (!placed.ok) throw new Error(placed.reason);
    expect(placed.order.lines).toEqual([
      {
        itemId: 'coffee',
        name: 'coffee',
        quantity: 3,
        price: { value: 165, currency: 'EGP' },
        choices: [
          { id: 'l', name: 'Large' },
          { id: 'oat', name: 'Oat milk' },
        ],
      },
      {
        itemId: 'coffee',
        name: 'coffee',
        quantity: 1,
        price: { value: 40, currency: 'EGP' },
        choices: [{ id: 's', name: 'Small' }],
      },
    ]);
    expect(placed.order.total).toEqual({ value: 205, currency: 'EGP' });
    expect(orderSummary(placed.order)).toBe('3 × coffee (Large, Oat milk), 1 × coffee (Small)');
    expect(lineKey('coffee', ['oat', 'l'])).toBe(lineKey('coffee', ['l', 'oat']));
    expect(piecePrice(coffee, ['l', 'oat', 'shot'])).toEqual({ value: 63, currency: 'EGP' });
    const no = (lines: Array<{ itemId: string; quantity: number; choices?: string[] }>) =>
      placeOrder(settings, [coffee], { lines });
    // A size is required, and one only; a choice not on it is refused.
    expect(no([{ itemId: 'coffee', quantity: 1, choices: ['oat'] }])).toMatchObject({
      ok: false,
      reason: 'choice',
      option: 'Size',
    });
    expect(no([{ itemId: 'coffee', quantity: 1, choices: ['s', 'l'] }])).toMatchObject({
      reason: 'choice',
      option: 'Size',
    });
    expect(no([{ itemId: 'coffee', quantity: 1, choices: ['l', 'nope'] }])).toMatchObject({
      reason: 'choice',
    });
    // How many of it counts over its lines, against its most and what's left.
    expect(
      no([
        { itemId: 'coffee', quantity: 3, choices: ['s'] },
        { itemId: 'coffee', quantity: 3, choices: ['l'] },
      ]),
    ).toMatchObject({ reason: 'quantity', max: 5 });
    expect(
      placeOrder(settings, [{ ...coffee, stock: 3 }], {
        lines: [
          { itemId: 'coffee', quantity: 2, choices: ['s'] },
          { itemId: 'coffee', quantity: 2, choices: ['l'] },
        ],
      }),
    ).toMatchObject({ reason: 'stock', max: 3 });
  });

  it('refuses what isn’t ordered by the piece, too many, a way not offered, or ordering off', () => {
    const one = (itemId: string, quantity = 1) => ({ lines: [{ itemId, quantity }] });
    expect(placeOrder(null, menu, one('fries'))).toMatchObject({ ok: false, reason: 'off' });
    expect(placeOrder(settings, menu, one('haircut'))).toMatchObject({ ok: false, reason: 'item' });
    expect(placeOrder(settings, menu, one('nope'))).toMatchObject({ ok: false, reason: 'item' });
    expect(placeOrder(settings, menu, one('fries', 3))).toMatchObject({
      ok: false,
      reason: 'quantity',
      max: 2,
    });
    expect(
      placeOrder({ fulfilment: ['pickup'], note: null }, menu, {
        ...one('fries'),
        fulfilment: 'delivery',
      }),
    ).toMatchObject({ ok: false, reason: 'fulfilment' });
    // Two currencies: each line keeps its price, with no total.
    const mixed = placeOrder(
      settings,
      [...menu, item('beans', { price: { value: 4, currency: 'USD' } })],
      {
        lines: [
          { itemId: 'fries', quantity: 1 },
          { itemId: 'beans', quantity: 1 },
        ],
      },
    );
    expect(mixed.ok && mixed.order.total).toBeNull();
  });

  it('an item ordered by the piece has no slots', () => {
    const now = new Date('2026-10-01T05:00:00Z');
    expect(
      openSlots(cairo, {
        from: now,
        to: new Date('2026-10-02T00:00:00Z'),
        now,
        busy: [],
        item: menu[0],
      }),
    ).toEqual([]);
    expect(isOrdered(menu[0] as BookingItem)).toBe(true);
    expect(isBooked(menu[3] as BookingItem)).toBe(true);
  });
});
