import { describe, expect, it } from 'vitest';
import type { CustomerField } from './customers';
import { type IntakeForm, keepsIn, LONG_ANSWER_CHARS, SHORT_ANSWER_CHARS } from './intake';
import { checkAnswers, formOf } from './intake-answers';
import { kitsFor } from './kits';

const form: IntakeForm = {
  id: 'f',
  name: 'Before your visit',
  intro: 'So the dentist knows.',
  questions: [
    { id: 'allergies', label: 'Any allergies?', kind: 'longtext', required: true },
    {
      id: 'insurer',
      label: 'Insurer',
      kind: 'choice',
      choices: ['AXA', 'Allianz'],
      required: false,
    },
    { id: 'born', label: 'Date of birth', kind: 'date', required: false },
    { id: 'file', label: 'File number', kind: 'number', required: false },
    { id: 'first', label: 'First visit?', kind: 'yesno', required: true },
  ],
};

describe('intake forms (M16 H5)', () => {
  it('keeps each answer as its question says', () => {
    expect(
      checkAnswers(form, {
        allergies: '  Penicillin ',
        insurer: 'axa',
        born: '١٩٩٠-٠٤-٠٢',
        file: ' ١٢٣٤ ',
        first: 'yes',
      }),
    ).toEqual({
      answers: {
        allergies: 'Penicillin',
        insurer: 'AXA',
        born: '1990-04-02',
        file: '1234',
        first: 'yes',
      },
    });
  });

  it('leaves out what was left empty, unless it was needed', () => {
    expect(checkAnswers(form, { allergies: 'None', first: 'no', insurer: '  ' })).toEqual({
      answers: { allergies: 'None', first: 'no' },
    });
    const missing = checkAnswers(form, { first: 'no' });
    expect(missing).toMatchObject({ questionId: 'allergies' });
    expect('error' in missing && missing.error).toContain('Any allergies?');
  });

  it('says which question an answer is wrong for, and refuses a question it never asked', () => {
    expect(checkAnswers(form, { allergies: 'x', first: 'maybe' })).toMatchObject({
      questionId: 'first',
    });
    expect(checkAnswers(form, { allergies: 'x', first: 'yes', insurer: 'Bupa' })).toMatchObject({
      questionId: 'insurer',
    });
    expect(checkAnswers(form, { allergies: 'x', first: 'yes', file: 'twelve' })).toMatchObject({
      questionId: 'file',
    });
    expect(checkAnswers(form, { allergies: 'x', first: 'yes', other: 'y' })).toMatchObject({
      questionId: null,
    });
  });

  it('holds answers to their length: a short one to a field’s, a long one further', () => {
    const short: IntakeForm = {
      ...form,
      questions: [{ id: 'q', label: 'Plate', kind: 'text', required: true }],
    };
    expect(checkAnswers(short, { q: 'x'.repeat(SHORT_ANSWER_CHARS) })).toHaveProperty('answers');
    expect(checkAnswers(short, { q: 'x'.repeat(SHORT_ANSWER_CHARS + 1) })).toHaveProperty('error');
    expect(
      checkAnswers(form, { allergies: 'x'.repeat(LONG_ANSWER_CHARS), first: 'no' }),
    ).toHaveProperty('answers');
  });

  it('keeps an answer in a customer field of the same kind only', () => {
    const number: CustomerField = { id: 'n', label: 'File', kind: 'number' };
    const text: CustomerField = { id: 't', label: 'Notes', kind: 'text' };
    expect(keepsIn({ kind: 'number' }, number)).toBe(true);
    expect(keepsIn({ kind: 'text' }, number)).toBe(false);
    // Long words and a yes or no have no field of their kind.
    expect(keepsIn({ kind: 'longtext' }, text)).toBe(false);
    expect(keepsIn({ kind: 'yesno' }, text)).toBe(false);
  });

  it('reads a Form card’s form and answers, and nothing else', () => {
    expect(formOf({ kit: 'form', form, answers: { first: 'yes' } })).toEqual({
      form,
      answers: { first: 'yes' },
    });
    expect(formOf({ kit: 'form', form })).toEqual({ form, answers: null });
    expect(formOf({ kit: 'appointment', form })).toBeNull();
    expect(formOf({ kit: 'form', form: { name: 'x' } })).toBeNull();
    expect(formOf(null)).toBeNull();
  });

  it('is offered to the organization’s side alone', () => {
    const base = { spheres: ['customer' as const], isGroup: false, viewerIsMinor: false };
    const ids = (ctx: Parameters<typeof kitsFor>[0]) => kitsFor(ctx).map((k) => k.id);
    expect(ids({ ...base, isBusiness: true, isTeam: true })).toContain('form');
    expect(ids({ ...base, isBusiness: true })).not.toContain('form');
    // Between people, someone labelled a customer is never sent a form.
    expect(ids(base)).not.toContain('form');
  });
});
