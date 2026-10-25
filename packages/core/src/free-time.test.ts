import { describe, expect, it } from 'vitest';
import { clashes, dayWindow, FREE_MIN_MS, freeGaps, mergeBusy, nextFree } from './free-time';

const H = 3_600_000;
const day = { start: 9 * H, end: 18 * H };

describe('when someone is free (M17 I7)', () => {
  it('joins overlapping busy times and clips them to the day', () => {
    expect(
      mergeBusy(day, [
        { start: 8 * H, end: 10 * H },
        { start: 9.5 * H, end: 11 * H },
        { start: 17 * H, end: 20 * H },
      ]),
    ).toEqual([
      { start: 9 * H, end: 11 * H },
      { start: 17 * H, end: 18 * H },
    ]);
  });

  it('leaves the gaps of at least half an hour', () => {
    expect(
      freeGaps(day, [
        { start: 11 * H, end: 12 * H },
        { start: 12.25 * H, end: 15.5 * H },
        { start: 16.5 * H, end: 18 * H },
      ]),
    ).toEqual([
      { start: 9 * H, end: 11 * H },
      { start: 15.5 * H, end: 16.5 * H },
    ]);
    expect(freeGaps(day, [])).toEqual([day]);
    expect(FREE_MIN_MS).toBe(0.5 * H);
  });

  it('says whether a time clashes, and finds the next that fits on the half hour', () => {
    const busy = [{ start: 15 * H, end: 16 * H }];
    expect(clashes({ start: 15.5 * H, end: 16.5 * H }, busy)).toBe(true);
    expect(clashes({ start: 16 * H, end: 17 * H }, busy)).toBe(false);
    expect(nextFree(day, busy, 15 * H, H)).toBe(16 * H);
    expect(nextFree(day, busy, 14.25 * H, H)).toBe(16 * H);
    expect(nextFree(day, busy, 9.1 * H, H)).toBe(9.5 * H);
    expect(nextFree(day, [{ start: 9 * H, end: 18 * H }], 9 * H, H)).toBeNull();
  });

  it('reads the day on the person’s clock, and a day off as none', () => {
    const hours = [{ weekday: 4, start: '09:00', end: '18:00' }];
    // Thursday 29 October 2026 in Riyadh (UTC+3, no daylight saving), asked at noon UTC; late on
    // Wednesday in UTC is already Thursday there.
    const window = dayWindow(new Date('2026-10-29T12:00:00Z'), 'Asia/Riyadh', hours);
    expect(window).toEqual({
      start: Date.parse('2026-10-29T06:00:00Z'),
      end: Date.parse('2026-10-29T15:00:00Z'),
      weekday: 4,
    });
    expect(dayWindow(new Date('2026-10-28T22:00:00Z'), 'Asia/Riyadh', hours)?.weekday).toBe(4);
    expect(dayWindow(new Date('2026-10-30T12:00:00Z'), 'Asia/Riyadh', hours)).toBeNull();
  });
});
