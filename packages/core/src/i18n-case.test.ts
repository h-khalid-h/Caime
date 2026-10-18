/**
 * A catalog's words keep the reader's language's rules (M16 D4): lowered or capitalised only
 * through `lower`, `lowerFirst` and `sentence`, and a number written as the reader writes it.
 */
import { describe, expect, it } from 'vitest';
import { casedWords } from '../../../scripts/i18n-keys.mjs';
import { formatBytes } from './format';
import { lower, lowerFirst, makeTranslator, sentence, setTranslator, shownNumber } from './i18n';
import { fr } from './locales/fr';
import { turkish } from './locales/tr';

describe('words in the reader’s case', () => {
  it('never cases a catalog’s words by hand', () => {
    expect(casedWords()).toEqual([]);
  }, 120_000);

  it('lowers Turkish by its own rules', () => {
    setTranslator(makeTranslator('tr', turkish));
    try {
      expect(lower('İş')).toBe('iş');
      expect('İş'.toLowerCase()).not.toBe('iş');
      expect(lowerFirst('İş arkadaşı')).toBe('iş arkadaşı');
      expect(sentence('iş')).toBe('İş');
    } finally {
      setTranslator(makeTranslator('en', {}));
    }
  });
});

describe('numbers in the reader’s language', () => {
  it('writes a number as each language does', () => {
    expect(shownNumber(1000, 'en')).toBe('1,000');
    expect(shownNumber(12345, 'en')).toBe('12,345');
    expect(shownNumber(12345, 'tr')).toBe('12.345');
    expect(shownNumber(12345, 'fr')).toBe('12\u202f345');
    // Arabic keeps the digits it had.
    expect(shownNumber(12345, 'ar')).toBe('12,345');
    expect(shownNumber(1.5, 'fr')).toBe('1,5');
  });

  it('fills a sentence’s numbers in its language', () => {
    expect(makeTranslator('fr', fr).tr('{n} GB', { n: 12000 })).toContain('12\u202f000');
    expect(makeTranslator('en', {}).tr('{n} GB', { n: 12000 })).toBe('12,000 GB');
    // A number given as text (a year, a code) stays as it was given.
    expect(makeTranslator('en', {}).tr('Since {year}', { year: '2026' })).toBe('Since 2026');
  });

  it('says a size in the reader’s units', () => {
    expect(formatBytes(1.5 * 1024 ** 2)).toBe('1.5 MB');
    setTranslator(makeTranslator('fr', fr));
    try {
      expect(formatBytes(1.5 * 1024 ** 2)).toBe('1,5\u202fMo');
      expect(formatBytes(5 * 1024 ** 3)).toBe('5\u202fGo');
    } finally {
      setTranslator(makeTranslator('en', {}));
    }
  });
});
