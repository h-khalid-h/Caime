/**
 * What only the server says (R54) is the server's own catalog: every string `apps/server/src`
 * alone says (the public site's pages, a notification's words, a refusal) has its Arabic in
 * `locales/ar-server.ts` and its French in `fr-server.ts`, nothing stale stays, and placeholders
 * survive translation. `node scripts/i18n-keys.mjs missing ar server` lists what's missing.
 */
import { ar } from '@caime/core/locales/ar';
import { fr } from '@caime/core/locales/fr';
import { turkish } from '@caime/core/locales/tr';
import { describe, expect, it } from 'vitest';
import { collectKeys, keysFor } from '../../../scripts/i18n-keys.mjs';
import { arServer } from '../src/locales/ar-server';
import { frServer } from '../src/locales/fr-server';
import { turkishServer } from '../src/locales/tr-server';

describe.each([
  ['Arabic (R54)', arServer, ar],
  ['French (R55)', frServer, fr],
  ['Turkish (R59)', turkishServer, turkish],
])('the server’s %s catalog', (_name, arSite, ar) => {
  const keys = keysFor(collectKeys(), true) as Map<string, { text: string; plural: boolean }>;

  it('has every string the server alone says, with plural forms where it counts', () => {
    expect(keys.size).toBeGreaterThan(300);
    const missing = [...keys.values()].filter((k) => !(k.text in arSite)).map((k) => k.text);
    expect(missing).toEqual([]);
    const wrong = [...keys.values()]
      .filter((k) => k.text in arSite)
      .filter((k) => (typeof arSite[k.text] === 'string') === k.plural)
      .map((k) => k.text);
    expect(wrong).toEqual([]);
  });

  it('keeps nothing the server no longer says, and nothing the app’s catalog already has', () => {
    const stale = Object.keys(arSite).filter((k) => !keys.has(k));
    expect(stale).toEqual([]);
    // A string the app shows too is the app's: one place for one string.
    expect(Object.keys(arSite).filter((k) => k in ar)).toEqual([]);
  });

  it('keeps every placeholder of the English', () => {
    const bad: string[] = [];
    for (const [key, value] of Object.entries(arSite)) {
      const wanted = key.match(/\{\w+\}/g) ?? [];
      const forms = typeof value === 'string' ? [value] : Object.values(value);
      for (const form of forms)
        for (const w of wanted)
          if (!form.includes(w) && !(w === '{n}' && typeof value !== 'string'))
            bad.push(`${key} → ${form}`);
    }
    expect(bad).toEqual([]);
  });
});
