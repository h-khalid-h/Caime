import { describe, expect, it } from 'vitest';
import { remindAtFor } from './remind-at';

// Wednesday 21 October 2026 in Cairo (UTC+3 until the clocks go back on the 30th).
const CAIRO = 'Africa/Cairo';
const at = (iso: string) => new Date(iso);
const remind = (
  kind: 'asked' | 'own' | 'wait',
  now: string,
  dueAt: string | null,
  dueHasTime: boolean,
  morning?: string | null,
) =>
  remindAtFor({ kind, now: at(now), dueAt, dueHasTime, timeZone: CAIRO, morning })?.toISOString() ??
  null;

describe('when something kept reminds its person (M17 I2)', () => {
  it('rings what they asked for at its hour, on its morning, or the next morning', () => {
    // "Remind me at 3pm Thursday": then.
    expect(remind('asked', '2026-10-21T07:00:00Z', '2026-10-22T12:00:00Z', true)).toBe(
      '2026-10-22T12:00:00.000Z',
    );
    // "Remind me Thursday": Thursday's morning, nine in Cairo.
    expect(remind('asked', '2026-10-21T07:00:00Z', '2026-10-22T06:00:00Z', false)).toBe(
      '2026-10-22T06:00:00.000Z',
    );
    // "Remind me today", said after the morning: within the hour.
    expect(remind('asked', '2026-10-21T10:00:00Z', '2026-10-21T06:00:00Z', false)).toBe(
      '2026-10-21T11:00:00.000Z',
    );
    // "Remind me" with no day, at 10:00 in Cairo: tomorrow morning; at 06:00 in Cairo, this one.
    expect(remind('asked', '2026-10-21T07:00:00Z', null, false)).toBe('2026-10-22T06:00:00.000Z');
    expect(remind('asked', '2026-10-21T03:00:00Z', null, false)).toBe('2026-10-21T06:00:00.000Z');
    // Their morning brief's hour is their morning.
    expect(remind('asked', '2026-10-21T07:00:00Z', null, false, '07:30')).toBe(
      '2026-10-22T04:30:00.000Z',
    );
    // An hour already gone is never rung.
    expect(remind('asked', '2026-10-21T13:00:00Z', '2026-10-21T12:00:00Z', true)).toBeNull();
  });

  it('recalls an action of their own the morning of its day, or an hour before an early hour', () => {
    // "I'll send it by 3pm Thursday": Thursday at nine, not at three.
    expect(remind('own', '2026-10-21T07:00:00Z', '2026-10-22T12:00:00Z', true)).toBe(
      '2026-10-22T06:00:00.000Z',
    );
    // "…by 9:30 Thursday": an hour before, 8:30.
    expect(remind('own', '2026-10-21T07:00:00Z', '2026-10-22T06:30:00Z', true)).toBe(
      '2026-10-22T05:30:00.000Z',
    );
    // "…Thursday": Thursday's morning.
    expect(remind('own', '2026-10-21T07:00:00Z', '2026-10-22T06:00:00Z', false)).toBe(
      '2026-10-22T06:00:00.000Z',
    );
    // Due today, its morning gone, or no day at all: Actions and Attention show it; nothing rings.
    expect(remind('own', '2026-10-21T10:00:00Z', '2026-10-21T06:00:00Z', false)).toBeNull();
    expect(remind('own', '2026-10-21T07:00:00Z', null, false)).toBeNull();
  });

  it('looks at a wait on the day it was promised: its hour, else the end of that day', () => {
    expect(remind('wait', '2026-10-21T07:00:00Z', '2026-10-22T12:00:00Z', true)).toBe(
      '2026-10-22T12:00:00.000Z',
    );
    // "I'll send it Thursday": Thursday at five in Cairo.
    expect(remind('wait', '2026-10-21T07:00:00Z', '2026-10-22T06:00:00Z', false)).toBe(
      '2026-10-22T14:00:00.000Z',
    );
    expect(remind('wait', '2026-10-21T07:00:00Z', null, false)).toBeNull();
  });

  it('reads a day on the person’s own clock, a zone it can’t read as UTC, and never throws', () => {
    // Thursday 09:00 in New York is 13:00Z; its morning there.
    expect(
      remindAtFor({
        kind: 'own',
        now: at('2026-10-21T12:00:00Z'),
        dueAt: '2026-10-22T13:00:00Z',
        dueHasTime: false,
        timeZone: 'America/New_York',
      })?.toISOString(),
    ).toBe('2026-10-22T13:00:00.000Z');
    expect(
      remindAtFor({
        kind: 'wait',
        now: at('2026-10-21T07:00:00Z'),
        dueAt: '2026-10-22T09:00:00Z',
        dueHasTime: false,
        timeZone: 'Not/AZone',
      })?.toISOString(),
    ).toBe('2026-10-22T17:00:00.000Z');
    expect(
      remindAtFor({
        kind: 'own',
        now: at('2026-10-21T07:00:00Z'),
        dueAt: 'not a date',
        dueHasTime: false,
        timeZone: CAIRO,
      }),
    ).toBeNull();
    // A morning that isn't HH:MM is nine.
    expect(remind('asked', '2026-10-21T07:00:00Z', null, false, '7am')).toBe(
      '2026-10-22T06:00:00.000Z',
    );
  });
});
