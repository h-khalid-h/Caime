import { existsSync, readFileSync } from 'node:fs';
import { fonts, typeScale } from '@caime/brand/tokens';
import { describe, expect, it } from 'vitest';
import { fontFace } from './fonts.web';

/**
 * The shell's faces (`pnpm fonts` writes them from Fontsource's cuts): each typeface declared
 * once by weight, as the server's pages read them too, and Arabic (R73) under the same two
 * names, by the letters it draws, so the browser picks the Arabic face for Arabic and nothing
 * else downloads it.
 */
const shell = readFileSync(new URL('../../public/index.html', import.meta.url), 'utf8');
const faces = [...shell.matchAll(/@font-face\s*{([^}]*)}/g)].map(([, rule]) => ({
  family: /font-family:\s*'([^']+)'/.exec(rule ?? '')?.[1],
  weight: Number(/font-weight:\s*(\d+)/.exec(rule ?? '')?.[1]),
  file: /url\(\/fonts\/([^)]+)\)/.exec(rule ?? '')?.[1] ?? '',
  range: /unicode-range:\s*([^;]+)/.exec(rule ?? '')?.[1] ?? '',
}));

const ARABIC = /\bU\+0600-06FF\b/;
const LATIN = /\bU\+0000-00FF\b/;
const LATIN_EXT = /\bU\+0100-02BA\b/;

describe('the web’s faces', () => {
  it('are the brand’s two families, from files the app ships', () => {
    expect(new Set(faces.map((f) => f.family))).toEqual(new Set([fonts.body, fonts.heading]));
    for (const { file } of faces)
      expect(existsSync(new URL(`../../public/fonts/${file}`, import.meta.url)), file).toBe(true);
  });

  it('cover every style of the type scale at its own weight, in Latin, its extension and Arabic', () => {
    for (const [name, style] of Object.entries(typeScale)) {
      if (style.family === 'mono') continue;
      const { fontFamily, fontWeight } = fontFace(style.family, style.weight);
      const mine = faces.filter((f) => f.family === fontFamily && String(f.weight) === fontWeight);
      // Latin for English and French, its extension for Turkish (ğ, ı, ş) and œ, Arabic for Arabic.
      for (const [letters, range] of [
        ['latin', LATIN],
        ['latin-ext', LATIN_EXT],
        ['arabic', ARABIC],
      ] as const)
        expect(
          mine.some((f) => range.test(f.range)),
          `${name}: ${fontFamily} ${fontWeight} ${letters}`,
        ).toBe(true);
    }
  });

  it('declare Arabic as the paired faces, never a Latin file', () => {
    for (const f of faces.filter((f) => ARABIC.test(f.range)))
      expect(f.file, f.file).toMatch(/^(noto-sans-arabic|baloo-bhaijaan-2)-arabic-/);
  });
});
