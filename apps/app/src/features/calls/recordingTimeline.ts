/**
 * Where a moment of a call is in its recording (M17 I13c): the parts on one clock (the recording
 * device's, which the notes' lines are on too), so a line of the notes opens the voices at it and
 * a shown screen plays in step with them. Pure, so it's tested without a player.
 */
import type { CallRecordingPartView } from '@caime/core/api';

type Part = Pick<CallRecordingPartView, 'startedAt' | 'durationMs'>;

export const startOf = (p: Part) => Date.parse(p.startedAt);
const endOf = (p: Part) => startOf(p) + (p.durationMs ?? 0);

/** The part playing at this moment, if one covers it. */
export function partAt<P extends Part>(parts: P[], at: number): P | null {
  return parts.find((p) => startOf(p) <= at && at < endOf(p)) ?? null;
}

/** The first part that begins at this moment or after it. */
export function nextPart<P extends Part>(parts: P[], at: number): P | null {
  return [...parts].sort((a, b) => startOf(a) - startOf(b)).find((p) => startOf(p) >= at) ?? null;
}

/**
 * Where to play from for a moment: the part covering it, so far in; else the next part, from its
 * start (a moment between two parts: someone joining); else nothing (after the end).
 */
export function seekTarget<P extends Part>(
  parts: P[],
  at: number,
): { part: P; offsetSeconds: number } | null {
  const covering = partAt(parts, at);
  if (covering) return { part: covering, offsetSeconds: (at - startOf(covering)) / 1000 };
  const next = nextPart(parts, at);
  return next ? { part: next, offsetSeconds: 0 } : null;
}

/** The screen to show beside the voices: the one shown at this moment, else the next one ahead. */
export function screenFor<P extends Part>(screens: P[], at: number, playing: boolean): P | null {
  return partAt(screens, at) ?? (playing ? null : nextPart(screens, at));
}
