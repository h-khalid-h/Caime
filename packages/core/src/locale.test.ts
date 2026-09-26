import { describe, expect, it } from 'vitest';
import {
  formatClock,
  formatDue,
  formatListTime,
  MATCH_END,
  MATCH_START,
  snippetParts,
} from './format';
import { safeLocale } from './locale';

describe('safeLocale', () => {
  it('turns whatever a device reports into a tag the runtime accepts', () => {
    expect(safeLocale('en-US@posix')).toBe('en-US');
    expect(safeLocale('en_US.UTF-8')).toBe('en-US');
    expect(safeLocale('ar-EG')).toBe('ar-EG');
    expect(safeLocale('')).toBe('en');
    expect(safeLocale(null)).toBe('en');
    expect(safeLocale('!!not a locale')).toBe('en');
  });

  it('never lets a bad locale or time zone break formatting', () => {
    const now = new Date('2026-09-26T12:00:00Z');
    const iso = '2026-09-26T09:30:00Z';
    expect(() => formatClock(iso, 'Africa/Cairo', 'en-US@posix')).not.toThrow();
    expect(() => formatListTime(iso, now, 'Not/AZone', '!!')).not.toThrow();
    expect(() => formatDue(iso, now, 'Africa/Cairo', 'en_US.UTF-8')).not.toThrow();
  });
});

describe('snippetParts', () => {
  it('splits a search snippet into plain and matched runs', () => {
    const s = `The ${MATCH_START}venue${MATCH_END} contract, «signed»`;
    expect(snippetParts(s)).toEqual([
      { text: 'The ', match: false },
      { text: 'venue', match: true },
      { text: ' contract, «signed»', match: false },
    ]);
    expect(snippetParts('no match here')).toEqual([{ text: 'no match here', match: false }]);
    expect(snippetParts('')).toEqual([]);
  });
});
