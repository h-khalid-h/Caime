import { describe, expect, it } from 'vitest';
import { formatTime, TIME_OF_DAY, timeDate, timeOf, uses24Hours } from './times';

describe('times of day', () => {
  it('are 24-hour HH:MM, and a picker’s date reads back as the same', () => {
    expect(TIME_OF_DAY.test('08:30')).toBe(true);
    for (const bad of ['8:30', '24:00', '12:60', '0830', ''])
      expect(TIME_OF_DAY.test(bad)).toBe(false);
    expect(timeOf(timeDate('21:05'))).toBe('21:05');
    expect(timeOf(timeDate('00:00'))).toBe('00:00');
    // Something that isn't a time starts the picker at nine.
    expect(timeOf(timeDate('soon'))).toBe('09:00');
    // On a day no clock changes on, so a time in a spring-forward gap opens as itself.
    const d = timeDate('02:30');
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2000, 0, 1]);
  });

  it('read as the person’s language says them, on its clock', () => {
    expect(formatTime('20:30', 'en-US')).toBe('8:30 PM');
    expect(formatTime('20:30', 'en-GB')).toBe('20:30');
    expect(formatTime('20:30', 'de')).toBe('20:30');
    expect(uses24Hours('en-US')).toBe(false);
    expect(uses24Hours('en-GB')).toBe(true);
    expect(uses24Hours('ar-EG')).toBe(false);
    // Whatever digits the language writes: Persian's ۱۳, Nepali's १३.
    expect(uses24Hours('fa-IR')).toBe(true);
    expect(uses24Hours('ne-NP')).toBe(true);
    expect(uses24Hours('de')).toBe(true);
    expect(formatTime('late', 'en')).toBe('late');
  });
});
