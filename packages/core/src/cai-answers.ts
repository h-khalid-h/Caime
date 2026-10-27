/**
 * Cai answers for someone, when they turn it on (R116, M17 I16a and I16a2; the council in
 * docs/REVIEW-2026-10-25-CAI.md §7): a stranger's message request, and the people they know by the
 * ways they pick, when they haven't answered in a while or while they're busy, answered in writing
 * on the caller's own allowance if they choose to talk, or on the receiver's for the people they
 * cover, and summed up for the person it was for. Light and pure: Settings reads the shape, the
 * server the limits.
 */
import { msg } from './i18n';
import { SPHERES, type Sphere } from './taxonomy';

/** What someone turned on (`preferences.caiAnswers`); off when never chosen. */
export interface CaiAnswersSettings {
  /** People who aren't connected with them: their first message is answered by Cai. */
  strangers: boolean;
  /** People they know, by how they know them: Cai answers them too, when `after` or `whileBusy`. */
  spheres: Sphere[];
  /** Minutes a message from one of them waits unanswered before Cai answers; null for never. */
  after: number | null;
  /** Cai answers them at once while they're in a meeting or an appointment. */
  whileBusy: boolean;
  /** Of those, the people whose talk with Cai is on their allowance rather than the caller's. */
  covers: Sphere[];
  /** How many of those talks they cover in thirty days. */
  coverMonthly: number;
  /** Of those, the people Cai lets them know of at once when it can't wait. */
  ringThrough: Sphere[];
}

/** The waits someone may choose before Cai answers one of their people, in minutes. */
export const CAI_ANSWER_AFTER = [15, 30, 60, 120, 240] as const;

/** The talks someone may cover in thirty days: at least, at most, and the first offered. */
export const CAI_COVER_MONTHLY = { min: 5, max: 100, first: 20 } as const;

/** The numbers of covered talks Settings offers, within `CAI_COVER_MONTHLY`. */
export const CAI_COVER_CHOICES = [5, 10, 20, 50, 100] as const;

/** A caller's talks one receiver covers in a day: past it, they talk on their own allowance. */
export const CAI_COVERED_A_DAY = 2;

/** The lines of the two's own conversation before it that Cai reads for someone they know. */
export const CAI_KNOWN_CONTEXT_LINES = 20;

export const CAI_ANSWERS_OFF: CaiAnswersSettings = {
  strangers: false,
  spheres: [],
  after: null,
  whileBusy: false,
  covers: [],
  coverMonthly: CAI_COVER_MONTHLY.first,
  ringThrough: [],
};

const spheresIn = (v: unknown): Sphere[] =>
  Array.isArray(v) ? SPHERES.filter((s) => v.includes(s)) : [];

/**
 * What someone turned on, read from whatever their preferences hold: never chosen is off, and
 * whom Cai covers or rings through for is only ever among the people it answers.
 */
export function caiAnswersOf(preferences: unknown): CaiAnswersSettings {
  const p = ((preferences ?? {}) as { caiAnswers?: Record<string, unknown> }).caiAnswers ?? {};
  const spheres = spheresIn(p.spheres);
  const among = (v: unknown) => spheresIn(v).filter((s) => spheres.includes(s));
  const after = (CAI_ANSWER_AFTER as readonly number[]).includes(Number(p.after))
    ? Number(p.after)
    : null;
  const monthly = Number(p.coverMonthly);
  return {
    strangers: p.strangers === true,
    spheres,
    after,
    whileBusy: p.whileBusy === true,
    covers: among(p.covers),
    coverMonthly:
      Number.isInteger(monthly) &&
      monthly >= CAI_COVER_MONTHLY.min &&
      monthly <= CAI_COVER_MONTHLY.max
        ? monthly
        : CAI_COVER_MONTHLY.first,
    ringThrough: among(p.ringThrough),
  };
}

/** Why Cai answered in a conversation: a stranger's request, a wait, or the receiver busy. */
export const CAI_ANSWER_REASONS = ['request', 'unanswered', 'busy'] as const;
export type CaiAnswerReason = (typeof CAI_ANSWER_REASONS)[number];

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
