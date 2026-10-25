import { describe, expect, it } from 'vitest';
import { instantOnClock, movedByItsClock, onClock } from './card-clock';

describe('a start on the clock it was set on (R119, M17 I19c)', () => {
  it('keeps the zone and the wall-clock minute beside the instant', () => {
    // 10:00 in Cairo on 2 November 2026 (winter, UTC+2) is 08:00 UTC.
    const start = onClock({ at: '2026-11-02T08:00:00.000Z', hasTime: true }, 'Africa/Cairo');
    expect(start).toEqual({
      at: '2026-11-02T08:00:00.000Z',
      hasTime: true,
      zone: 'Africa/Cairo',
      local: '2026-11-02T10:00',
    });
    expect(instantOnClock(start)?.toISOString()).toBe('2026-11-02T08:00:00.000Z');
    expect(movedByItsClock(start)).toBeNull();
  });

  it('finds a start its zone’s rules moved, as one kept under the old ones would be', () => {
    // Kept as 07:00 UTC when Cairo was thought to be UTC+3 that day; its rules now say UTC+2.
    const kept = {
      at: '2026-11-02T07:00:00.000Z',
      hasTime: true,
      zone: 'Africa/Cairo',
      local: '2026-11-02T10:00',
    };
    expect(movedByItsClock(kept)?.toISOString()).toBe('2026-11-02T08:00:00.000Z');
    // In summer the same clock is UTC+3 (Egypt's summer time, back since 2023).
    expect(instantOnClock({ zone: 'Africa/Cairo', local: '2026-07-01T10:00' })?.toISOString()).toBe(
      '2026-07-01T07:00:00.000Z',
    );
  });

  it('reads nothing from a start kept without a clock, or with one it can’t read', () => {
    expect(instantOnClock({})).toBeNull();
    expect(movedByItsClock({ at: '2026-11-02T08:00:00.000Z' })).toBeNull();
    expect(instantOnClock({ zone: 'Not/AZone', local: '2026-11-02T10:00' })).toBeNull();
    expect(instantOnClock({ zone: 'Africa/Cairo', local: '2 Nov 10:00' })).toBeNull();
    // A device's seconds aren't a move.
    expect(
      movedByItsClock({
        at: '2026-11-02T08:00:30.000Z',
        zone: 'Africa/Cairo',
        local: '2026-11-02T10:00',
      }),
    ).toBeNull();
  });
});
