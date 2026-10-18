/**
 * Sentences whole in every language (M16 D4): no key glued to another, every placeholder named
 * for what it holds and passed where it's said, and lists joined as the reader's language joins
 * them (Arabic's comma and "و", never an English "and" in an Arabic sentence).
 */
import { describe, expect, it } from 'vitest';
import { commaJoins, placeholderIssues } from '../../../scripts/i18n-keys.mjs';
import { joinNames } from './format';
import { type Catalog, listed, makeTranslator, setTranslator } from './i18n';
import { ar } from './locales/ar';
import { fr } from './locales/fr';
import { turkish } from './locales/tr';

/** What may still be joined by a comma of its own: words someone typed, kept as they typed them. */
const TYPED = [
  'apps/app/src/features/settings/AutomationSheet.tsx',
  'packages/core/src/automations.ts',
];

function inLanguage(
  language: Parameters<typeof makeTranslator>[0],
  catalog: Catalog,
  run: () => void,
) {
  setTranslator(makeTranslator(language, catalog));
  try {
    run();
  } finally {
    setTranslator(makeTranslator('en', {}));
  }
}

describe('sentences whole, placeholders named for what they hold', () => {
  it('finds no fragment, no placeholder named by the code and none left out', () => {
    expect(placeholderIssues()).toEqual([]);
  }, 120_000);

  it('joins no list a person reads with a comma of its own', () => {
    expect(commaJoins().filter((at) => !TYPED.some((f) => at.startsWith(`${f}:`)))).toEqual([]);
  });
});

describe('lists the reader’s way', () => {
  it('names people with the language’s own "and", the rest counted in it', () => {
    expect(joinNames(['Sarah'])).toBe('Sarah');
    // British English: no comma before the "and".
    expect(joinNames(['Sarah', 'Ahmed', 'Lina'])).toBe('Sarah, Ahmed and Lina');
    expect(joinNames(['A', 'B', 'C', 'D', 'E'])).toBe('A, B and 3 others');
    inLanguage('ar', ar, () => {
      expect(joinNames(['سارة', 'أحمد'])).toBe('سارة وأحمد');
      expect(joinNames(['سارة', 'أحمد', 'لينا', 'منى', 'علي'])).toBe('سارة وأحمد و3 آخرين');
      // Two more, in Arabic's dual.
      expect(joinNames(['سارة', 'أحمد', 'لينا', 'منى'])).toBe('سارة وأحمد واثنان آخران');
    });
    inLanguage('fr', fr, () => {
      expect(joinNames(['A', 'B', 'C', 'D', 'E'])).toBe('A, B et 3 autres');
    });
    inLanguage('tr', turkish, () => {
      expect(joinNames(['Ece', 'Can'])).toBe('Ece ve Can');
    });
  });

  it('joins them from the catalog where Intl has no lists (Hermes on some phones)', () => {
    const intl = Intl as { ListFormat?: unknown };
    const lists = intl.ListFormat;
    intl.ListFormat = undefined;
    try {
      expect(joinNames(['Sarah', 'Ahmed', 'Lina'])).toBe('Sarah, Ahmed and Lina');
      inLanguage('ar', ar, () => {
        expect(joinNames(['سارة', 'أحمد', 'لينا'])).toBe('سارة، أحمد ولينا');
      });
    } finally {
      intl.ListFormat = lists;
    }
  });

  it('separates items with the reader’s comma, leaving out what’s empty', () => {
    expect(listed(['Cash', null, 'Card', ''])).toBe('Cash, Card');
    inLanguage('ar', ar, () => {
      expect(listed(['نقدًا', 'بطاقة'])).toBe('نقدًا، بطاقة');
    });
  });
});
