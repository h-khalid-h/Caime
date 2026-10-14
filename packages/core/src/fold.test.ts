import { describe, expect, it } from 'vitest';
import { finds, foldArabic, foldForFind } from './fold';

describe('finding what was typed in a list (R88)', () => {
  it('reads Arabic as it is folded: any alef, "ى" as "ي", "ة" as "ه", no marks', () => {
    expect(foldArabic('أحمد')).toBe('احمد');
    expect(foldArabic('مُصْطَفى')).toBe('مصطفي');
    expect(foldArabic('فاطمة')).toBe('فاطمه');
    expect(finds('احمد', 'أحمد علي')).toBe(true);
    expect(finds('فاطمه', 'فاطمة')).toBe(true);
    expect(finds('ليلى', 'ليلي حسن')).toBe(true);
  });

  it('ignores case and accents in Latin letters', () => {
    expect(foldForFind('Élodie')).toBe('elodie');
    expect(finds('elodie', 'Élodie Martin')).toBe(true);
    expect(finds('GÜL', 'Gülsüm')).toBe(true);
    expect(finds('cafe', 'Café du coin')).toBe(true);
  });

  it('finds a handle with or without its @, among several values', () => {
    expect(finds('@noor', 'Noor Haddad', 'noor.h')).toBe(true);
    expect(finds('noor.h', null, undefined, 'noor.h')).toBe(true);
    expect(finds('karim', 'Noor Haddad', 'noor.h')).toBe(false);
  });

  it('finds everything when nothing is typed', () => {
    expect(finds('', 'anything')).toBe(true);
    expect(finds('   ')).toBe(true);
    expect(finds('@')).toBe(true);
  });

  it('finds nothing in empty values', () => {
    expect(finds('a', null, undefined, '')).toBe(false);
  });
});
