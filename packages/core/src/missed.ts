/**
 * What someone missed (M17 I3, R66): the bounds of a recap and the rule that sorts a new message
 * into what the reader is asked, what was promised, what was decided and what's coming, from the
 * message intelligence (`analyzeMessage`) and a card's start. The server reads with it; the tests
 * hold it. Pure.
 */
import type { MissedKind } from './api';
import type { Analysis } from './intelligence';

/** The most conversations a recap covers: the top of Needs-you as Attention ranks them. */
export const MISSED_CONVERSATIONS = 8;
/** The most new messages read in one conversation: the latest ones. */
export const MISSED_LINES = 30;
/** The most lines a recap shows of one conversation: what asks of the reader first. */
export const MISSED_SHOWN = 4;
/** The most characters of lines a summary is given (M16 H7: the cost test measures this bound). */
export const MISSED_CHARS = 40_000;

/** What asks of the reader comes first, then what was promised to them, decided, and ahead. */
export const MISSED_ORDER: readonly MissedKind[] = ['ask', 'promise', 'decision', 'coming'];

/**
 * What a new message is to its reader, or null when it's none of these: a card ahead is coming
 * up (one past is nothing to catch up on); words that ask something of the reader (a request, a
 * question) come before a promise in the same message, since the reader has to answer them, and
 * a promise before a decision.
 */
export function missedKindOf(
  analysis: Pick<Analysis, 'isRequest' | 'isQuestion' | 'isCommitment' | 'isDecision'> | null,
  message: { kind: string; cardStartAt: Date | null },
  now: Date,
): MissedKind | null {
  if (message.kind === 'kit') {
    return message.cardStartAt && message.cardStartAt.getTime() >= now.getTime() ? 'coming' : null;
  }
  if (!analysis) return null;
  if (analysis.isRequest || analysis.isQuestion) return 'ask';
  if (analysis.isCommitment) return 'promise';
  if (analysis.isDecision) return 'decision';
  return null;
}

/** The lines shown of one conversation: by kind in `MISSED_ORDER`, each kind as they came. */
export function missedLinesShown<T extends { kind: MissedKind; seq: number }>(
  lines: readonly T[],
  most = MISSED_SHOWN,
): T[] {
  const rank = (k: MissedKind) => MISSED_ORDER.indexOf(k);
  return [...lines].sort((a, b) => rank(a.kind) - rank(b.kind) || a.seq - b.seq).slice(0, most);
}
