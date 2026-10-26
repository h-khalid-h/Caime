import { describe, expect, it } from 'vitest';
import { analyzeMessage } from './intelligence';
import { tappableSpans } from './tappable';

describe('what may be tapped in a message (M17 I9d)', () => {
  it('finds each kept day ahead, number and address where the words say it', () => {
    const text = 'See you Thursday at 3pm, call +20 100 123 4567 or write to sara@nile.dental';
    const spans = tappableSpans(text, {
      dates: [{ text: 'Thursday at 3pm', at: '2026-10-29T13:00:00.000Z', time: '15:00' }],
      // As the server keeps it: its digits and its plus.
      phones: ['+201001234567'],
      emails: ['sara@nile.dental'],
    });
    expect(spans.map((s) => text.slice(s.start, s.end))).toEqual([
      'Thursday at 3pm',
      '+20 100 123 4567',
      'sara@nile.dental',
    ]);
    expect(spans[0]?.tap).toEqual({ kind: 'date', at: '2026-10-29T13:00:00.000Z', hasTime: true });
    // The number as it was written, for the sheet to show and to call.
    expect(spans[1]?.tap).toEqual({ kind: 'phone', number: '+20 100 123 4567' });
    expect(
      tappableSpans('call 0044 20-7946.0958 now', { phones: ['00442079460958'] }).map((s) => s.tap),
    ).toEqual([{ kind: 'phone', number: '0044 20-7946.0958' }]);
  });

  it('offers no day gone by, nothing it was not given, and nothing twice over the same words', () => {
    expect(
      tappableSpans('We met yesterday', {
        dates: [{ text: 'yesterday', at: '2026-10-25T00:00:00.000Z', past: true }],
      }),
    ).toEqual([]);
    expect(tappableSpans('Call me', null)).toEqual([]);
    expect(tappableSpans('Call me', { phones: [42], emails: ['nope'] })).toEqual([]);
    const text = 'Friday, Friday';
    const twice = tappableSpans(text, {
      dates: [
        { text: 'Friday', at: '2026-10-30T00:00:00.000Z' },
        { text: 'Friday', at: '2026-10-30T00:00:00.000Z' },
      ],
    });
    expect(twice.map((s) => s.start)).toEqual([0, 8]);
  });

  it('finds the words whatever their case, in Arabic too', () => {
    const text = 'نتقابل بكرة الساعة 3';
    const spans = tappableSpans(text, {
      dates: [{ text: 'بكرة الساعة 3', at: '2026-10-27T13:00:00.000Z', time: '15:00' }],
    });
    expect(text.slice(spans[0]?.start, spans[0]?.end)).toBe('بكرة الساعة 3');
    const mixed = tappableSpans('Meet ON MONDAY', {
      dates: [{ text: 'on Monday', at: '2026-11-02T00:00:00.000Z' }],
    });
    expect(mixed[0]).toMatchObject({ start: 5, end: 14 });
  });

  it('finds a number and an address as the rules keep them', () => {
    const text = 'Ring me on +20 100 123 4567 or 0044 20 7946 0958, or write to sara@nile.dental';
    const a = analyzeMessage(text, { now: new Date('2026-10-26T09:00:00Z'), timeZone: 'UTC' });
    expect(
      tappableSpans(text, { phones: a.phones, emails: a.emails }).map((s) =>
        text.slice(s.start, s.end),
      ),
    ).toEqual(['+20 100 123 4567', '0044 20 7946 0958', 'sara@nile.dental']);
  });
});
