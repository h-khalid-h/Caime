import { describe, expect, it } from 'vitest';
import { CALLING_CODES } from './calling-codes';
import { countryFacts, currencyOfCountry, defaultWorkweek, varietyOfCountry } from './countries';
import { COUNTRY_DATA, WORLD } from './countries-data';
import { CURRENCY_DECIMALS } from './currency-data';
import { minorUnits, roundAmount } from './format';

describe('what a country sets (R76)', () => {
  it('Egypt: pounds, a week that starts on Saturday, Friday and Saturday off, Sunday to Thursday worked, a 12-hour clock, Egyptian Arabic', () => {
    expect(countryFacts('EG')).toMatchObject({
      code: 'EG',
      currency: 'EGP',
      weekStart: 6,
      weekend: [5, 6],
      workweek: [0, 1, 2, 3, 4],
      hour12: true,
      variety: 'egyptian',
    });
    expect(countryFacts('EG').payKinds[0]).toEqual({ kind: 'wallet', label: 'InstaPay' });
  });

  it('France and the world: euros, Monday first, Saturday and Sunday off, Monday to Friday, a 24-hour clock', () => {
    expect(countryFacts('FR')).toMatchObject({
      currency: 'EUR',
      weekStart: 1,
      weekend: [6, 0],
      workweek: [1, 2, 3, 4, 5],
      hour12: false,
      variety: null,
    });
    expect(countryFacts('fr').code).toBe('FR');
    // Nowhere in particular: the world's defaults, and no currency.
    expect(countryFacts(null)).toMatchObject({
      code: null,
      currency: null,
      weekStart: WORLD.firstDay,
      weekend: [...WORLD.weekend],
      workweek: [1, 2, 3, 4, 5],
      hour12: WORLD.hour12,
      payKinds: [
        { kind: 'bank', label: 'Bank transfer' },
        { kind: 'cash', label: 'Cash' },
      ],
    });
  });

  it('the week worked follows the weekend, in the week’s own order, unless the country works otherwise', () => {
    // Saudi Arabia: Sunday first, Friday and Saturday off.
    expect(countryFacts('SA').workweek).toEqual([0, 1, 2, 3, 4]);
    // The United States: Sunday first, the weekend as the world's, so Monday to Friday.
    expect(countryFacts('US')).toMatchObject({
      weekStart: 0,
      workweek: [1, 2, 3, 4, 5],
      hour12: true,
    });
    // Afghanistan: Saturday first, Thursday and Friday off: Saturday to Wednesday, in that order.
    expect(countryFacts('AF').workweek).toEqual([6, 0, 1, 2, 3]);
    // Iran: Friday off and Thursday a half day, so Saturday to Wednesday too.
    expect(countryFacts('IR').workweek).toEqual([6, 0, 1, 2, 3]);
    // Nepal: Saturday alone off, Sunday to Friday worked.
    expect(countryFacts('NP')).toMatchObject({ weekend: [6], workweek: [0, 1, 2, 3, 4, 5] });
    expect(defaultWorkweek('EG')).toEqual([0, 1, 2, 3, 4]);
    expect(defaultWorkweek(undefined)).toEqual([1, 2, 3, 4, 5]);
  });

  it('currencies and their minor units come from one table each', () => {
    expect(currencyOfCountry('QA')).toBe('QAR');
    expect(currencyOfCountry('CA')).toBe('CAD');
    expect(currencyOfCountry('AQ')).toBeNull();
    expect(currencyOfCountry(null)).toBeNull();
    expect(CURRENCY_DECIMALS.KWD).toBe(3);
    expect(CURRENCY_DECIMALS.JPY).toBe(0);
    expect(minorUnits('KWD')).toBe(3);
    expect(minorUnits('EGP')).toBe(2);
    expect(roundAmount(12.3456, 'KWD')).toBe(12.346);
    expect(roundAmount(1234.5, 'JPY')).toBe(1235);
    // Every country with a currency names one that's three capital letters.
    for (const [code, d] of Object.entries(COUNTRY_DATA))
      if (d.c) expect(d.c, code).toMatch(/^[A-Z]{3}$/);
  });

  it('the Arabic spoken there, and the ways people are paid', () => {
    expect(varietyOfCountry('SA')).toBe('gulf');
    expect(varietyOfCountry('LB')).toBe('levantine');
    expect(varietyOfCountry('FR')).toBeNull();
    expect(countryFacts('SA').payKinds.map((p) => p.label)).toEqual(['STC Pay', 'IBAN', 'Cash']);
    // An IBAN country without ways of its own listed still asks for an IBAN.
    expect(countryFacts('DE').payKinds.map((p) => p.label)).toEqual(['IBAN', 'Cash']);
    expect(countryFacts('NG').payKinds.map((p) => p.label)).toEqual(['Bank transfer', 'Cash']);
  });

  it('calling codes: the digits after +, with the area code where +1 is shared', () => {
    expect(CALLING_CODES.EG).toBe('20');
    expect(CALLING_CODES.SA).toBe('966');
    expect(CALLING_CODES.US).toBe('1');
    expect(CALLING_CODES.JM).toBe('1876');
    expect(CALLING_CODES.XK).toBe('383');
    for (const [code, digits] of Object.entries(CALLING_CODES)) {
      expect(code).toMatch(/^[A-Z]{2}$/);
      expect(digits, code).toMatch(/^\d{1,4}$/);
    }
  });
});
