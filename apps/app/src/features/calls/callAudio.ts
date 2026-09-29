/**
 * Where a call's sound goes. A browser plays it where the computer does, so there's nothing to
 * choose on the web; the phones' is callAudio.native.ts.
 */
export function useCallAudio(
  _on: boolean,
  _video: boolean,
): {
  /** Through the loudspeaker, or null where there's no choice to make. */
  speaker: boolean | null;
  toggleSpeaker: () => void;
} {
  return { speaker: null, toggleSpeaker: () => {} };
}
