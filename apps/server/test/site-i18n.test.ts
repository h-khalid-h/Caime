/**
 * The public site's Arabic (R54) is the server's own catalog: every string `lib/site-pages.ts`
 * alone says has its Arabic in `locales/ar-site.ts`, nothing stale stays, and placeholders
 * survive translation. `node scripts/i18n-keys.mjs missing ar site` lists what's missing.
 */
import { ar } from '@caime/core/locales/ar';
import { describe, expect, it } from 'vitest';
import { collectKeys, keysFor } from '../../../scripts/i18n-keys.mjs';
import { arSite } from '../src/locales/ar-site';

describe('the site’s Arabic catalog (R54)', () => {
  const keys = keysFor(collectKeys(), true) as Map<string, { text: string; plural: boolean }>;

  it('has every string the site shows, as strings (the site counts nothing with trn)', () => {
    expect(keys.size).toBeGreaterThan(200);
    const missing = [...keys.values()].filter((k) => !(k.text in arSite)).map((k) => k.text);
    expect(missing).toEqual([]);
    const plural = [...keys.values()].filter((k) => k.plural).map((k) => k.text);
    expect(plural).toEqual([]);
    for (const [key, value] of Object.entries(arSite)) expect(typeof value, key).toBe('string');
  });

  it('keeps nothing the site no longer says, and nothing the app’s catalog already has', () => {
    const stale = Object.keys(arSite).filter((k) => !keys.has(k));
    expect(stale).toEqual([]);
    // A string the app shows too is the app's: one place for one string.
    expect(Object.keys(arSite).filter((k) => k in ar)).toEqual([]);
  });

  it('keeps every placeholder of the English', () => {
    const bad: string[] = [];
    for (const [key, value] of Object.entries(arSite)) {
      const wanted = key.match(/\{\w+\}/g) ?? [];
      for (const w of wanted) if (!String(value).includes(w)) bad.push(`${key} → ${value}`);
    }
    expect(bad).toEqual([]);
  });
});
