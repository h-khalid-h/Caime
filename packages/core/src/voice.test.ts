import { describe, expect, it } from 'vitest';
import {
  levelBar,
  nextRate,
  stepped,
  WAVEFORM_BARS,
  WAVEFORM_TOP,
  waveformIn,
  waveformOf,
} from './voice';

describe('a voice note’s bars (M16 E4)', () => {
  it('reads a level as a bar, silence at the floor and full scale at the top', () => {
    expect(levelBar(-160)).toBe(0);
    expect(levelBar(-50)).toBe(0);
    expect(levelBar(0)).toBe(WAVEFORM_TOP);
    expect(levelBar(3)).toBe(WAVEFORM_TOP);
    expect(levelBar(-25)).toBe(16);
    expect(levelBar(Number.NaN)).toBe(0);
  });

  it('keeps the loudest moment of each share of the note', () => {
    const levels = [...Array(96)].map((_, i) => (i % 2 === 0 ? -50 : -10));
    const bars = waveformOf(levels);
    expect(bars).toHaveLength(WAVEFORM_BARS);
    expect(new Set(bars)).toEqual(new Set([levelBar(-10)]));
    // A loud moment stands out where it was.
    const quiet = [...Array(480)].map(() => -45);
    quiet[240] = 0;
    const shaped = waveformOf(quiet);
    expect(shaped[24]).toBe(WAVEFORM_TOP);
    expect(shaped.filter((b) => b === WAVEFORM_TOP)).toHaveLength(1);
  });

  it('draws no more bars than it heard, and none from nothing', () => {
    expect(waveformOf([])).toEqual([]);
    expect(waveformOf([Number.NaN, Number.NEGATIVE_INFINITY])).toEqual([]);
    expect(waveformOf([-10, -20, -30])).toEqual([levelBar(-10), levelBar(-20), levelBar(-30)]);
  });

  it('reads only bars a note may carry', () => {
    expect(waveformIn({ waveform: [0, 12, 31] })).toEqual([0, 12, 31]);
    expect(waveformIn({ durationMs: 2000 })).toBeNull();
    expect(waveformIn({ waveform: [] })).toBeNull();
    expect(waveformIn({ waveform: [32] })).toBeNull();
    expect(waveformIn({ waveform: [1.5] })).toBeNull();
    expect(waveformIn({ waveform: [...Array(WAVEFORM_BARS + 1)].map(() => 1) })).toBeNull();
    expect(waveformIn(null)).toBeNull();
  });
});

describe('playing a note', () => {
  it('steps through its speeds and back to the first', () => {
    expect(nextRate(1)).toBe(1.5);
    expect(nextRate(1.5)).toBe(2);
    expect(nextRate(2)).toBe(1);
    expect(nextRate(3)).toBe(1);
  });

  it('steps within its length', () => {
    expect(stepped(2_000, 5_000, 6_000)).toBe(6_000);
    expect(stepped(2_000, -5_000, 6_000)).toBe(0);
    expect(stepped(2_000, 1_000, 6_000)).toBe(3_000);
  });
});
