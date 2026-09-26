import { SPHERES } from '@caishy/core';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from './contrast';
import { avatarPalette, bubbleThemes, sphereStyles, themes } from './tokens';

const AA = 4.5;

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
