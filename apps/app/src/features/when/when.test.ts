import { describe, expect, it } from 'vitest';
import { chosenOf, instantOf, quickPicks, todayWhere } from './when';

// Monday 28 September 2026, 10:00 in Cairo (UTC+3 in summer time).
const monday = new Date('2026-09-28T07:00:00Z');

describe('when, where the person is', () => {
  it('is the day and time in their time zone, 09:00 when there’s no time', () => {
    expect(instantOf({ date: '2026-10-01', time: '15:30' }, 'Africa/Cairo').toISOString()).toBe(
      '2026-10-01T12:30:00.000Z',
    );
    expect(instantOf({ date: '2026-10-01', time: null }, 'America/New_York').toISOString()).toBe(
      '2026-10-01T13:00:00.000Z',
    );
    expect(chosenOf('2026-10-01T12:30:00.000Z', 'Africa/Cairo', true)).toEqual({
      date: '2026-10-01',
      time: '15:30',
    });
    expect(chosenOf('2026-10-01T23:30:00.000Z', 'Africa/Cairo', false)).toEqual({
      date: '2026-10-02',
      time: null,
    });
    // Late Sunday in New York is already Monday in Cairo.
    expect(todayWhere('Africa/Cairo', new Date('2026-09-28T01:00:00Z'))).toBe('2026-09-28');
    expect(todayWhere('America/New_York', new Date('2026-09-28T01:00:00Z'))).toBe('2026-09-27');
  });

  it('offers today, tomorrow and the first day of their next work week', () => {
    const monFri = [1, 2, 3, 4, 5];
    const sunThu = [0, 1, 2, 3, 4];
    const days = (week: number[], now: Date) =>
      quickPicks('Africa/Cairo', week, now).map((p) => `${p.label} ${p.chosen.date}`);
    expect(days(monFri, monday)).toEqual([
      'Today 2026-09-28',
      'Tomorrow 2026-09-29',
      'Next week 2026-10-05',
    ]);
    // Egypt's week starts on Sunday.
    expect(days(sunThu, monday)).toEqual([
      'Today 2026-09-28',
      'Tomorrow 2026-09-29',
      'Next week 2026-10-04',
    ]);
    // On Friday, next week is Monday, after the weekend.
    expect(days(monFri, new Date('2026-10-02T07:00:00Z')).at(-1)).toBe('Next week 2026-10-05');
    // On Saturday, it's the day after tomorrow.
    expect(days(monFri, new Date('2026-10-03T07:00:00Z')).at(-1)).toBe('Next week 2026-10-05');
  });
});
