/** The handle engine's acceptance tests (docs/HANDLES.md §11), the parts that are its own. */
import { describe, expect, it } from 'vitest';
import {
  CANDIDATES_MAX,
  handleSkeleton,
  hasHandleLetters,
  isGenericHandle,
  orgCandidates,
  personCandidates,
} from './handle-engine';
import { handleError } from './rules';
import { isReservedHandle } from './schemas';

describe('people', () => {
  it('Hussein Khalid gets hussein.khalid first, then the other readings of the same name', () => {
    expect(personCandidates({ displayName: 'Hussein Khalid' })).toEqual([
      'hussein.khalid',
      'husseinkhalid',
      'h.khalid',
      'hussein_khalid',
      'hussein',
    ]);
  });
  it('is the same for the same name in any case or spacing, and every candidate is a valid handle', () => {
    const a = personCandidates({ displayName: 'Hussein Khalid' });
    expect(personCandidates({ displayName: '  HUSSEIN   khalid ' })).toEqual(a);
    for (const h of a) expect(handleError(h)).toBeNull();
    expect(a.length).toBeLessThanOrEqual(CANDIDATES_MAX);
  });
  it('invents no family name for someone with one name', () => {
    expect(personCandidates({ displayName: 'Madonna' })).toEqual(['madonna']);
  });
  it('keeps a compound family name together in at least one candidate', () => {
    expect(personCandidates({ displayName: 'Omar El Masry' })).toContain('omar.elmasry');
    expect(personCandidates({ displayName: 'Ahmed Abdel Rahman' })).toContain('ahmed.abdel.rahman');
    expect(personCandidates({ displayName: 'Lotte van der Berg' })).toContain('lotte.vanderberg');
  });
  it('takes accents off and never puts a date, a year or a gender in', () => {
    expect(personCandidates({ displayName: 'José Núñez' })[0]).toBe('jose.nunez');
    for (const h of personCandidates({ displayName: 'Sara Ahmed 1990' }))
      expect(h).not.toMatch(/\d/);
  });
  it('guesses nothing from another script: it asks for the Latin spelling', () => {
    expect(hasHandleLetters('حسين خالد')).toBe(false);
    expect(personCandidates({ displayName: 'حسين خالد' })).toEqual([]);
    expect(personCandidates({ displayName: 'حسين خالد', latinName: 'Hussein Khalid' })[0]).toBe(
      'hussein.khalid',
    );
  });
});

describe('organizations', () => {
  it('prefers the brand to its longer registered name, and leaves the legal form out', () => {
    const c = orgCandidates({ name: 'Macrocare', legalName: 'Macrocare Medical Tourism LLC' });
    expect(c[0]).toBe('macrocare');
    expect(c).toContain('macrocare.medical');
    expect(c).toContain('macrocaremedicaltourism');
    expect(c.join(' ')).not.toMatch(/llc/);
  });
  it('drops an Egyptian or German legal form and any number', () => {
    expect(orgCandidates({ name: 'Nile Dental S.A.E.' })[0]).toBe('niledental');
    expect(orgCandidates({ name: 'Müller GmbH 2019' })[0]).toBe('muller');
    // A brand's own short number stays; a generic word with a number is still generic.
    expect(orgCandidates({ name: 'Studio 54' })).toEqual([]);
    expect(orgCandidates({ name: 'Forever 21', legalName: 'Forever 21 Inc 88123' })[0]).toBe(
      'forever21',
    );
  });
  it('reads "&" as a separator', () => {
    expect(orgCandidates({ name: 'ACME & Sons' })).toContain('acme.sons');
  });
});

describe('what nobody may make', () => {
  it('a handle of generic words alone is kept for Caime; a real name beside one is fine', () => {
    for (const h of [
      'customers',
      'best.team',
      'the_family',
      'employees',
      'vendor',
      'top1',
      'support.team',
      'admin1',
    ])
      expect([h, isGenericHandle(h), isReservedHandle(h)]).toEqual([h, true, true]);
    for (const h of ['macrocare.medical', 'nour.family', 'hussein.khalid'])
      expect([h, isGenericHandle(h), isReservedHandle(h)]).toEqual([h, false, false]);
  });
  it('lookalikes share a skeleton', () => {
    const s = handleSkeleton('macrocare');
    for (const h of ['macro.care', 'macro_care', 'rnacrocare', 'macr0care', 'MacroCare'])
      expect(handleSkeleton(h)).toBe(s);
    expect(handleSkeleton('macrocares')).not.toBe(s);
  });
  it('a separator at either end, or two together, is refused', () => {
    for (const h of ['.sara', 'sara.', 'sa..ra', 'sa._ra']) expect(handleError(h)).not.toBeNull();
  });
});
