import { existsSync, readFileSync } from 'node:fs';
import { fonts, typeScale } from '@caime/brand/tokens';
import { describe, expect, it } from 'vitest';
import { fontFace } from './fonts.web';

/** The shell's faces: each typeface declared once by weight, as the server's pages read them too. */
const shell = readFileSync(new URL('../../public/index.html', import.meta.url), 'utf8');
const faces = [...shell.matchAll(/@font-face\s*{([^}]*)}/g)].map(([, rule]) => ({
  family: /font-family:\s*'([^']+)'/.exec(rule ?? '')?.[1],
  weight: Number(/font-weight:\s*(\d+)/.exec(rule ?? '')?.[1]),
  file: /url\(\/fonts\/([^)]+)\)/.exec(rule ?? '')?.[1] ?? '',
}));

describe('the web’s faces', () => {
  it('are the brand’s two families, from files the app ships', () => {
    expect(new Set(faces.map((f) => f.family))).toEqual(new Set([fonts.body, fonts.heading]));
    for (const { file } of faces)
      expect(existsSync(new URL(`../../public/fonts/${file}`, import.meta.url)), file).toBe(true);
  });

  it('cover every style of the type scale at its own weight', () => {
    for (const [name, style] of Object.entries(typeScale)) {
      if (style.family === 'mono') continue;
      const { fontFamily, fontWeight } = fontFace(style.family, style.weight);
      expect(
        faces.some((f) => f.family === fontFamily && String(f.weight) === fontWeight),
        `${name}: ${fontFamily} ${fontWeight}`,
      ).toBe(true);
    }
  });
});
