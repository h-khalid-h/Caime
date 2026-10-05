/** What a voice note's payload says about its words (server `lib/transcribe.ts`). */
export interface TranscriptMark {
  language: string | null;
  by: string;
  at: string;
}

export function transcriptOf(payload: Record<string, unknown>): TranscriptMark | null {
  const t = payload.transcript as Partial<TranscriptMark> | undefined;
  return t && typeof t.by === 'string' && typeof t.at === 'string'
    ? { language: typeof t.language === 'string' ? t.language : null, by: t.by, at: t.at }
    : null;
}

/** How long a note is, as the sender's recorder measured it. */
export function durationOf(
  payload: Record<string, unknown>,
  fallbackMs: number | null,
): number | null {
  const d = payload.durationMs;
  return typeof d === 'number' && Number.isFinite(d) && d > 0 ? d : fallbackMs;
}
