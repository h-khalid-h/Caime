import { describe, expect, it } from 'vitest';
import { countryMatches, flagOf, folded } from './find';

const eg = { code: 'EG', name: 'Egypt' };
const uk = { code: 'GB', name: 'United Kingdom' };
const ae = { code: 'AE', name: 'United Arab Emirates' };
const ci = { code: 'CI', name: 'Côte d’Ivoire' };
const kr = { code: 'KR', name: 'South Korea' };

describe('finding a country', () => {
  it('by the start of any word of its name, its initials or its code', () => {
    expect(countryMatches(eg, 'egy')).toBe(true);
    expect(countryMatches(eg, 'EG')).toBe(true);
    expect(countryMatches(uk, 'kingdom')).toBe(true);
    expect(countryMatches(uk, 'uk')).toBe(true);
    expect(countryMatches(uk, 'U.K.')).toBe(true);
    expect(countryMatches(ae, 'uae')).toBe(true);
    expect(countryMatches(kr, 'korea')).toBe(true);
    expect(countryMatches(eg, '')).toBe(true);
    // Not the middle of a word: "gyp" isn't how anyone starts typing Egypt.
    expect(countryMatches(eg, 'gyp')).toBe(false);
    expect(countryMatches(uk, 'u')).toBe(true);
    expect(countryMatches(eg, 'u')).toBe(false);
  });

  it('whatever the accents or case', () => {
    expect(folded('Côte d’Ivoire')).toBe('cote d’ivoire');
    expect(countryMatches(ci, 'cote')).toBe(true);
    expect(countryMatches(ci, 'ivoire')).toBe(true);
    expect(countryMatches(ci, 'CÔTE')).toBe(true);
  });

  it('with its flag, from its two letters', () => {
    expect(flagOf('EG')).toBe('🇪🇬');
    expect(flagOf('GB')).toBe('🇬🇧');
    expect(flagOf('eg')).toBe('');
    expect(flagOf('419')).toBe('');
  });
});
