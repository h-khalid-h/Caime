/**
 * A customer's answers to an organization's intake form (M16 H5), checked by the same rules on
 * the card and on the server: each answer by its question's kind, every needed one there. Apart
 * from `intake.ts`, which the setup screen reads too, so only the card's chunk carries them.
 */
import { fieldValue } from './field-values';
import { tr } from './i18n';
import {
  type IntakeForm,
  type IntakeQuestion,
  LONG_ANSWER_CHARS,
  NO,
  SHORT_ANSWER_CHARS,
  YES,
} from './intake';

/**
 * An answer as kept, or why it can't be: a number is a number (any script's digits kept in Latin
 * ones), a date a real day, a choice one of its choices, yes or no one of the two; words within
 * their length. Empty is no answer.
 */
export function answerValue(
  question: IntakeQuestion,
  raw: string,
): { value: string | null } | { error: string } {
  const text = raw.trim();
  if (!text) return { value: null };
  if (question.kind === 'yesno')
    return text === YES || text === NO ? { value: text } : { error: tr('Answer yes or no.') };
  if (question.kind === 'number' || question.kind === 'date' || question.kind === 'choice')
    return fieldValue(
      { id: question.id, label: question.label, kind: question.kind, choices: question.choices },
      text,
    );
  const max = question.kind === 'longtext' ? LONG_ANSWER_CHARS : SHORT_ANSWER_CHARS;
  return text.length > max ? { error: tr('That’s too long for an answer.') } : { value: text };
}

/**
 * A form's answers as kept, each by its question, every required one there; or the first
 * problem, with the question it's about.
 */
export function checkAnswers(
  form: IntakeForm,
  raw: Record<string, string>,
): { answers: Record<string, string> } | { error: string; questionId: string | null } {
  for (const id of Object.keys(raw))
    if (!form.questions.some((q) => q.id === id))
      return { error: tr('That isn’t one of this form’s questions.'), questionId: null };
  const answers: Record<string, string> = {};
  for (const q of form.questions) {
    const got = answerValue(q, raw[q.id] ?? '');
    if ('error' in got)
      return {
        error: tr('{question}: {problem}', { question: q.label, problem: got.error }),
        questionId: q.id,
      };
    if (got.value === null) {
      if (q.required)
        return {
          error: tr('{question} needs an answer.', { question: q.label }),
          questionId: q.id,
        };
      continue;
    }
    answers[q.id] = got.value;
  }
  return { answers };
}

/** A Form card's form and answers, read from its payload; null for any other card. */
export function formOf(
  payload: unknown,
): { form: IntakeForm; answers: Record<string, string> | null } | null {
  const card = payload as { kit?: unknown; form?: unknown; answers?: unknown } | null;
  if (card?.kit !== 'form' || !card.form || typeof card.form !== 'object') return null;
  const form = card.form as IntakeForm;
  if (!Array.isArray(form.questions)) return null;
  const answers =
    card.answers && typeof card.answers === 'object'
      ? (card.answers as Record<string, string>)
      : null;
  return { form, answers };
}
