/**
 * How sure Caime is of a suggestion, said in words (M11). Every suggestion carries a confidence
 * (R12: a suggestion, never a fact); the app says it in one line with the reason, so a person can
 * weigh a dated promise ("Quite sure") against a shared space ("A guess") before taking it.
 * Words, never a number: a percentage would claim a precision the rules don't have.
 */

import { tr } from './i18n';

export type Sureness = 'sure' | 'fairly' | 'guess';

/** Dated promises and verified teams are sure; a shared space is a guess. */
export function surenessOf(confidence: number): Sureness {
  if (!Number.isFinite(confidence)) return 'guess';
  if (confidence >= 0.85) return 'sure';
  if (confidence >= 0.7) return 'fairly';
  return 'guess';
}

export function surenessWord(confidence: number): string {
  switch (surenessOf(confidence)) {
    case 'sure':
      return tr('Quite sure');
    case 'fairly':
      return tr('Fairly sure');
    default:
      return tr('A guess');
  }
}

/** The one line under a suggestion: how sure, then why ("Quite sure · Sam wrote “…”"). */
export function surenessLine(confidence: number, rationale: string): string {
  const why = rationale.trim();
  return why ? `${surenessWord(confidence)} · ${why}` : surenessWord(confidence);
}
