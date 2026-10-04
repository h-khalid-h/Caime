/**
 * Every English string the interface is written in has its Arabic (R54): this fails for a new
 * `tr('…')` without an entry in `locales/ar.ts`, and for an entry nothing uses any more.
 * `node scripts/i18n-keys.mjs missing ar` lists what's missing.
 */
import { describe, expect, it } from 'vitest';
import { collectKeys, keysFor } from '../../../scripts/i18n-keys.mjs';
import { ar } from './locales/ar';

describe('the Arabic catalog (R54)', () => {
  // The public site's own strings are the server's catalog (apps/server/test/site-i18n.test.ts).
  const keys = keysFor(collectKeys(), false) as Map<string, { text: string; plural: boolean }>;

  it('has every string the code shows', () => {
    const missing = [...keys.values()].filter((k) => !(k.text in ar)).map((k) => k.text);
    expect(missing).toEqual([]);
  });

  it('has the plural forms where a count is shown, and a string elsewhere', () => {
    const wrong = [...keys.values()]
      .filter((k) => k.text in ar)
      .filter((k) => (typeof ar[k.text] === 'string') === k.plural)
      .map((k) => k.text);
    expect(wrong).toEqual([]);
    for (const [key, value] of Object.entries(ar)) {
      if (typeof value === 'string') continue;
      expect(value.other, key).toBeTruthy();
    }
  });

  it('keeps nothing the code no longer says', () => {
    const stale = Object.keys(ar).filter((k) => !keys.has(k));
    expect(stale).toEqual([]);
  });

  it('keeps every placeholder of the English', () => {
    const bad: string[] = [];
    for (const [key, value] of Object.entries(ar)) {
      const wanted = new Set(key.match(/\{\w+\}/g) ?? []);
      const forms = typeof value === 'string' ? [value] : Object.values(value);
      for (const form of forms)
        for (const w of wanted)
          if (!form.includes(w) && !(w === '{n}' && typeof value !== 'string'))
            bad.push(`${key} → ${form}`);
    }
    expect(bad).toEqual([]);
  });
});
