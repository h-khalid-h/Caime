import { describe, expect, it } from 'vitest';
import { isRepeat } from './repeat';
import {
  dayIn,
  nextOccurrence,
  occurrenceAt,
  occurrencesBetween,
  seriesOf,
  timesAYear,
} from './series';

describe('a meeting that repeats (R58)', () => {
  // Thursday 22 October 2026, 10:00 in Berlin (summer time, UTC+2).
  const berlin = { id: 's1', n: 0, firstAt: '2026-10-22T08:00:00.000Z', zone: 'Europe/Berlin' };

  it('keeps its wall-clock time when the clocks change', () => {
    // Summer time ends on 25 October: the next Thursday at 10:00 is 09:00 UTC.
    expect(occurrenceAt(berlin, 'week', 1).toISOString()).toBe('2026-10-29T09:00:00.000Z');
    expect(occurrenceAt(berlin, 'fortnight', 1).toISOString()).toBe('2026-11-05T09:00:00.000Z');
    expect(occurrenceAt(berlin, 'week', 0).toISOString()).toBe(berlin.firstAt);
  });

  it('holds a monthly one on the last day of a shorter month, and its own day after', () => {
    const s = { firstAt: '2027-01-31T08:00:00.000Z', zone: 'Africa/Cairo' };
    expect(occurrenceAt(s, 'month', 1).toISOString()).toBe('2027-02-28T08:00:00.000Z');
    expect(occurrenceAt(s, 'month', 2).toISOString()).toBe('2027-03-31T08:00:00.000Z');
    // Across a year's end.
    expect(occurrenceAt(s, 'month', 12).toISOString()).toBe('2028-01-31T08:00:00.000Z');
    expect(occurrenceAt(s, 'month', 13).toISOString()).toBe('2028-02-29T08:00:00.000Z');
  });

  it('posts the next one still to start, skipping any missed', () => {
    // The first has just ended: the second is next.
    expect(nextOccurrence(berlin, 'week', new Date('2026-10-22T09:01:00Z'))).toEqual({
      n: 1,
      at: new Date('2026-10-29T09:00:00.000Z'),
    });
    // Three weeks with nothing posted: the one still to come, not the ones gone by.
    expect(nextOccurrence(berlin, 'week', new Date('2026-11-13T12:00:00Z'))?.n).toBe(4);
    // One that's on already is gone by: the one after it.
    expect(nextOccurrence(berlin, 'week', new Date('2026-10-29T09:30:00Z'))?.n).toBe(2);
  });

  it('looks ahead within a window, after the time that was posted', () => {
    const later = { ...berlin, n: 1 };
    const ahead = occurrencesBetween(
      later,
      'week',
      new Date('2026-10-01T00:00:00Z'),
      new Date('2026-11-30T00:00:00Z'),
      10,
    );
    expect(ahead.map((o) => o.n)).toEqual([2, 3, 4, 5]);
    expect(ahead[0]?.at.toISOString()).toBe('2026-11-05T09:00:00.000Z');
    expect(
      occurrencesBetween(
        later,
        'week',
        new Date('2026-11-10T00:00:00Z'),
        new Date('2027-01-01'),
        2,
      ).map((o) => o.n),
    ).toEqual([3, 4]);
  });

  it('reads only a series that says itself properly', () => {
    expect(seriesOf({ series: berlin })).toEqual(berlin);
    expect(seriesOf({ series: { ...berlin, n: -1 } })).toBeNull();
    expect(seriesOf({ series: { ...berlin, firstAt: 'soon' } })).toBeNull();
    expect(seriesOf({})).toBeNull();
    expect(seriesOf(null)).toBeNull();
    expect(isRepeat('week')).toBe(true);
    expect(isRepeat('daily')).toBe(false);
    expect(isRepeat('workday')).toBe(true);
    // A workday series keeps its proposer's week; a week that isn't one is left out.
    const week = { ...berlin, days: [1, 2, 3, 4, 5] };
    expect(seriesOf({ series: week })).toEqual(week);
    expect(seriesOf({ series: { ...berlin, days: [9] } })).toEqual(berlin);
    expect(seriesOf({ series: { ...berlin, days: [1, 1] } })).toEqual(berlin);
  });

  it('holds a workday one on the days its proposer works', () => {
    // From Thursday 22 October in Berlin, Monday to Friday: Friday, Monday (after the clocks
    // change, still at 10:00), a week on, and two.
    const week = { ...berlin, days: [1, 2, 3, 4, 5] };
    expect(occurrenceAt(week, 'workday', 1).toISOString()).toBe('2026-10-23T08:00:00.000Z');
    expect(occurrenceAt(week, 'workday', 2).toISOString()).toBe('2026-10-26T09:00:00.000Z');
    expect(occurrenceAt(week, 'workday', 5).toISOString()).toBe('2026-10-29T09:00:00.000Z');
    expect(occurrenceAt(week, 'workday', 10).toISOString()).toBe('2026-11-05T09:00:00.000Z');
    // A series without its days: Monday to Friday.
    expect(occurrenceAt(berlin, 'workday', 2).toISOString()).toBe('2026-10-26T09:00:00.000Z');
    // Cairo works Sunday to Thursday (R76): after Thursday comes Sunday, and after a first time
    // on a Friday, the Sunday too.
    const cairo = {
      firstAt: '2026-10-22T07:00:00.000Z',
      zone: 'Africa/Cairo',
      days: [0, 1, 2, 3, 4],
    };
    expect(occurrenceAt(cairo, 'workday', 1).toISOString()).toBe('2026-10-25T07:00:00.000Z');
    const friday = { ...cairo, firstAt: '2026-10-23T07:00:00.000Z' };
    expect(occurrenceAt(friday, 'workday', 1).toISOString()).toBe('2026-10-25T07:00:00.000Z');
    // The next one after a Thursday's has ended is Sunday's.
    expect(
      nextOccurrence({ ...cairo, id: 'c', n: 0 }, 'workday', new Date('2026-10-22T08:01:00Z'))?.at,
    ).toEqual(new Date('2026-10-25T07:00:00.000Z'));
  });

  it('ends on its last day, read on its own clock', () => {
    // Weekly from 22 October: 29 October, 5, 12 and 19 November.
    expect(nextOccurrence(berlin, 'week', new Date('2026-11-01T00:00:00Z'), '2026-11-06')?.n).toBe(
      2,
    );
    expect(
      nextOccurrence(berlin, 'week', new Date('2026-11-06T00:00:00Z'), '2026-11-06'),
    ).toBeNull();
    // The last day itself is held.
    expect(nextOccurrence(berlin, 'week', new Date('2026-11-01T00:00:00Z'), '2026-11-05')?.n).toBe(
      2,
    );
    const ahead = occurrencesBetween(
      berlin,
      'week',
      new Date('2026-10-22T00:00:00Z'),
      new Date('2027-01-01T00:00:00Z'),
      53,
      '2026-11-12',
    );
    expect(ahead.map((a) => a.n)).toEqual([1, 2, 3]);
    // 23:30 in Cairo on the 5th is already the 6th in Dubai, and still the 5th there.
    expect(dayIn(new Date('2026-11-05T21:30:00Z'), 'Africa/Cairo')).toBe('2026-11-05');
    expect(dayIn(new Date('2026-11-05T21:30:00Z'), 'Asia/Dubai')).toBe('2026-11-06');
  });

  it('looks a year ahead at most, by how often it holds', () => {
    expect(timesAYear('week')).toBe(53);
    expect(timesAYear('month')).toBe(13);
    expect(timesAYear('workday')).toBe(265);
    expect(timesAYear('workday', [0, 1, 2, 3, 4, 6])).toBe(318);
  });
});
