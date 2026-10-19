/**
 * An organization's intake forms (M16 H5): the questions it asks a customer before a visit or an
 * order (what they're allergic to, a car's plate, how many are coming), sent as a Form card in
 * the customer's conversation and answered there by the customer; the team reads the answers on
 * the card, and an answer the organization keeps as one of its customer fields (H3) lands in
 * that customer's record too. Light: the setup screen, the card and the server read it; the
 * answers' checks are `intake-answers.ts`, which only the card and the server need.
 */
import { type CustomerField, type CustomerFieldKind, FIELD_VALUE_CHARS } from './customers';

export const QUESTION_KINDS = ['text', 'longtext', 'number', 'date', 'choice', 'yesno'] as const;
export type QuestionKind = (typeof QUESTION_KINDS)[number];

export interface IntakeQuestion {
  id: string;
  label: string;
  kind: QuestionKind;
  /** A choice's choices. */
  choices?: string[];
  required: boolean;
  /** The customer field (H3) an answer is kept in, by its id; its kind is the question's. */
  keepAs?: string | null;
}

export interface IntakeForm {
  id: string;
  name: string;
  /** A line before the questions: why they're asked, what's done with the answers. */
  intro?: string | null;
  questions: IntakeQuestion[];
}

/** A form as its setup sends it: a form or a question it keeps names its id, a new one none. */
export type IntakeFormInput = Omit<IntakeForm, 'id' | 'questions'> & {
  id?: string;
  questions: Array<Omit<IntakeQuestion, 'id'> & { id?: string }>;
};

/** The most forms an organization keeps, and a form's limits. */
export const FORMS_MAX = 10;
export const FORM_NAME_CHARS = 60;
export const FORM_INTRO_CHARS = 300;
export const QUESTIONS_MAX = 20;
export const QUESTION_CHARS = 120;
/** The most a short answer says (what a customer field keeps), and a long one. */
export const SHORT_ANSWER_CHARS = FIELD_VALUE_CHARS;
export const LONG_ANSWER_CHARS = 2000;
/** A yes-or-no question's two answers, as kept. */
export const YES = 'yes';
export const NO = 'no';

/** The customer field kind a question's answer can be kept as, if any. */
export function keptKind(kind: QuestionKind): CustomerFieldKind | null {
  return kind === 'text' || kind === 'number' || kind === 'date' || kind === 'choice' ? kind : null;
}

/** Whether a question's answers can be kept in a customer field: the same kind. */
export function keepsIn(question: Pick<IntakeQuestion, 'kind'>, field: CustomerField): boolean {
  return keptKind(question.kind) === field.kind;
}
