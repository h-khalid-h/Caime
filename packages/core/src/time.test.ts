import { describe, expect, it } from 'vitest';
import { firstWorkday, weekOrder, zonedParts, zonedTimeToUtc } from './time';

const at = (iso: string) => new Date(iso).toISOString();

describe('a local time, as an instant where it happens', () => {
  it('on an ordinary day, by the offset of that day', () => {
    expect(
      zonedTimeToUtc({ year: 2026, month: 9, day: 28, hour: 9 }, 'Africa/Cairo').toISOString(),
    ).toBe(at('2026-09-28T06:00:00Z'));
    expect(
      zonedTimeToUtc(
        { year: 2027, month: 1, day: 5, hour: 9, minute: 30 },
        'America/New_York',
      ).toISOString(),
    ).toBe(at('2027-01-05T14:30:00Z'));
    expect(
      zonedTimeToUtc({ year: 2026, month: 9, day: 28, hour: 0 }, 'Asia/Kolkata').toISOString(),
    ).toBe(at('2026-09-27T18:30:00Z'));
  });

  it('that never happens (clocks going forward), as far past the gap as it was into it', () => {
    // New York, 14 March 2027: 02:00 EST becomes 03:00 EDT.
    const ny = zonedTimeToUtc(
      { year: 2027, month: 3, day: 14, hour: 2, minute: 30 },
      'America/New_York',
    );
    expect(ny.toISOString()).toBe(at('2027-03-14T07:30:00Z'));
    expect(zonedParts(ny, 'America/New_York')).toMatchObject({ day: 14, hour: 3, minute: 30 });
    // Santiago, 6 September 2026: midnight becomes 01:00, so 00:30 is Sunday's 01:30, never Saturday.
    const scl = zonedTimeToUtc(
      { year: 2026, month: 9, day: 6, hour: 0, minute: 30 },
      'America/Santiago',
    );
    expect(zonedParts(scl, 'America/Santiago')).toMatchObject({ day: 6, hour: 1, minute: 30 });
    // Berlin, 28 March 2027: 02:00 CET becomes 03:00 CEST.
    const ber = zonedTimeToUtc(
      { year: 2027, month: 3, day: 28, hour: 2, minute: 30 },
      'Europe/Berlin',
    );
    expect(ber.toISOString()).toBe(at('2027-03-28T01:30:00Z'));
  });

  it('that happens twice (clocks going back), the first time', () => {
    // New York, 7 November 2027: 01:30 is first EDT, then EST.
    const ny = zonedTimeToUtc(
      { year: 2027, month: 11, day: 7, hour: 1, minute: 30 },
      'America/New_York',
    );
    expect(ny.toISOString()).toBe(at('2027-11-07T05:30:00Z'));
    // Just after the change, only one reading is left.
    expect(
      zonedTimeToUtc(
        { year: 2027, month: 11, day: 7, hour: 2, minute: 30 },
        'America/New_York',
      ).toISOString(),
    ).toBe(at('2027-11-07T07:30:00Z'));
  });
});

describe('a week (R76)', () => {
  it('runs from its first day, and work starts on the first day worked', () => {
    expect(weekOrder(6)).toEqual([6, 0, 1, 2, 3, 4, 5]);
    expect(weekOrder(1)).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(weekOrder(0)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    // Egypt works Sunday to Thursday, France Monday to Friday, Afghanistan Saturday to Wednesday.
    expect(firstWorkday([0, 1, 2, 3, 4])).toBe(0);
    expect(firstWorkday([1, 2, 3, 4, 5])).toBe(1);
    expect(firstWorkday([6, 0, 1, 2, 3])).toBe(6);
    // Nepal works Sunday to Friday; a six-day week with Sunday off starts on Monday.
    expect(firstWorkday([0, 1, 2, 3, 4, 5])).toBe(0);
    expect(firstWorkday([1, 2, 3, 4, 5, 6])).toBe(1);
    expect(firstWorkday([])).toBe(1);
  });
});
