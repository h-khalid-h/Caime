import { describe, expect, it } from 'vitest';
import { isRepeat } from './repeat';
import { nextOccurrence, occurrenceAt, occurrencesBetween, seriesOf } from './series';

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
  });
});
