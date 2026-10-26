/**
 * The store listings (R120, docs/STORES.md): the App Store's in `store.config.json` (EAS Metadata)
 * and Google Play's in `store/play/<locale>/` (the layout Play's upload tools read), the same words
 * in both, every interface language in each, inside each store's limits, and nothing a review
 * refuses: no price or way to buy (the phone apps sell nothing, `sellsHere`), and no other app's
 * name (App Store 2.3.7).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..', '..');
const apple = JSON.parse(readFileSync(join(root, 'store.config.json'), 'utf8')).apple as {
  categories: string[];
  info: Record<
    string,
    {
      title: string;
      subtitle: string;
      description: string;
      keywords: string[];
      marketingUrl: string;
      supportUrl: string;
      privacyPolicyUrl: string;
    }
  >;
};
/** The App Store's locale, and Google Play's for the same language. */
const LOCALES = { 'en-US': 'en-US', 'ar-SA': 'ar', 'fr-FR': 'fr-FR', tr: 'tr-TR' } as const;
const play = (dir: string, file: string) =>
  readFileSync(join(root, 'store', 'play', dir, file), 'utf8').trimEnd();

describe('the store listings (R120)', () => {
  it('say the same in both stores, in every interface language, within each store’s limits', () => {
    expect(Object.keys(apple.info).sort()).toEqual(Object.keys(LOCALES).sort());
    for (const [locale, dir] of Object.entries(LOCALES)) {
      const a = apple.info[locale];
      if (!a) throw new Error(locale);
      expect(a.title, locale).toBe('Caime');
      expect(a.subtitle.length, locale).toBeLessThanOrEqual(30);
      expect(a.description.length, locale).toBeLessThanOrEqual(4000);
      expect(a.keywords.join(',').length, locale).toBeLessThanOrEqual(100);
      expect(play(dir, 'title.txt'), locale).toBe('Caime');
      expect(play(dir, 'short_description.txt').length, locale).toBeLessThanOrEqual(80);
      expect(play(dir, 'full_description.txt'), locale).toBe(a.description);
      for (const url of [a.marketingUrl, a.supportUrl, a.privacyPolicyUrl])
        expect(url, locale).toMatch(/^https:\/\/cai\.me(\/|$)/);
    }
    expect(apple.categories[0]).toBe('SOCIAL_NETWORKING');
  });

  it('sell nothing and name no other app', () => {
    for (const [locale, dir] of Object.entries(LOCALES)) {
      const a = apple.info[locale];
      if (!a) throw new Error(locale);
      const words = [
        a.subtitle,
        a.description,
        a.keywords.join(' '),
        play(dir, 'short_description.txt'),
      ].join(' ');
      expect(words, locale).not.toMatch(/[€$£]|\bPro\b|\bBusiness plan\b|subscri/i);
      expect(words, locale).not.toMatch(/whatsapp|telegram|signal|messenger by|imessage|slack/i);
    }
  });
});
