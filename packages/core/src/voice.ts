/**
 * A voice note's shape (M16 E4): its loudness as the recorder heard it, a few dozen bars a bubble
 * draws and is scrubbed along, and the speeds it plays at. Light (no zod): the recorder, the bubble
 * and the server's check of what a voice note may carry all read it.
 */

/** The longest voice note: the server transcribes up to this, and a longer one is a recording. */
export const VOICE_MAX_MS = 10 * 60_000;

/** How many bars a note's waveform has at most, and the tallest a bar is. */
export const WAVEFORM_BARS = 48;
export const WAVEFORM_TOP = 31;

/** Quieter than this many decibels under full scale is silence, the lowest bar. */
const FLOOR_DB = -50;

/** One level the recorder measured (dBFS, as expo-audio meters on a phone and in a browser) as a bar. */
export function levelBar(db: number): number {
  if (!Number.isFinite(db)) return 0;
  const level = Math.min(1, Math.max(0, (db - FLOOR_DB) / -FLOOR_DB));
  return Math.round(level * WAVEFORM_TOP);
}

/**
 * The bars of a recording from the levels its recorder measured as it went: each bar the loudest
 * moment of its share of the note. Nothing heard (a recorder that doesn't meter) is no waveform,
 * never a made-up one.
 */
export function waveformOf(levels: readonly number[], bars = WAVEFORM_BARS): number[] {
  const heard = levels.filter((l) => Number.isFinite(l));
  if (heard.length === 0) return [];
  const count = Math.min(bars, heard.length);
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const from = Math.floor((i * heard.length) / count);
    const to = Math.floor(((i + 1) * heard.length) / count);
    let loudest = Number.NEGATIVE_INFINITY;
    for (let j = from; j < to; j++) loudest = Math.max(loudest, heard[j] as number);
    out.push(levelBar(loudest));
  }
  return out;
}

/** The bars a note carries, as a server kept them; null for a note without them (an older one). */
export function waveformIn(payload: unknown): number[] | null {
  const bars = (payload as { waveform?: unknown } | null)?.waveform;
  if (!Array.isArray(bars) || bars.length === 0 || bars.length > WAVEFORM_BARS) return null;
  return bars.every((b) => Number.isInteger(b) && b >= 0 && b <= WAVEFORM_TOP)
    ? (bars as number[])
    : null;
}

/** The speeds a note plays at, each tap the next. */
export const PLAYBACK_RATES = [1, 1.5, 2] as const;
export type PlaybackRate = (typeof PLAYBACK_RATES)[number];

export function nextRate(rate: number): PlaybackRate {
  const at = PLAYBACK_RATES.indexOf(rate as PlaybackRate);
  return PLAYBACK_RATES[(at + 1) % PLAYBACK_RATES.length] ?? 1;
}

/** Where a note is after a step of `stepMs` (back when negative), within its length. */
export function stepped(atMs: number, stepMs: number, totalMs: number): number {
  return Math.min(Math.max(0, atMs + stepMs), Math.max(0, totalMs));
}
