/**
 * Cai answers for someone, when they turn it on (R116, M17 I16a; the council in
 * docs/REVIEW-2026-10-25-CAI.md §7). The first phase: a stranger's message request, answered in
 * writing on the stranger's own allowance if they choose to talk, and summed up for the person it
 * was for. Light and pure: Settings reads the shape, the server the limits.
 */
import { msg } from './i18n';

/** What someone turned on (`preferences.caiAnswers`); off when never chosen. */
export interface CaiAnswersSettings {
  /** People who aren't connected with them: their first message is answered by Cai. */
  strangers: boolean;
}

export const CAI_ANSWERS_OFF: CaiAnswersSettings = { strangers: false };

/** The caller's two choices on Cai's first line: leave the message, or talk to Cai now. */
export const CAI_ANSWER_CHOICES = ['leave', 'talk'] as const;
export type CaiAnswerChoice = (typeof CAI_ANSWER_CHOICES)[number];

/** Where Cai answering stands in a conversation, as each side's view says it. */
export type CaiAnsweringState = 'offered' | 'left' | 'talking' | 'ended';

/** The caller's lines to Cai in one conversation before Cai passes it on. */
export const CAI_ANSWER_TURNS = 8;

/** The lines one person writes to Cai answering for others in a day, every conversation together. */
export const CAI_ANSWER_LINES_A_DAY = 30;

/** Why Cai stopped answering in a conversation, counted on `caime_cai_answers_total`. */
export const CAI_ANSWER_ENDS = ['caller', 'receiver', 'declined', 'limit', 'handed_over'] as const;
export type CaiAnswerEnd = (typeof CAI_ANSWER_ENDS)[number];

/** The choices' words, translated where they're drawn. */
export const CAI_ANSWER_CHOICE_LABELS: Record<CaiAnswerChoice, string> = {
  leave: msg('Leave my message'),
  talk: msg('Talk to Cai now'),
};
