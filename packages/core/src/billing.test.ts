import { describe, expect, it } from 'vitest';
import {
  fromLookupKey,
  isPaying,
  minorDigits,
  priceAmount,
  priceLookupKey,
  priceText,
  subscriptionLine,
} from './billing';

describe('billing', () => {
  it('prices are found by lookup keys, and only Caishy’s count', () => {
    expect(priceLookupKey('pro', 'month')).toBe('caishy_pro_month');
    expect(fromLookupKey('caishy_business_year')).toEqual({ plan: 'business', interval: 'year' });
    for (const other of [null, undefined, '', 'caishy_enterprise_month', 'x_caishy_pro_month'])
      expect(fromLookupKey(other)).toBeNull();
  });

  it('a payment being tried again keeps the plan on; one that stopped doesn’t', () => {
    expect(['active', 'trialing', 'past_due'].every(isPaying)).toBe(true);
    expect(
      ['canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'paused'].some(isPaying),
    ).toBe(false);
  });

  it('amounts are in the currency’s smallest unit, whatever it is', () => {
    expect(['eur', 'JPY', 'krw', 'bhd', 'huf', 'isk'].map(minorDigits)).toEqual([2, 0, 0, 3, 2, 2]);
    // Stripe counts forints in hundredths, though they're shown whole.
    expect(priceAmount({ amount: 250000, currency: 'huf' })).toBe('HUF\u00a02,500');
    expect(priceAmount({ amount: 600, currency: 'eur' })).toBe('€6');
    expect(priceAmount({ amount: 650, currency: 'eur' })).toBe('€6.50');
    // Yen and won have no smaller unit: ¥980 is 980, never ¥9.80.
    expect(priceAmount({ amount: 980, currency: 'jpy' })).toBe('¥980');
    expect(priceAmount({ amount: 9900, currency: 'krw' })).toBe('₩9,900');
    // Bahrain's dinar has three (Intl puts a no-break space after its code).
    expect(priceAmount({ amount: 2500, currency: 'bhd' })).toBe('BHD\u00a02.500');
    expect(priceText({ plan: 'pro', interval: 'year', amount: 6000, currency: 'eur' })).toBe(
      '€60 a year',
    );
  });

  it('says where a subscription stands', () => {
    const base = {
      plan: 'pro' as const,
      interval: 'month' as const,
      status: 'active',
      periodEnd: '2026-10-23T14:00:00.000Z',
      cancelAtPeriodEnd: false,
      amount: 600,
      currency: 'eur',
    };
    expect(subscriptionLine(base, 'Europe/Berlin')).toBe('Renews on October 23, 2026.');
    expect(subscriptionLine({ ...base, cancelAtPeriodEnd: true }, 'Europe/Berlin')).toBe(
      'Ends on October 23, 2026.',
    );
    expect(subscriptionLine({ ...base, status: 'past_due' }, 'Europe/Berlin')).toMatch(
      /^A payment didn’t go through/,
    );
    expect(subscriptionLine({ ...base, status: 'trialing', periodEnd: null }, 'UTC')).toBe(
      'In a free trial.',
    );
  });
});
