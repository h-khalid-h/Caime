import { SPHERES } from '@caime/core';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from './contrast';
import { avatarPalette, bubbleThemes, sphereStyles, themes } from './tokens';

const AA = 4.5;
/** WCAG 1.4.11: a mark that means something, against what it sits on. */
const NON_TEXT = 3;
/** How far apart read and delivered stand, whatever the bubble. */
const READ_APART = 1.8;

describe('contrast math', () => {
  it('matches the WCAG reference values', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
    expect(contrastRatio('#777777', '#FFFFFF')).toBeCloseTo(4.48, 2);
  });
});

describe.each(['light', 'dark'] as const)('%s theme', (scheme) => {
  const t = themes[scheme];
  const surfaces = { canvas: t.canvas, surface: t.surface, surfaceMuted: t.surfaceMuted };

  it.each(Object.entries(surfaces))('text roles meet AA on %s', (_, bg) => {
    for (const fg of [t.text, t.textSecondary, t.textTertiary]) {
      expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(AA);
    }
  });

  it('labels meet AA on their fills', () => {
    expect(contrastRatio(t.onPrimary, t.primary)).toBeGreaterThanOrEqual(AA);
    expect(contrastRatio(t.onAccent, t.accent)).toBeGreaterThanOrEqual(AA);
    expect(contrastRatio(t.onAccentStrong, t.accentStrong)).toBeGreaterThanOrEqual(AA);
    expect(contrastRatio(t.onBubbleOther, t.bubbleOther)).toBeGreaterThanOrEqual(AA);
    expect(contrastRatio(t.text, t.accentSoft)).toBeGreaterThanOrEqual(AA);
  });

  it('coloured text meets AA on the surface', () => {
    for (const fg of [t.link, t.accentStrong, t.success, t.warning, t.danger, t.ink]) {
      expect(contrastRatio(fg, t.surface)).toBeGreaterThanOrEqual(AA);
    }
  });

  it.each(Object.keys(bubbleThemes))('bubble theme %s is readable', (name) => {
    const b = bubbleThemes[name as keyof typeof bubbleThemes][scheme];
    expect(contrastRatio(b.fg, b.bg)).toBeGreaterThanOrEqual(AA);
    expect(contrastRatio(b.meta, b.bg)).toBeGreaterThanOrEqual(AA);
  });

  // Read and delivered (M16 E1, review 2026-10-17 §7 H1): each tick seen on its bubble (3:1, as
  // for any mark that means something), and read never the same as delivered, whose colours were
  // 1.04:1 apart; read is also drawn heavier, so it differs by more than colour.
  it.each(Object.keys(bubbleThemes))('bubble theme %s tells read from delivered', (name) => {
    const b = bubbleThemes[name as keyof typeof bubbleThemes][scheme];
    expect(contrastRatio(b.tick, b.bg)).toBeGreaterThanOrEqual(NON_TEXT);
    expect(contrastRatio(b.fg, b.tick)).toBeGreaterThanOrEqual(READ_APART);
  });

  it('a card of your own tells read from delivered too', () => {
    // A card's ticks sit on the surface: delivered in the tertiary text, read in the text.
    expect(contrastRatio(t.textTertiary, t.surface)).toBeGreaterThanOrEqual(NON_TEXT);
    expect(contrastRatio(t.text, t.textTertiary)).toBeGreaterThanOrEqual(READ_APART);
  });

  it.each([...SPHERES])('sphere %s chips are readable', (sphere) => {
    const c = sphereStyles[sphere][scheme];
    expect(contrastRatio(c.strong, c.fill)).toBeGreaterThanOrEqual(AA);
    expect(contrastRatio(c.strong, t.surface)).toBeGreaterThanOrEqual(AA);
  });
});

describe('avatars', () => {
  it('initials meet AA on every avatar colour', () => {
    for (const { bg, fg } of avatarPalette) {
      expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(AA);
    }
  });
});

describe('sphere styles', () => {
  it('cover every sphere in the taxonomy', () => {
    expect(Object.keys(sphereStyles).sort()).toEqual([...SPHERES].sort());
  });
});
