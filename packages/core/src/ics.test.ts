import { describe, expect, it } from 'vitest';
import { buildIcs, foldLine, icsText } from './ics';

const now = new Date('2026-09-27T12:00:00Z');
const unfold = (ics: string) => ics.replace(/\r\n /g, '');
const octets = (s: string) => new TextEncoder().encode(s).length;

describe('calendar feeds (RFC 5545, PRD §72)', () => {
  it('escapes what would change a line’s meaning, and drops control characters', () => {
    expect(icsText('Lunch, then review; bring notes\\slides\nand coffee')).toBe(
      'Lunch\\, then review\\; bring notes\\\\slides\\nand coffee',
    );
    expect(icsText('a\r\nb\rc')).toBe('a\\nb\\nc');
    expect(icsText('bell\u0007 and\ttab')).toBe('bell and\ttab');
  });

  it('folds at 75 octets, never inside a character, and unfolds to the same line', () => {
    const line = `SUMMARY:${'Café ☕ réunion 🎉 '.repeat(12)}`;
    const folded = foldLine(line);
    const parts = folded.split('\r\n');
    expect(parts.length).toBeGreaterThan(3);
    for (const [i, p] of parts.entries()) {
      expect(octets(p)).toBeLessThanOrEqual(75);
      if (i > 0) expect(p.startsWith(' ')).toBe(true);
      // Nothing is cut in half: every part is whole UTF-8.
      expect(new TextDecoder('utf-8', { fatal: true }).decode(new TextEncoder().encode(p))).toBe(p);
    }
    expect(folded.replace(/\r\n /g, '')).toBe(line);
    expect(foldLine('SHORT:line')).toBe('SHORT:line');
    // Exactly 75 octets stays one line; 76 folds.
    expect(foldLine('X'.repeat(75))).toBe('X'.repeat(75));
    expect(foldLine('X'.repeat(76))).toBe(`${'X'.repeat(75)}\r\n X`);
  });

  it('writes all-day and timed events that calendar apps read', () => {
    const ics = buildIcs({
      name: 'Caishy',
      timeZone: 'Africa/Cairo',
      now,
      events: [
        {
          uid: 'task-1@caishy',
          summary: 'Renew the passport',
          date: '2026-12-31',
          updated: new Date('2026-09-20T08:00:00Z'),
        },
        {
          uid: 'meeting-2@caishy',
          summary: 'Venue walkthrough',
          start: new Date('2026-10-02T11:00:00Z'),
          end: new Date('2026-10-02T11:45:00Z'),
          location: 'Hall B, 2nd floor',
          url: 'https://caishy.example/c/abc',
          busy: true,
          updated: new Date('2026-09-21T08:00:00.123Z'),
        },
      ],
    });
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    // Every line ends in CRLF: no bare line feeds, no bare carriage returns.
    expect(ics.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
    const lines = unfold(ics).split('\r\n');
    expect(lines).toContain('X-WR-TIMEZONE:Africa/Cairo');
    expect(lines).toContain('DTSTAMP:20260927T120000Z');
    // An all-day event ends the day after, across the year.
    expect(lines).toContain('DTSTART;VALUE=DATE:20261231');
    expect(lines).toContain('DTEND;VALUE=DATE:20270101');
    expect(lines).toContain('DTSTART:20261002T110000Z');
    expect(lines).toContain('DTEND:20261002T114500Z');
    expect(lines).toContain('LOCATION:Hall B\\, 2nd floor');
    expect(lines).toContain('URL:https://caishy.example/c/abc');
    expect(lines).toContain('LAST-MODIFIED:20260921T080000Z');
    expect(lines.filter((l) => l === 'TRANSP:OPAQUE')).toHaveLength(1);
    expect(lines.filter((l) => l === 'TRANSP:TRANSPARENT')).toHaveLength(1);
    expect(lines.filter((l) => l === 'BEGIN:VEVENT')).toHaveLength(2);
  });

  it('a title can never add a line of its own, and only an address is written as one', () => {
    const ics = buildIcs({
      name: 'Caishy',
      now,
      events: [
        {
          uid: 'task-3@caishy',
          summary: 'Pay\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nSUMMARY:Injected',
          date: '2026-10-01',
          url: 'https://caishy.example/c/x\r\nATTACH:https://evil.example',
          updated: now,
        },
        {
          uid: 'task-4@caishy',
          summary: 'Call',
          start: new Date('2026-10-01T09:00:00Z'),
          url: 'javascript:alert(1)',
          updated: now,
        },
        {
          uid: 'meeting-5@caishy',
          summary: 'Backwards',
          start: new Date('2026-10-02T10:00:00Z'),
          end: new Date('2026-10-02T09:00:00Z'),
          updated: now,
        },
      ],
    });
    const lines = unfold(ics).split('\r\n');
    expect(lines.filter((l) => l === 'BEGIN:VEVENT')).toHaveLength(3);
    expect(lines).toContain('SUMMARY:Pay\\nEND:VEVENT\\nBEGIN:VEVENT\\nSUMMARY:Injected');
    // An end before its start is no end: it ends as it starts.
    expect(lines).toContain('DTEND:20261002T100000Z');
    expect(lines).not.toContain('DTEND:20261002T090000Z');
    expect(lines.some((l) => l.startsWith('URL:') || l.startsWith('ATTACH:'))).toBe(false);
    // With no end, a timed event ends as it starts.
    expect(lines).toContain('DTEND:20261001T090000Z');
  });

  it('refuses an event with nowhere in time to be', () => {
    expect(() =>
      buildIcs({ name: 'Caishy', now, events: [{ uid: 'x', summary: 'x', updated: now }] }),
    ).toThrow(/needs a date/);
    expect(() =>
      buildIcs({
        name: 'Caishy',
        now,
        events: [{ uid: 'x', summary: 'x', date: 'soon', updated: now }],
      }),
    ).toThrow(/Not a date/);
  });
});
