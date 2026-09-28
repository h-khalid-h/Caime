import { describe, expect, it } from 'vitest';
import { parseNumber } from './amounts';

describe('an amount as it’s typed', () => {
  it('reads the separators of the person’s language', () => {
    expect(parseNumber('1,200.50', 'en-US')).toBe(1200.5);
    expect(parseNumber('1200', 'en-US')).toBe(1200);
    expect(parseNumber('1.200,50', 'de')).toBe(1200.5);
    expect(parseNumber('12,5', 'de')).toBe(12.5);
    expect(parseNumber('1 200,50', 'fr')).toBe(1200.5);
    expect(parseNumber('1 200,50', 'fr')).toBe(1200.5);
  });

  it('in the digits the language writes', () => {
    expect(parseNumber('١٬٢٠٠٫٥٠', 'ar-EG')).toBe(1200.5);
    expect(parseNumber('١٢٠٠', 'ar-EG')).toBe(1200);
  });

  it('and nothing that isn’t a number', () => {
    for (const bad of ['', 'abc', 'EGP 1,200', '1.2.3', '-5', '12e3'])
      expect(parseNumber(bad, 'en-US')).toBeNull();
  });
});
