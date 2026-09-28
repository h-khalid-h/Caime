import { describe, expect, it } from 'vitest';
import { dateOf, dayOf, formatDay, yearsBefore } from './dates';

describe('days, as the date fields keep them', () => {
  it('are the day wherever the device is, and only real days', () => {
    expect(dayOf(new Date(1990, 11, 31, 23, 59))).toBe('1990-12-31');
    expect(dayOf(new Date(2024, 1, 29, 0, 1))).toBe('2024-02-29');
    const noon = dateOf('1990-12-31');
    expect(noon && [noon.getFullYear(), noon.getMonth(), noon.getDate(), noon.getHours()]).toEqual([
      1990, 11, 31, 12,
    ]);
    expect(dayOf(dateOf('2024-02-29') as Date)).toBe('2024-02-29');
    for (const bad of ['2023-02-29', '1990-13-01', '1990-00-10', '1990-1-1', '', null, undefined])
      expect(dateOf(bad)).toBeNull();
  });

  it('count years back to the same day, or the last of February', () => {
    expect(yearsBefore('2026-09-28', 120)).toBe('1906-09-28');
    expect(yearsBefore('2028-02-29', 1)).toBe('2027-02-28');
    expect(yearsBefore('2028-02-29', 4)).toBe('2024-02-29');
  });

  it('read as the person’s language writes them', () => {
    expect(formatDay('1990-03-15', 'en-GB')).toBe('15 March 1990');
    expect(formatDay('1990-03-15', 'en-US')).toBe('March 15, 1990');
    expect(formatDay('1990-03-15', 'de')).toBe('15. März 1990');
    // The day it is, never the day before where the clock is behind UTC.
    expect(formatDay('1990-01-01', 'en-US')).toBe('January 1, 1990');
    expect(formatDay('not a day', 'en')).toBe('not a day');
  });
});
