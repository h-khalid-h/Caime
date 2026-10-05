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
  openSlots,
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
