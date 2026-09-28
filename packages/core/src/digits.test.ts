import { describe, expect, it } from 'vitest';
import { asciiDigits } from './digits';

describe('digits in any script', () => {
  it('read as ASCII ones, everything else kept', () => {
    expect(asciiDigits('١٢٬٥٠٠٫٧٥')).toBe('12٬500٫75');
    expect(asciiDigits('۱۴۰۵')).toBe('1405');
    expect(asciiDigits('१२३४')).toBe('1234');
    expect(asciiDigits('১,২৩৪.৫')).toBe('1,234.5');
    expect(asciiDigits('๑๒')).toBe('12');
    expect(asciiDigits('１２００円')).toBe('1200円');
    // Runs of digits side by side (mathematical bold, then double-struck) each count from 0.
    expect(asciiDigits('𝟎𝟗𝟘𝟡')).toBe('0909');
    expect(asciiDigits('Room 12B, ٣ pm')).toBe('Room 12B, 3 pm');
  });
});
