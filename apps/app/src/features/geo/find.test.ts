import { describe, expect, it } from 'vitest';
import { countryMatches, flagOf, folded, wordsMatch } from './find';

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
    expect(folded('Côte d’Ivoire')).toBe('cote divoire');
    expect(countryMatches(ci, 'cote')).toBe(true);
    expect(countryMatches(ci, 'ivoire')).toBe(true);
    expect(countryMatches(ci, 'CÔTE')).toBe(true);
  });

  it('as it’s written, with dots and apostrophes or without', () => {
    const lucia = { code: 'LC', name: 'St. Lucia' };
    const usvi = { code: 'VI', name: 'U.S. Virgin Islands' };
    expect(countryMatches(lucia, 'St. Lucia')).toBe(true);
    expect(countryMatches(lucia, 'St. L')).toBe(true);
    expect(countryMatches(lucia, 'st lucia')).toBe(true);
    expect(countryMatches(lucia, 'lucia')).toBe(true);
    expect(countryMatches(usvi, 'U.S. Virgin')).toBe(true);
    expect(countryMatches(usvi, 'us virgin')).toBe(true);
    // A keyboard's straight apostrophe finds ICU's curly one, and the other way round.
    expect(countryMatches(ci, "Cote d'Ivoire")).toBe(true);
    expect(countryMatches(ci, "d'iv")).toBe(true);
    expect(countryMatches({ code: 'XX', name: "Cote d'Ivoire" }, 'côte d’ivoire')).toBe(true);
    // Initials skip what isn't a word.
    expect(countryMatches({ code: 'BA', name: 'Bosnia & Herzegovina' }, 'bh')).toBe(true);
  });

  it('in Arabic as people type it, without hamza or madda', () => {
    const de = { code: 'DE', name: 'ألمانيا' };
    const jo = { code: 'JO', name: 'الأردن' };
    const ae = { code: 'AE', name: 'الإمارات العربية المتحدة' };
    expect(countryMatches(de, 'المانيا')).toBe(true);
    expect(countryMatches(jo, 'الاردن')).toBe(true);
    expect(countryMatches(ae, 'الامارات')).toBe(true);
    expect(countryMatches(ae, 'العربيه')).toBe(true);
    expect(countryMatches({ code: 'MA', name: 'المغرب' }, 'الأردن')).toBe(false);
  });

  it('with its flag, from its two letters', () => {
    expect(flagOf('EG')).toBe('🇪🇬');
    expect(flagOf('GB')).toBe('🇬🇧');
    expect(flagOf('eg')).toBe('');
    expect(flagOf('419')).toBe('');
  });
});

describe('finding by several words', () => {
  it('every word typed starts a word of the name, the code or the zone', () => {
    const ny = ['New York', 'United States · GMT-4', 'America/New_York'];
    expect(wordsMatch(ny, 'new york')).toBe(true);
    expect(wordsMatch(ny, 'new y')).toBe(true);
    expect(wordsMatch(ny, 'york new')).toBe(true);
    expect(wordsMatch(ny, 'united st')).toBe(true);
    expect(wordsMatch(ny, 'america/new')).toBe(true);
    expect(wordsMatch(ny, 'new jersey')).toBe(false);
    expect(wordsMatch(['EGP', 'Egyptian Pound'], 'egyptian p')).toBe(true);
    expect(wordsMatch(['USD', 'US Dollar'], 'us d')).toBe(true);
    expect(wordsMatch(['USD', 'US Dollar'], 'u.s. dollar')).toBe(true);
    expect(wordsMatch(['EGP', 'Egyptian Pound'], '')).toBe(true);
    expect(wordsMatch(['EGP', 'Egyptian Pound'], 'ptian')).toBe(false);
  });
});
