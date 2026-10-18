/**
 * Every English string the interface is written in has its Arabic (R54) its French (R55) and its Turkish (R59):
 * this fails for a new `tr('…')` without an entry in `locales/ar.ts` or `locales/fr.ts`, and
 * for an entry nothing uses any more. `node scripts/i18n-keys.mjs missing <lang>` lists them.
 */
import { describe, expect, it } from 'vitest';
import { collectKeys, keysFor } from '../../../scripts/i18n-keys.mjs';
import { isGenderForms, isReaderForms } from './i18n';
import { ar } from './locales/ar';
import { arA } from './locales/ar-a';
import { arB } from './locales/ar-b';
import { fr } from './locales/fr';
import { turkish } from './locales/tr';
import { tagsOf } from './tagged';

describe.each([
  ['Arabic (R54)', ar],
  ['French (R55)', fr],
  ['Turkish (R59)', turkish],
])('the %s catalog', (_name, ar) => {
  // What only the server says is the server's catalog (apps/server/test/server-i18n.test.ts).
  const keys = keysFor(collectKeys(), false) as Map<string, { text: string; plural: boolean }>;

  it('has every string the code shows', () => {
    const missing = [...keys.values()].filter((k) => !(k.text in ar)).map((k) => k.text);
    expect(missing).toEqual([]);
  });

  it('has the plural forms where a count is shown, and a string or gender forms elsewhere', () => {
    const wrong = [...keys.values()]
      .filter((k) => k.text in ar)
      .filter((k) => {
        const entry = ar[k.text];
        const plural = typeof entry !== 'string' && !isGenderForms(entry) && !isReaderForms(entry);
        return plural !== k.plural;
      })
      .map((k) => k.text);
    expect(wrong).toEqual([]);
    for (const [key, value] of Object.entries(ar)) {
      if (typeof value === 'string') continue;
      expect(value.other, key).toBeTruthy();
      // Forms by gender (R81): all three, each its own words.
      if (isGenderForms(value)) {
        expect(value.woman, key).toBeTruthy();
        expect(value.man, key).toBeTruthy();
      }
      if (isReaderForms(value)) {
        expect(value.toWoman, key).toBeTruthy();
        expect(value.toMan, key).toBeTruthy();
      }
    }
  });

  it('keeps nothing the code no longer says', () => {
    const stale = Object.keys(ar).filter((k) => !keys.has(k));
    expect(stale).toEqual([]);
  });

  it('keeps every placeholder of the English, and names none it doesn’t', () => {
    const bad: string[] = [];
    for (const [key, value] of Object.entries(ar)) {
      const wanted = new Set(key.match(/\{\w+\}/g) ?? []);
      const plural = typeof value !== 'string';
      const forms = typeof value === 'string' ? [value] : Object.values(value);
      for (const form of forms) {
        for (const w of wanted)
          if (!form.includes(w) && !(w === '{n}' && plural)) bad.push(`${key} → ${form}`);
        // A placeholder the English doesn't fill is shown as written (M16 D4).
        for (const w of form.match(/\{\w+\}/g) ?? [])
          if (!wanted.has(w) && !(w === '{n}' && plural)) bad.push(`${key} → ${form}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('keeps the tags of a sentence with links in it, in its own order', () => {
    const bad = Object.entries(ar)
      .filter(([key, value]) => typeof value === 'string' && key.includes('</'))
      .filter(
        ([key, value]) =>
          [...tagsOf(key)].sort().join() !== [...tagsOf(value as string)].sort().join(),
      )
      .map(([key]) => key);
    expect(bad).toEqual([]);
  });
});

// The app fetches Arabic in two halves side by side; a string in both is downloaded twice, and
// the second hides the first (M16 D4: a renamed key once landed beside its twin).
it('keeps each Arabic string in one half', () => {
  expect(Object.keys(arA).filter((k) => k in arB)).toEqual([]);
});
