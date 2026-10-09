import { describe, expect, it } from 'vitest';
import { arabicVariety, varietyOfCountry, writtenVariety } from './arabic-variety';

describe('the Arabic someone writes in (R72)', () => {
  it.each([
    ['انت ممكن تساعدنى اذاى', 'egyptian'],
    ['ازيك عامل ايه', 'egyptian'],
    ['انا عايز اعرف ايه اللي مستني مني النهارده', 'egyptian'],
    ['هو فين الملف بتاع الاجتماع؟', 'egyptian'],
    ['شلونك؟ وش عندي اليوم', 'gulf'],
    ['ابغى اعرف وش المطلوب مني الحين', 'gulf'],
    ['شو عندي اليوم؟', 'levantine'],
    ['بدي اعرف شو المطلوب مني هلق', 'levantine'],
    ['كيفكن؟ منيح هيك', 'levantine'],
    ['شكو ماكو اليوم', 'iraqi'],
    ['واش كاين شي حاجة ديالي اليوم؟', 'maghrebi'],
    ['بغيت نعرف علاش', 'maghrebi'],
  ])('%s → %s', (text, variety) => {
    expect(writtenVariety(text)).toBe(variety);
  });

  it('is nobody’s for Standard Arabic, a greeting everyone says, or a mix', () => {
    for (const text of [
      'ماذا أنتظر؟',
      'من ينتظرني؟',
      'السلام عليكم',
      'مرحبا',
      'شكرا جزيلا',
      // A hobby, "just now", "no problem", "countries": words that fold like a dialect's.
      'هوايتي القراءة',
      'وصلت توًّا',
      'لا بأس',
      'زرت دول الخليج',
      // As much of one as of another.
      'شو ازاي',
      'hello',
      '',
    ])
      expect([text, writtenVariety(text)]).toEqual([text, null]);
  });
});

describe('the Arabic spoken where someone lives', () => {
  it('knows the Arab countries, and nowhere else', () => {
    expect(varietyOfCountry('EG')).toBe('egyptian');
    expect(varietyOfCountry('sa')).toBe('gulf');
    expect(varietyOfCountry('AE')).toBe('gulf');
    expect(varietyOfCountry('LB')).toBe('levantine');
    expect(varietyOfCountry('JO')).toBe('levantine');
    expect(varietyOfCountry('IQ')).toBe('iraqi');
    expect(varietyOfCountry('MA')).toBe('maghrebi');
    expect(varietyOfCountry('SD')).toBe('sudanese');
    expect(varietyOfCountry('YE')).toBe('yemeni');
    expect(varietyOfCountry('US')).toBeNull();
    expect(varietyOfCountry(null)).toBeNull();
  });
});

describe('the Arabic to speak with someone', () => {
  it('is theirs by choice, then by what they write, then where they live, then the standard', () => {
    // Someone in Egypt is answered in Egyptian Arabic...
    expect(arabicVariety({ country: 'EG' })).toBe('egyptian');
    expect(arabicVariety({ country: 'EG', written: 'ماذا لدي اليوم؟' })).toBe('egyptian');
    // ...unless they write in another...
    expect(arabicVariety({ country: 'EG', written: 'شو عندي اليوم؟' })).toBe('levantine');
    // ...or chose one.
    expect(arabicVariety({ choice: 'standard', country: 'EG', written: 'عندي ايه النهارده' })).toBe(
      'standard',
    );
    expect(arabicVariety({ choice: 'gulf', country: 'EG' })).toBe('gulf');
    expect(arabicVariety({ choice: 'auto', country: 'SA' })).toBe('gulf');
    // Anywhere else, the standard, unless they write in a dialect.
    expect(arabicVariety({ country: 'FR' })).toBe('standard');
    expect(arabicVariety({ country: 'FR', written: 'عامل ايه' })).toBe('egyptian');
    expect(arabicVariety({})).toBe('standard');
  });
});
