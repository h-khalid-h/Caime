import { MATCH_END, MATCH_START } from '@caime/core';
import { describe, expect, it } from 'vitest';
import { bareArabic } from '../src/lib/fold-sql';
import { markSnippet, RECENCY_DAYS, relevance } from '../src/lib/found-text';

const marked = (s: string) => MATCH_START + s + MATCH_END;
const DAY = 86_400_000;

describe('what search found, as the searcher reads it (M17 I5)', () => {
  it('marks the words the query matched, as written, folded as the index folds', () => {
    expect(markSnippet('أحمد قال إن العقد جاهز', 'احمد')).toBe(
      `${marked('أحمد')} قال إن العقد جاهز`,
    );
    expect(markSnippet('بعتنا العرض للعميل', 'عرض')).toBe(`بعتنا ${marked('العرض')} للعميل`);
    expect(markSnippet('On se voit au Café demain', 'cafe')).toBe(
      `On se voit au ${marked('Café')} demain`,
    );
    // "inv" starts "Invoice" too: a start is a match.
    expect(markSnippet('Invoice INV-7731 is paid', 'inv-7731')).toBe(
      `${marked('Invoice')} ${marked('INV')}-${marked('7731')} is paid`,
    );
    expect(markSnippet('مُحَمَّد اتصل بيك', 'محمد')).toBe(`${marked('مُحَمَّد')} اتصل بيك`);
  });

  it('marks a start, never an end', () => {
    expect(markSnippet('The contract is ready', 'contr')).toBe(
      `The ${marked('contract')} is ready`,
    );
    expect(markSnippet('The contract is ready', 'tract')).toBe('The contract is ready');
  });

  it('drops a marker someone wrote, and keeps a text with no word as it is', () => {
    expect(markSnippet(`ab${MATCH_START} c`, 'zzz')).toBe('ab c');
    expect(markSnippet('— … —', 'x')).toBe('— … —');
  });

  it('takes the article or a joined "و" off an Arabic word, never off a short one', () => {
    expect(bareArabic('العرض')).toBe('عرض');
    expect(bareArabic('والعقد')).toBe('عقد');
    expect(bareArabic('للعميل')).toBe('عميل');
    expect(bareArabic('واحمد')).toBe('احمد');
    expect(bareArabic('وصل')).toBeNull();
    expect(bareArabic('ال')).toBeNull();
    expect(bareArabic('Ahmed')).toBeNull();
  });

  it('weighs whole words over starts, words side by side, and age', () => {
    const whole = relevance('the harbor lantern', 'harbor lantern', 0);
    const starts = relevance('harborside lanterns', 'harbor lantern', 0);
    const apart = relevance('lantern by the harbor', 'harbor lantern', 0);
    expect(whole).toBeGreaterThan(starts);
    expect(starts).toBeGreaterThan(apart);
    expect(relevance('the harbor lantern', 'harbor lantern', RECENCY_DAYS * DAY)).toBeCloseTo(
      whole / 2,
    );
    expect(relevance('nothing here', 'harbor', 0)).toBe(0);
    expect(relevance('anything', '…', 0)).toBe(0);
  });
});
