import { describe, expect, it } from 'vitest';
import {
  CARD_MINUTES,
  calendarAction,
  cardEndMs,
  JOIN_EARLY_MS,
  JOIN_LATE_MS,
  joinOpen,
  joinPath,
  meetingAction,
  meetingLink,
  meetingVenue,
} from './meetings';

describe('where a meeting is held (R83)', () => {
  it('is Caime when the Where is empty, missing or says Caime', () => {
    for (const p of [undefined, null, '', '   ', 'Caime', 'on caime', 'CAIME', 'Caıme', 42]) {
      expect(meetingVenue(p)).toBe('caime');
    }
  });
  it('is another service for a web address, with or without its scheme', () => {
    for (const p of [
      'https://meet.google.com/abc-defg-hij',
      'meet.google.com/abc-defg-hij',
      'zoom.us/j/123456789',
      'http://teams.microsoft.com/l/meetup-join/x',
      ' example.org ',
    ]) {
      expect(meetingVenue(p)).toBe('link');
    }
  });
  it('is a place for anything else, Arabic included', () => {
    for (const p of [
      'Nile Dental, 12 Tahrir St.',
      'The café on 9th',
      'Room 4.2',
      'مكتب الشركة، الدور الثالث',
      'St. Mark’s',
    ]) {
      expect(meetingVenue(p)).toBe('place');
    }
  });
  it('is never Caime for an invitation from someone’s calendar (M16 F4)', () => {
    for (const p of [undefined, '', 'Caime', 'on caime'])
      expect(meetingVenue(p, true)).toBe('place');
    expect(meetingVenue('https://meet.google.com/abc-defg-hij', true)).toBe('link');
    expect(meetingVenue('Room 4.2', { uid: 'x' })).toBe('place');
    const card = (invitation?: unknown) => ({
      kit: 'meeting',
      state: 'accepted',
      fields: { start: { at: '2026-10-13T10:00:00.000Z', hasTime: true } },
      invitation,
    });
    const now = new Date('2026-10-13T10:05:00.000Z');
    expect(meetingAction(card(), now)).toBe('join');
    expect(meetingAction(card({ uid: 'x' }), now)).toBeNull();
    const item = {
      kind: 'meeting',
      state: 'agreed',
      hasTime: true,
      at: '2026-10-13T10:00:00.000Z',
      endAt: null,
      place: null,
    };
    expect(calendarAction(item, now)).toBe('join');
    expect(calendarAction({ ...item, invitation: true }, now)).toBeNull();
  });
  it('opens a link with its scheme', () => {
    expect(meetingLink(' zoom.us/j/1 ')).toBe('https://zoom.us/j/1');
    expect(meetingLink('https://x.io/a')).toBe('https://x.io/a');
  });
});

describe('when a meeting on Caime can be joined (R83)', () => {
  const start = { at: '2026-10-13T10:00:00.000Z', hasTime: true };
  const at = Date.parse(start.at);
  const open = (ms: number, minutes: unknown = 30) => joinOpen(start, minutes, new Date(ms));

  it('opens ten minutes before and closes half an hour after its planned end', () => {
    expect(open(at - JOIN_EARLY_MS - 1)).toBe(false);
    expect(open(at - JOIN_EARLY_MS)).toBe(true);
    expect(open(at + 30 * 60_000 + JOIN_LATE_MS)).toBe(true);
    expect(open(at + 30 * 60_000 + JOIN_LATE_MS + 1)).toBe(false);
  });
  it('takes its length from the card, as a number or its text, else an hour as the calendar does', () => {
    expect(open(at + 80 * 60_000, 60)).toBe(true);
    expect(open(at + 80 * 60_000, '60')).toBe(true);
    expect(open(at + 80 * 60_000, 30)).toBe(false);
    for (const bad of [undefined, null, 'x', -5, 0, Number.NaN]) {
      expect(joinOpen(start, bad, new Date(at + 90 * 60_000))).toBe(true);
      expect(joinOpen(start, bad, new Date(at + 90 * 60_000 + 1))).toBe(false);
    }
  });
  it('is never open for a day without a time, or a start that isn’t a date', () => {
    expect(joinOpen({ at: start.at, hasTime: false }, 30, new Date(at))).toBe(false);
    expect(joinOpen({ at: 'soon' }, 30, new Date(at))).toBe(false);
    expect(joinOpen(undefined, 30, new Date(at))).toBe(false);
    expect(joinOpen('2026-10-13T10:00:00Z', 30, new Date(at))).toBe(false);
  });
  it('takes a start stored without hasTime as having one', () => {
    expect(joinOpen({ at: start.at }, 30, new Date(at))).toBe(true);
  });
});

describe('what an accepted meeting card offers (R83)', () => {
  const at = '2026-10-13T10:00:00.000Z';
  const now = new Date(at);
  const card = (state: string, place?: string, kit = 'meeting') => ({
    kit,
    state,
    fields: { start: { at, hasTime: true }, durationMinutes: 30, ...(place ? { place } : {}) },
  });
  it('offers Join while one held on Caime can be joined', () => {
    expect(meetingAction(card('accepted'), now)).toBe('join');
    expect(meetingAction(card('accepted'), new Date(Date.parse(at) - 3_600_000))).toBeNull();
  });
  it('offers Open for one on another service, nothing for one in person', () => {
    expect(meetingAction(card('accepted', 'zoom.us/j/1'), now)).toBe('open');
    expect(meetingAction(card('accepted', 'Room 4'), now)).toBeNull();
  });
  it('offers nothing before it is accepted, after it is cancelled, or on another kind', () => {
    for (const s of ['proposed', 'declined', 'cancelled']) {
      expect(meetingAction(card(s), now)).toBeNull();
    }
    expect(meetingAction(card('accepted', undefined, 'appointment'), now)).toBeNull();
    expect(meetingAction({ kit: 'meeting', state: 'accepted', fields: null }, now)).toBeNull();
    // Moved to its own space (R84): its copy there has the Join.
    expect(
      meetingAction({ ...card('accepted'), movedTo: { conversationId: 's', messageId: 'c' } }, now),
    ).toBeNull();
  });
});

describe('a meeting in the calendar (R83)', () => {
  const at = '2026-10-13T10:00:00.000Z';
  const ms = Date.parse(at);
  const item = (over: Record<string, unknown> = {}) => ({
    kind: 'meeting',
    state: 'agreed',
    hasTime: true,
    at,
    endAt: '2026-10-13T10:45:00.000Z',
    place: null,
    ...over,
  });
  it('offers Join from ten minutes before to half an hour after its end', () => {
    expect(calendarAction(item(), new Date(ms - JOIN_EARLY_MS))).toBe('join');
    expect(calendarAction(item(), new Date(ms - JOIN_EARLY_MS - 1))).toBeNull();
    expect(calendarAction(item(), new Date(ms + 45 * 60_000 + JOIN_LATE_MS))).toBe('join');
    expect(calendarAction(item(), new Date(ms + 45 * 60_000 + JOIN_LATE_MS + 1))).toBeNull();
  });
  it('offers Open for a link, nothing in person, asked, all day, or for another kind', () => {
    const now = new Date(ms);
    expect(calendarAction(item({ place: 'meet.google.com/x' }), now)).toBe('open');
    expect(calendarAction(item({ place: 'Room 4' }), now)).toBeNull();
    expect(calendarAction(item({ state: 'asked' }), now)).toBeNull();
    expect(calendarAction(item({ hasTime: false }), now)).toBeNull();
    expect(calendarAction(item({ kind: 'appointment' }), now)).toBeNull();
  });
  it('joins at the card, in its conversation', () => {
    expect(joinPath('c-1', 42, 'm-1')).toBe('/c/c-1?seq=42&join=m-1');
  });
});

describe('when a card ends (M16 D3)', () => {
  const at = Date.parse('2026-10-20T10:00:00Z');
  it('is the booking’s own end, else its length, else an hour, never past a day', () => {
    // A stay booked for two nights ends when it was booked to, whatever the card says.
    const stay = { booking: { endAt: '2026-10-22T10:00:00Z' }, durationMinutes: 30 };
    expect(cardEndMs(at, stay)).toBe(Date.parse('2026-10-22T10:00:00Z'));
    // A booking's end that isn't after its start is no end.
    expect(cardEndMs(at, { booking: { endAt: '2026-10-20T09:00:00Z' }, durationMinutes: 90 })).toBe(
      at + 90 * 60_000,
    );
    expect(cardEndMs(at, { durationMinutes: 45 })).toBe(at + 45 * 60_000);
    expect(CARD_MINUTES).toBe(60);
    for (const durationMinutes of [undefined, null, 0, -5, 'soon', Number.NaN])
      expect(cardEndMs(at, { durationMinutes })).toBe(at + 60 * 60_000);
    expect(cardEndMs(at, { durationMinutes: 10_000 })).toBe(at + 24 * 60 * 60_000);
  });
});
