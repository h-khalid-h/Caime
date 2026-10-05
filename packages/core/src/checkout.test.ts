import { describe, expect, it } from 'vitest';
import { chargeUnits } from './checkout';

describe('an amount for a provider’s checkout (R65)', () => {
  it('counts in each currency’s smallest unit', () => {
    expect(chargeUnits(400.5, 'EGP')).toBe(40050);
    expect(chargeUnits(0.1 + 0.2, 'EUR')).toBe(30);
    expect(chargeUnits(1500, 'JPY')).toBe(1500);
    expect(chargeUnits(12.345, 'KWD')).toBe(12350);
  });

  it('refuses what can’t be charged', () => {
    expect(chargeUnits(0, 'EGP')).toBeNull();
    expect(chargeUnits(-5, 'EGP')).toBeNull();
    expect(chargeUnits(Number.NaN, 'EGP')).toBeNull();
    expect(chargeUnits(0.001, 'EGP')).toBeNull();
    expect(chargeUnits(10_000_000, 'EGP')).toBeNull();
  });
});
