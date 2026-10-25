/**
 * A call's recording on one clock (M17 I13c): a moment opens the voices part covering it, or the
 * next one; the screen shown then plays beside it.
 */
import { describe, expect, it } from 'vitest';
import { partAt, screenFor, seekTarget } from './recordingTimeline';

const t0 = Date.UTC(2026, 9, 24, 16, 0, 0);
const at = (seconds: number) => t0 + seconds * 1000;
const part = (id: string, from: number, seconds: number) => ({
  id,
  startedAt: new Date(at(from)).toISOString(),
  durationMs: seconds * 1000,
});
// The voices from the start; a new part when someone joined at 60 s.
const voices = [part('v1', 0, 60), part('v2', 60, 120)];
// A screen shown from 30 s to 90 s.
const screens = [part('s1', 30, 60)];

describe('a call’s recording on one clock (M17 I13c)', () => {
  it('opens the voices at a line’s moment, in the part that covers it', () => {
    expect(seekTarget(voices, at(15))).toEqual({ part: voices[0], offsetSeconds: 15 });
    expect(seekTarget(voices, at(75))).toEqual({ part: voices[1], offsetSeconds: 15 });
  });

  it('a moment before the first part opens it from its start; after the last, nothing', () => {
    expect(seekTarget(voices, at(-5))).toEqual({ part: voices[0], offsetSeconds: 0 });
    expect(seekTarget(voices, at(500))).toBeNull();
  });

  it('shows the screen shown at that moment, and while paused the next one ahead', () => {
    expect(partAt(screens, at(45))?.id).toBe('s1');
    expect(screenFor(screens, at(10), true)).toBeNull();
    expect(screenFor(screens, at(10), false)?.id).toBe('s1');
    expect(screenFor(screens, at(95), false)).toBeNull();
  });
});
