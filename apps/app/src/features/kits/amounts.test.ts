import { describe, expect, it } from 'vitest';
import { exampleAmount, parseNumber } from './amounts';

describe('an amount as it’s typed', () => {
  it('reads the separators of the person’s language', () => {
    expect(parseNumber('1,200.50', 'en-US')).toBe(1200.5);
    expect(parseNumber('1200', 'en-US')).toBe(1200);
    expect(parseNumber('1.200,50', 'de')).toBe(1200.5);
    expect(parseNumber('12,5', 'de')).toBe(12.5);
    expect(parseNumber('1 200,50', 'fr')).toBe(1200.5);
    expect(parseNumber('1 200,50', 'fr')).toBe(1200.5);
    expect(parseNumber('1,00,000', 'en-IN')).toBe(100000);
    expect(parseNumber("1'200.50", 'de-CH')).toBe(1200.5);
  });

  it('and the keypad’s, which may not be the language’s', () => {
    // An American keypad's "." for someone who reads German is still the decimal, and a German
    // keypad's "," for someone who reads English.
    expect(parseNumber('12.50', 'de-DE')).toBe(12.5);
    expect(parseNumber('0.5', 'de-DE')).toBe(0.5);
    expect(parseNumber('12,50', 'en-US')).toBe(12.5);
    expect(parseNumber('.5', 'en-US')).toBe(0.5);
    expect(parseNumber('12.', 'en-US')).toBe(12);
    // Three digits after one separator: as the language reads it.
    expect(parseNumber('1,200', 'en-US')).toBe(1200);
    expect(parseNumber('1.200', 'de-DE')).toBe(1200);
    expect(parseNumber('1.200', 'en-US')).toBe(1.2);
    expect(parseNumber('1,200', 'de-DE')).toBe(1.2);
    // Grouping that isn't in threes (or India's twos) isn't grouping.
    expect(parseNumber('1.2.3', 'de-DE')).toBeNull();
    expect(parseNumber('1,20,0', 'en-US')).toBeNull();
    expect(parseNumber('1,2.5', 'en-US')).toBeNull();
    expect(parseNumber('1.200.5,5', 'de-DE')).toBeNull();
  });

  it('in the digits the language writes, or a keyboard does', () => {
    expect(parseNumber('١٬٢٠٠٫٥٠', 'ar-EG')).toBe(1200.5);
    expect(parseNumber('١٢٠٠', 'ar-EG')).toBe(1200);
    expect(parseNumber('۱۲۰۰', 'fa-IR')).toBe(1200);
    expect(parseNumber('১,২৩৪.৫', 'bn-BD')).toBe(1234.5);
    expect(parseNumber('१,२००', 'hi-IN')).toBe(1200);
    expect(parseNumber('１２００', 'ja-JP')).toBe(1200);
  });

  it('and nothing that isn’t a number', () => {
    for (const bad of ['', 'abc', 'EGP 1,200', '1.2.3', '-5', '12e3', '.', ',,'])
      expect(parseNumber(bad, 'en-US')).toBeNull();
  });

  it('with an example written as the language writes numbers', () => {
    expect(exampleAmount('en-US')).toBe('1,200');
    expect(exampleAmount('de-DE')).toBe('1.200');
    expect(exampleAmount('ar-EG')).toBe('١٬٢٠٠');
  });
});
