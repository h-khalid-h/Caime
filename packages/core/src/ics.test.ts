import { describe, expect, it } from 'vitest';
import {
  buildIcs,
  buildInvitation,
  buildReply,
  foldLine,
  icsText,
  invitationWords,
  isTimeZone,
  readInvitation,
  readReply,
} from './ics';

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
      name: 'Caime',
      timeZone: 'Africa/Cairo',
      now,
      events: [
        {
          uid: 'task-1@caime',
          summary: 'Renew the passport',
          date: '2026-12-31',
          updated: new Date('2026-09-20T08:00:00Z'),
        },
        {
          uid: 'meeting-2@caime',
          summary: 'Venue walkthrough',
          start: new Date('2026-10-02T11:00:00Z'),
          end: new Date('2026-10-02T11:45:00Z'),
          location: 'Hall B, 2nd floor',
          url: 'https://caime.example/c/abc',
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
    expect(lines).toContain('URL:https://caime.example/c/abc');
    expect(lines).toContain('LAST-MODIFIED:20260921T080000Z');
    expect(lines.filter((l) => l === 'TRANSP:OPAQUE')).toHaveLength(1);
    expect(lines.filter((l) => l === 'TRANSP:TRANSPARENT')).toHaveLength(1);
    expect(lines.filter((l) => l === 'BEGIN:VEVENT')).toHaveLength(2);
  });

  it('a title can never add a line of its own, and only an address is written as one', () => {
    const ics = buildIcs({
      name: 'Caime',
      now,
      events: [
        {
          uid: 'task-3@caime',
          summary: 'Pay\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nSUMMARY:Injected',
          date: '2026-10-01',
          url: 'https://caime.example/c/x\r\nATTACH:https://evil.example',
          updated: now,
        },
        {
          uid: 'task-4@caime',
          summary: 'Call',
          start: new Date('2026-10-01T09:00:00Z'),
          url: 'javascript:alert(1)',
          updated: now,
        },
        {
          uid: 'meeting-5@caime',
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
      buildIcs({ name: 'Caime', now, events: [{ uid: 'x', summary: 'x', updated: now }] }),
    ).toThrow(/needs a date/);
    expect(() =>
      buildIcs({
        name: 'Caime',
        now,
        events: [{ uid: 'x', summary: 'x', date: 'soon', updated: now }],
      }),
    ).toThrow(/Not a date/);
  });
});

describe('a meeting as an invitation by mail (R84)', () => {
  const base = {
    method: 'REQUEST' as const,
    uid: 'meeting-m1@caime',
    sequence: 0,
    now: new Date('2026-10-13T08:00:00Z'),
    start: new Date('2026-10-14T09:00:00Z'),
    end: new Date('2026-10-14T09:30:00Z'),
    summary: 'Plan the launch',
    location: 'Caime',
    url: 'https://caime.example/j/tok',
    organizer: { name: 'Ana "A" Host', email: 'hello@caime.example' },
    attendee: { name: 'Gus Guest', email: 'gus@example.com' },
  };
  // Long lines are folded at 75 octets (RFC 5545 §3.1): read them unfolded.
  const lines = (s: string) => s.replace(/\r\n /g, '').split('\r\n');

  it('asks the guest’s calendar to add it, with Accept and Decline', () => {
    const l = lines(buildInvitation(base));
    expect(l).toEqual(
      expect.arrayContaining([
        'METHOD:REQUEST',
        'UID:meeting-m1@caime',
        'SEQUENCE:0',
        'DTSTART:20261014T090000Z',
        'DTEND:20261014T093000Z',
        'SUMMARY:Plan the launch',
        'LOCATION:Caime',
        'URL:https://caime.example/j/tok',
        'ORGANIZER;CN="Ana  A  Host":mailto:hello@caime.example',
        'ATTENDEE;CN="Gus Guest";ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:gus@example.com',
        'STATUS:CONFIRMED',
      ]),
    );
  });
  it('takes it out again with CANCEL and a higher sequence', () => {
    const l = lines(buildInvitation({ ...base, method: 'CANCEL', sequence: 2 }));
    expect(l).toEqual(expect.arrayContaining(['METHOD:CANCEL', 'SEQUENCE:2', 'STATUS:CANCELLED']));
  });
  it('never writes an address that isn’t one, nor a line break into a name', () => {
    expect(() =>
      buildInvitation({ ...base, attendee: { name: 'x', email: 'x@y.com\r\nBCC:z@w.com' } }),
    ).toThrow();
    const l = lines(
      buildInvitation({ ...base, attendee: { name: 'Gus\r\nX-EVIL:1', email: 'gus@example.com' } }),
    );
    expect(l.some((x) => x.startsWith('X-EVIL'))).toBe(false);
  });
});

describe('a guest’s answer to an invitation (R86)', () => {
  const reply = (stat: string, extra = '') =>
    [
      'BEGIN:VCALENDAR',
      'METHOD:REPLY',
      'BEGIN:VEVENT',
      'UID:meeting-m1@caime',
      `ATTENDEE;CN="Gus Guest";PARTSTAT=${stat}:mailto:Gus@Example.com`,
      extra,
      'END:VEVENT',
      'END:VCALENDAR',
    ]
      .filter(Boolean)
      .join('\r\n');
  it('reads who answered what, for which meeting', () => {
    expect(readReply(reply('ACCEPTED'))).toEqual({
      uid: 'meeting-m1@caime',
      attendee: 'gus@example.com',
      answer: 'accepted',
      sequence: 0,
    });
    // Which time of it the answer is to (M16 F5): an answer to a time since moved is past.
    expect(readReply(reply('ACCEPTED', 'SEQUENCE:2'))?.sequence).toBe(2);
    expect(readReply(reply('DECLINED'))?.answer).toBe('declined');
    expect(readReply(reply('TENTATIVE'))?.answer).toBe('tentative');
  });
  it('reads a folded line as one', () => {
    const folded = reply('ACCEPTED').replace('PARTSTAT=ACC', 'PARTSTAT=ACC\r\n ');
    expect(readReply(folded)?.answer).toBe('accepted');
  });
  it('is nothing for a request, an unknown answer, two attendees, or no address', () => {
    expect(readReply(reply('ACCEPTED').replace('METHOD:REPLY', 'METHOD:REQUEST'))).toBeNull();
    expect(readReply(reply('DELEGATED'))).toBeNull();
    expect(readReply(reply('ACCEPTED', 'ATTENDEE;PARTSTAT=ACCEPTED:mailto:x@y.com'))).toBeNull();
    expect(readReply(reply('ACCEPTED').replace('mailto:Gus@Example.com', 'Gus'))).toBeNull();
    expect(readReply('')).toBeNull();
  });
});

describe('an invitation from someone’s calendar (M16 F4)', () => {
  const MARK = '-::~:~::~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~:~::~:~::-';
  // As Google Calendar writes one: its zone defined, a Meet, its own lines in the description,
  // an alarm of its own, the organizer among the attendees.
  const google = (extra: string[] = [], start = 'DTSTART;TZID=Europe/London:20261021T100000') =>
    [
      'BEGIN:VCALENDAR',
      'PRODID:-//Google Inc//Google Calendar 70.9054//EN',
      'VERSION:2.0',
      'CALSCALE:GREGORIAN',
      'METHOD:REQUEST',
      'BEGIN:VTIMEZONE',
      'TZID:Europe/London',
      'BEGIN:STANDARD',
      'TZOFFSETFROM:+0100',
      'TZOFFSETTO:+0000',
      'DTSTART:19701025T020000',
      'END:STANDARD',
      'END:VTIMEZONE',
      'BEGIN:VEVENT',
      start,
      'DTEND;TZID=Europe/London:20261021T105000',
      'DTSTAMP:20261019T120000Z',
      'ORGANIZER;CN=Sara Out:mailto:sara@outside.example',
      'UID:7kukuqrfedlm2f9t2vr42q2vil@google.com',
      'ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;RSVP=TRUE;CN=Sara Out;X-NUM-GUESTS=0:mailto:sara@outside.example',
      'ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN=noor@caime.test;X-NUM-GUESTS=0:mailto:Noor@Caime.test',
      'X-GOOGLE-CONFERENCE:https://meet.google.com/abc-defg-hij',
      `DESCRIPTION:Let's go over the Q3 numbers\\, bring the deck.\\n\\n${MARK}\\nJoin with Google Meet: https://meet.google.com/abc-defg-hij\\n\\nPlease do not edit this section.\\n${MARK}`,
      'LOCATION:',
      'SEQUENCE:0',
      'STATUS:CONFIRMED',
      'SUMMARY:Q3 review',
      'TRANSP:OPAQUE',
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'DESCRIPTION:This is an event reminder',
      'TRIGGER:-P0DT0H10M0S',
      'END:VALARM',
      ...extra,
      'END:VEVENT',
      'END:VCALENDAR',
      '',
    ].join('\r\n');
  // As Outlook writes one: Windows' name for the zone, Teams named as the place.
  const outlook = [
    'BEGIN:VCALENDAR',
    'METHOD:REQUEST',
    'PRODID:Microsoft Exchange Server 2010',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    'ORGANIZER;CN=Sara Out:mailto:sara@outside.example',
    'ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN=noor@caime.test:mailto:noor@caime.test',
    'DESCRIPTION;LANGUAGE=en-US:Agenda below.\\n\\n______________________________________________________________________________\\nMicrosoft Teams meeting\\nJoin on your computer\\, mobile app or room device\\n',
    'UID:040000008200E00074C5B7101A82E0080000000048F6B0B5',
    'SUMMARY;LANGUAGE=en-US:Contract review',
    'DTSTART;TZID=Romance Standard Time:20261022T140000',
    'DTEND;TZID=Romance Standard Time:20261022T153000',
    'SEQUENCE:2',
    'LOCATION;LANGUAGE=en-US:Microsoft Teams Meeting',
    'X-MICROSOFT-SKYPETEAMSMEETINGURL:https://teams.microsoft.com/l/meetup-join/19%3ameeting_x%40thread.v2/0',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  it('reads Google’s: its time in its zone, its Meet as where, its organizer and guests', () => {
    const inv = readInvitation(google(), 'Asia/Dubai');
    expect(inv).toMatchObject({
      method: 'REQUEST',
      uid: '7kukuqrfedlm2f9t2vr42q2vil@google.com',
      sequence: 0,
      summary: 'Q3 review',
      place: 'https://meet.google.com/abc-defg-hij',
      hasTime: true,
      organizer: { email: 'sara@outside.example', name: 'Sara Out' },
      attendees: ['sara@outside.example', 'noor@caime.test'],
    });
    // 10:00 in London in October is 09:00 UTC; it lasts 50 minutes.
    expect(inv?.start.toISOString()).toBe('2026-10-21T09:00:00.000Z');
    expect(inv?.end.toISOString()).toBe('2026-10-21T09:50:00.000Z');
    // The alarm's description is the alarm's, never the event's.
    expect(invitationWords(inv?.description ?? null)).toBe(
      "Let's go over the Q3 numbers, bring the deck.",
    );
  });
  it('reads Outlook’s: Windows’ zone names, Teams’ address where it only says Teams', () => {
    const inv = readInvitation(outlook, 'UTC');
    expect(inv?.start.toISOString()).toBe('2026-10-22T12:00:00.000Z');
    expect(inv?.end.toISOString()).toBe('2026-10-22T13:30:00.000Z');
    expect(inv?.sequence).toBe(2);
    expect(inv?.place).toBe(
      'https://teams.microsoft.com/l/meetup-join/19%3ameeting_x%40thread.v2/0',
    );
    expect(invitationWords(inv?.description ?? null)).toBe('Agenda below.');
  });
  it('reads a time in UTC, a floating time on the reader’s clock, a day, and a length', () => {
    const at = (start: string, zone = 'UTC', extra: string[] = []) =>
      readInvitation(google(extra, start).replace(/DTEND[^\r]*\r\n/, ''), zone);
    expect(at('DTSTART:20261021T100000Z')?.start.toISOString()).toBe('2026-10-21T10:00:00.000Z');
    // Dubai keeps no summer time: four hours ahead all year.
    expect(at('DTSTART:20261021T100000', 'Asia/Dubai')?.start.toISOString()).toBe(
      '2026-10-21T06:00:00.000Z',
    );
    const day = at('DTSTART;VALUE=DATE:20261021', 'Asia/Dubai');
    expect(day?.hasTime).toBe(false);
    expect(day?.start.toISOString()).toBe('2026-10-21T05:00:00.000Z');
    const long = at('DTSTART:20261021T100000Z', 'UTC', ['DURATION:PT45M']);
    expect(long?.end.toISOString()).toBe('2026-10-21T10:45:00.000Z');
    // Without an end or a length, an hour.
    expect(at('DTSTART:20261021T100000Z')?.end.toISOString()).toBe('2026-10-21T11:00:00.000Z');
    // A calendar app's own path to a zone.
    expect(
      at('DTSTART;TZID=/mozilla.org/20050126_1/Europe/London:20261021T100000')?.start.toISOString(),
    ).toBe('2026-10-21T09:00:00.000Z');
  });
  it('is nothing for a series, a time of one, two events, a zone it can’t name, or no time', () => {
    expect(readInvitation(google(['RRULE:FREQ=WEEKLY;BYDAY=WE']), 'UTC')).toBeNull();
    expect(readInvitation(google(['RECURRENCE-ID:20261021T090000Z']), 'UTC')).toBeNull();
    const two = google().replace(
      'END:VCALENDAR',
      'BEGIN:VEVENT\r\nUID:b\r\nEND:VEVENT\r\nEND:VCALENDAR',
    );
    expect(readInvitation(two, 'UTC')).toBeNull();
    expect(
      readInvitation(google([], 'DTSTART;TZID=Customized Time Zone:20261021T100000'), 'UTC'),
    ).toBeNull();
    expect(readInvitation(google().replace('METHOD:REQUEST', 'METHOD:PUBLISH'), 'UTC')).toBeNull();
    expect(readInvitation(google([], 'X-NOTHING:1'), 'UTC')).toBeNull();
    expect(readInvitation('', 'UTC')).toBeNull();
    expect(readInvitation('BEGIN:VCALENDAR\r\nMETHOD:REQUEST', 'UTC')).toBeNull();
  });
  it('reads a cancellation by its event alone', () => {
    const cancel = [
      'BEGIN:VCALENDAR',
      'METHOD:CANCEL',
      'BEGIN:VEVENT',
      'UID:7kukuqrfedlm2f9t2vr42q2vil@google.com',
      'SEQUENCE:1',
      'ORGANIZER;CN="Sara: Out":mailto:sara@outside.example',
      'ATTENDEE:mailto:noor@caime.test',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    expect(readInvitation(cancel, 'UTC')).toMatchObject({
      method: 'CANCEL',
      uid: '7kukuqrfedlm2f9t2vr42q2vil@google.com',
      sequence: 1,
      // A quoted name may hold a colon.
      organizer: { email: 'sara@outside.example', name: 'Sara: Out' },
    });
  });
  it('keeps what its organizer wrote, not what their calendar adds', () => {
    expect(invitationWords(`${MARK}\nJoin with Google Meet\n${MARK}`)).toBeNull();
    expect(invitationWords(null)).toBeNull();
    expect(
      invitationWords(
        'When: Tuesday 21 October 2026 10:00-11:00.\nWhere: Microsoft Teams Meeting\n\n*~*~*~*~*~*~*~*~*~*\n\nBring the deck.',
      ),
    ).toBe('Bring the deck.');
    expect(
      invitationWords(
        '<b>Agenda</b><br><ul><li>Numbers</li><li>Deck</li></ul><a href="https://x.example/doc">the doc</a> &amp; more',
      ),
    ).toBe('Agenda\n• Numbers\n• Deck\nthe doc (https://x.example/doc) & more');
  });
  it('knows a zone by its name', () => {
    expect(isTimeZone('Europe/London')).toBe(true);
    expect(isTimeZone('Mars/Olympus_Mons')).toBe(false);
    expect(isTimeZone('')).toBe(false);
  });
  it('answers it as an attendee’s calendar would: their answer, for its event and sequence', () => {
    const l = buildReply({
      uid: '7kukuqrfedlm2f9t2vr42q2vil@google.com',
      sequence: 2,
      now,
      start: new Date('2026-10-21T09:00:00Z'),
      end: new Date('2026-10-21T09:50:00Z'),
      summary: 'Q3 review',
      organizer: { name: 'Sara Out', email: 'sara@outside.example' },
      attendee: { name: 'Noor', email: 'noor@caime.test' },
      answer: 'ACCEPTED',
    })
      .replace(/\r\n /g, '')
      .split('\r\n');
    expect(l).toEqual(
      expect.arrayContaining([
        'METHOD:REPLY',
        'UID:7kukuqrfedlm2f9t2vr42q2vil@google.com',
        'SEQUENCE:2',
        'DTSTART:20261021T090000Z',
        'DTEND:20261021T095000Z',
        'ORGANIZER;CN="Sara Out":mailto:sara@outside.example',
        'ATTENDEE;CN="Noor";PARTSTAT=ACCEPTED:mailto:noor@caime.test',
      ]),
    );
    expect(readInvitation(l.join('\r\n'), 'UTC')).toBeNull();
    expect(() =>
      buildReply({
        uid: 'x',
        sequence: 0,
        now,
        start: now,
        end: now,
        summary: 'x',
        organizer: { name: 'x', email: 'x@y.com\r\nBCC:z@w.com' },
        attendee: { name: 'Noor', email: 'noor@caime.test' },
        answer: 'DECLINED',
      }),
    ).toThrow();
  });
});
