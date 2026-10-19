import { describe, expect, it } from 'vitest';
import { extractAmounts } from './amounts';
import { AMOUNTS_GOLDEN, type AmountLine } from './fixtures/amounts-golden';

/**
 * Amounts in what people write, per language (M16 G10): an amount found is right when its value
 * and its currency both are, so a currency read wrong counts against precision and recall alike.
 * When first measured (2026-10-19) Arabic read at precision 0.75 and recall 0.60: a currency word
 * took the word after it ("ريال للفندق" came back as a currency), "ج" wasn't Egypt's pound, and
 * nothing read an amount in words ("مية جنيه", "two hundred dollars", "bin lira") or a bare one in
 * a sentence about money ("ادفعلي ٢٥٠"). The floors are what was measured once that was fixed,
 * and only ever move up.
 */
const LANGUAGES = ['en', 'ar', 'fr', 'tr'] as const;
const FLOORS: Record<AmountLine['lang'], { precision: number; recall: number }> = {
  en: { precision: 1, recall: 1 },
  ar: { precision: 1, recall: 1 },
  fr: { precision: 1, recall: 1 },
  tr: { precision: 1, recall: 1 },
};

describe('the amounts golden set', () => {
  for (const lang of LANGUAGES) {
    it(`${lang}: amounts read at or above their floors`, () => {
      let tp = 0;
      let fp = 0;
      let fn = 0;
      const wrong: string[] = [];
      for (const line of AMOUNTS_GOLDEN.filter((l) => l.lang === lang)) {
        const found = extractAmounts(line.text, { currency: line.currency });
        const left = [...found];
        for (const want of line.amounts) {
          const i = left.findIndex(
            (g) => Math.abs(g.value - want.value) < 0.001 && g.currency === want.currency,
          );
          if (i >= 0) {
            tp += 1;
            left.splice(i, 1);
          } else {
            fn += 1;
            wrong.push(`  missed ${want.value} ${want.currency}: ${line.text}`);
          }
        }
        for (const extra of left) {
          fp += 1;
          wrong.push(`  extra ${extra.value} ${extra.currency}: ${line.text}`);
        }
      }
      const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
      const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
      const report = `${lang}: precision ${precision.toFixed(2)} recall ${recall.toFixed(2)}\n${wrong.join('\n')}`;
      expect(precision, report).toBeGreaterThanOrEqual(FLOORS[lang].precision);
      expect(recall, report).toBeGreaterThanOrEqual(FLOORS[lang].recall);
    });
  }

  it('holds money and numbers that are not money in each language', () => {
    for (const lang of LANGUAGES) {
      const lines = AMOUNTS_GOLDEN.filter((l) => l.lang === lang);
      expect(lines.filter((l) => l.amounts.length).length, lang).toBeGreaterThanOrEqual(12);
      expect(lines.filter((l) => !l.amounts.length).length, lang).toBeGreaterThanOrEqual(8);
    }
  });

  it('never gives a currency that is not a code', () => {
    for (const line of AMOUNTS_GOLDEN)
      for (const a of extractAmounts(line.text, { currency: line.currency }))
        expect(a.currency === null || /^[A-Z]{3}$/.test(a.currency), line.text).toBe(true);
  });
});
