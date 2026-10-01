import { describe, expect, it } from 'vitest';
import { type BookingHours, describeHours, openSlots } from './booking';

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
