import { describe, expect, it } from 'vitest';
import { tagged, tagsOf } from './tagged';

describe('a sentence with its links marked', () => {
  it('is cut into words and tagged words, in the translation’s own order', () => {
    expect(
      tagged('Hesap oluşturarak <terms>kullanım koşullarını</terms> kabul etmiş olursunuz.'),
    ).toEqual([
      'Hesap oluşturarak ',
      { tag: 'terms', text: 'kullanım koşullarını' },
      ' kabul etmiş olursunuz.',
    ]);
    expect(tagged('<a>x</a> and <b>y</b>')).toEqual([
      { tag: 'a', text: 'x' },
      ' and ',
      { tag: 'b', text: 'y' },
    ]);
  });

  it('leaves a sentence without tags whole, and a stray bracket as words', () => {
    expect(tagged('No links here.')).toEqual(['No links here.']);
    expect(tagged('a < b and <c>unclosed')).toEqual(['a < b and <c>unclosed']);
    expect(tagsOf('<terms>t</terms>. The <privacy>p</privacy>')).toEqual(['terms', 'privacy']);
  });
});
