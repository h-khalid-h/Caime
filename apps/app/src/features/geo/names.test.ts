import { describe, expect, it } from 'vitest';
import { namesOf } from './names';

describe('a language by name', () => {
  it('as the list names it', () => {
    expect(namesOf('de-DE')).toEqual({
      native: 'Deutsch (Deutschland)',
      english: 'German (Germany)',
    });
  });

  it('for a tag the list doesn’t have, never the bare tag', () => {
    const de = namesOf('de');
    expect(de.native).toBe('Deutsch');
    expect(de.english).toBe('German');
    expect(namesOf('en-EG').english).toMatch(/^English/);
    expect(namesOf('en-EG').native).not.toBe('en-EG');
  });

  it('where the runtime names no languages, from the list and the region’s code', () => {
    const intl = Intl as { DisplayNames?: unknown };
    const named = intl.DisplayNames;
    try {
      intl.DisplayNames = undefined;
      expect(namesOf('en-EG')).toEqual({ native: 'English (EG)', english: 'English (EG)' });
      // The language, not the first of its varieties ("Austrian German", "Brazilian Portuguese").
      expect(namesOf('de')).toEqual({ native: 'Deutsch', english: 'German' });
      expect(namesOf('pt-AO')).toEqual({ native: 'português (AO)', english: 'Portuguese (AO)' });
      expect(namesOf('es-CO').native).toBe('español (CO)');
      expect(namesOf('xx-YY')).toEqual({ native: 'xx-YY', english: 'xx-YY' });
    } finally {
      intl.DisplayNames = named;
    }
  });
});
