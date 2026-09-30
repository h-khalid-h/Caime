/**
 * Caime design tokens. Source: docs/BRAND.md (board v2). Every text/background pair used by the
 * UI is asserted to meet WCAG AA in tokens.test.ts — change a value here and the test tells you
 * whether it still reads.
 */
import type { Sphere } from '@caime/core';

/**
 * The canonical palette, reconciled from the three brand boards (docs/BRAND.md, "Palette
 * reconciliation"). Use the roles below in UI code, not these directly.
 */
export const palette = {
  caimePink: '#FF8FB1',
  lightPink: '#FFD6E7',
  darkPurple: '#3B2E5B',
  lavender: '#E9D5FF',
  lilac: '#C8B4FF',
  sunshineYellow: '#FFD166',
  skyBlue: '#7DD3FC',
  mintGreen: '#A7F3D0',
  cream: '#FFF7E9',
  gray: '#6B7280',
} as const;

export type ColorScheme = 'light' | 'dark';

export interface ThemeColors {
  canvas: string;
  surface: string;
  surfaceRaised: string;
  surfaceMuted: string;
  surfaceHover: string;
  surfacePressed: string;
  border: string;
  borderStrong: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  /** Brand ink: wordmark, brand headings. */
  ink: string;
  primary: string;
  primaryPressed: string;
  onPrimary: string;
  accent: string;
  onAccent: string;
  accentSoft: string;
  accentStrong: string;
  onAccentStrong: string;
  link: string;
  focus: string;
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  danger: string;
  dangerSoft: string;
  bubbleOther: string;
  onBubbleOther: string;
  scrim: string;
  shadow: string;
}

export const themes: Record<ColorScheme, ThemeColors> = {
  light: {
    canvas: '#FAF8FC',
    surface: '#FFFFFF',
    surfaceRaised: '#FFFFFF',
    surfaceMuted: '#F3F0F8',
    surfaceHover: '#F7F5FA',
    surfacePressed: '#EEEAF5',
    border: '#E7E2EF',
    borderStrong: '#D5CEE2',
    text: '#2B2340',
    textSecondary: '#5E5673',
    textTertiary: '#6F6885',
    ink: '#3B2E5B',
    primary: '#3B2E5B',
    primaryPressed: '#2E2348',
    onPrimary: '#FFFFFF',
    accent: '#FF8FB1',
    onAccent: '#2B2340',
    accentSoft: '#FFD6E7',
    accentStrong: '#C8285F',
    onAccentStrong: '#FFFFFF',
    link: '#5B40A0',
    focus: '#5B40A0',
    success: '#047857',
    successSoft: '#DDFBEF',
    warning: '#8A5A00',
    warningSoft: '#FFF3D1',
    danger: '#C4262E',
    dangerSoft: '#FDE7E8',
    bubbleOther: '#F3F0F8',
    onBubbleOther: '#2B2340',
    scrim: 'rgba(18, 13, 28, 0.45)',
    shadow: 'rgba(59, 46, 91, 0.10)',
  },
  dark: {
    canvas: '#120F1A',
    surface: '#1A1625',
    surfaceRaised: '#211C2F',
    surfaceMuted: '#2A2438',
    surfaceHover: '#231E31',
    surfacePressed: '#2D2740',
    border: '#342D46',
    borderStrong: '#4A4262',
    text: '#F5F2FA',
    textSecondary: '#B7AFC9',
    textTertiary: '#9C94B0',
    ink: '#C9B8F5',
    primary: '#FF8FB1',
    primaryPressed: '#F7739C',
    onPrimary: '#2B2340',
    accent: '#FF8FB1',
    onAccent: '#2B2340',
    accentSoft: '#3A1F2B',
    accentStrong: '#FF9CC0',
    onAccentStrong: '#2B2340',
    link: '#C9B8F5',
    focus: '#FF9CC0',
    success: '#6EE7B7',
    successSoft: '#10302A',
    warning: '#FFD166',
    warningSoft: '#352A12',
    danger: '#FF8A8F',
    dangerSoft: '#3A1519',
    bubbleOther: '#2A2438',
    onBubbleOther: '#F5F2FA',
    scrim: 'rgba(0, 0, 0, 0.6)',
    shadow: 'rgba(0, 0, 0, 0.4)',
  },
};

export type BubbleTheme = 'plum' | 'pink' | 'lavender' | 'sky' | 'mint' | 'sunshine';

export interface BubbleColors {
  bg: string;
  fg: string;
  /** Timestamps and ticks inside the bubble. */
  meta: string;
}

/** Your own messages. Personal choice; never changes what the other person sees (BRAND.md B7). */
export const bubbleThemes: Record<
  BubbleTheme,
  { label: string; light: BubbleColors; dark: BubbleColors }
> = {
  plum: {
    label: 'Plum',
    light: { bg: '#5B40A0', fg: '#FFFFFF', meta: '#E1D9F2' },
    dark: { bg: '#6A57A8', fg: '#FFFFFF', meta: '#F0EBFB' },
  },
  pink: {
    label: 'Caime Pink',
    light: { bg: '#FF8FB1', fg: '#2B2340', meta: '#4A2340' },
    dark: { bg: '#FF8FB1', fg: '#2B2340', meta: '#4A2340' },
  },
  lavender: {
    label: 'Lavender',
    light: { bg: '#E9D5FF', fg: '#2B2340', meta: '#4E3F6B' },
    dark: { bg: '#E9D5FF', fg: '#2B2340', meta: '#4E3F6B' },
  },
  sky: {
    label: 'Sky',
    light: { bg: '#7DD3FC', fg: '#0B2A3F', meta: '#123E5A' },
    dark: { bg: '#7DD3FC', fg: '#0B2A3F', meta: '#123E5A' },
  },
  mint: {
    label: 'Mint',
    light: { bg: '#A7F3D0', fg: '#0B3B2A', meta: '#15543E' },
    dark: { bg: '#A7F3D0', fg: '#0B3B2A', meta: '#15543E' },
  },
  sunshine: {
    label: 'Sunshine',
    light: { bg: '#FFD166', fg: '#3A2A00', meta: '#5A4300' },
    dark: { bg: '#FFD166', fg: '#3A2A00', meta: '#5A4300' },
  },
};

export interface SphereColors {
  /** Chip and badge background. */
  fill: string;
  /** Text and icon colour on white and on `fill`. */
  strong: string;
}

export interface SphereStyle {
  light: SphereColors;
  dark: SphereColors;
  /** Brand pastel for dots, rings and illustration. */
  solid: string;
  /** Lucide icon name. */
  icon: string;
}

export const sphereStyles: Record<Sphere, SphereStyle> = {
  family: {
    light: { fill: '#FFE3EC', strong: '#C2255C' },
    dark: { fill: '#3A1F2B', strong: '#FFB3CB' },
    solid: '#FF8FB1',
    icon: 'heart',
  },
  friend: {
    light: { fill: '#FFF3D1', strong: '#8A5A00' },
    dark: { fill: '#352A12', strong: '#FFD98A' },
    solid: '#FFD166',
    icon: 'face-slightly-smiling',
  },
  acquaintance: {
    light: { fill: '#FBF1DE', strong: '#76613D' },
    dark: { fill: '#33291A', strong: '#EAD3A8' },
    solid: '#F2DDB5',
    icon: 'hand',
  },
  work: {
    light: { fill: '#E0F4FE', strong: '#0B6BA8' },
    dark: { fill: '#132B3A', strong: '#8FD8FF' },
    solid: '#7DD3FC',
    icon: 'briefcase',
  },
  customer: {
    light: { fill: '#DDFBEF', strong: '#047857' },
    dark: { fill: '#10302A', strong: '#8EEBC4' },
    solid: '#A7F3D0',
    icon: 'handshake',
  },
  vendor: {
    light: { fill: '#FFEAD9', strong: '#B4480D' },
    dark: { fill: '#3A2416', strong: '#FFC49E' },
    solid: '#FDBA8C',
    icon: 'truck',
  },
  service_provider: {
    light: { fill: '#DAF7F3', strong: '#0F766E' },
    dark: { fill: '#10302D', strong: '#86E5DA' },
    solid: '#7FDDD3',
    icon: 'wrench',
  },
  professional: {
    light: { fill: '#F1E8FF', strong: '#6D3FC9' },
    dark: { fill: '#27203F', strong: '#C8B6FF' },
    solid: '#C8B4FF',
    icon: 'badge-check',
  },
  community: {
    light: { fill: '#FBE6FA', strong: '#A1289E' },
    dark: { fill: '#361B35', strong: '#F3B5F1' },
    solid: '#F0ABFC',
    icon: 'users',
  },
  organization: {
    light: { fill: '#E6E8FE', strong: '#4338CA' },
    dark: { fill: '#1E2140', strong: '#B4BCFF' },
    solid: '#A5B4FC',
    icon: 'building',
  },
  public: {
    light: { fill: '#EEF0F3', strong: '#4B5563' },
    dark: { fill: '#23262C', strong: '#C9CED6' },
    solid: '#D1D5DB',
    icon: 'globe',
  },
  other: {
    light: { fill: '#EFEDF3', strong: '#5B5470' },
    dark: { fill: '#26232E', strong: '#CFC9DB' },
    solid: '#D4CFE0',
    icon: 'circle-dot',
  },
};

/** Initials avatars. Chosen by a hash of the account id — never by name or gender. */
export const avatarPalette: ReadonlyArray<{ bg: string; fg: string }> = [
  { bg: '#FFD3E6', fg: '#8E1450' },
  { bg: '#CDEFFE', fg: '#0B5A8C' },
  { bg: '#CFF7E5', fg: '#03664A' },
  { bg: '#FFEBB0', fg: '#6E4700' },
  { bg: '#EBDDFF', fg: '#5B2DA0' },
  { bg: '#FFDFC8', fg: '#8F3A0A' },
  { bg: '#CDF3EE', fg: '#0B5F58' },
];

export function avatarColors(seed: string): { bg: string; fg: string } {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  const entry = avatarPalette[Math.abs(hash) % avatarPalette.length];
  return entry ?? { bg: '#EBDDFF', fg: '#5B2DA0' };
}

export const fonts = {
  heading: 'Nunito',
  body: 'Inter',
  /** The system's monospace (no file of its own): labels on spec-sheet surfaces. */
  mono: 'monospace',
} as const;

export type TypeStyleName =
  | 'display'
  | 'title'
  | 'headline'
  | 'label'
  | 'body'
  | 'bodyStrong'
  | 'message'
  | 'caption'
  | 'captionStrong'
  | 'overline'
  | 'mono';

export interface TypeStyle {
  family: keyof typeof fonts;
  weight: 400 | 500 | 600 | 700 | 800 | 900;
  size: number;
  lineHeight: number;
  letterSpacing?: number;
  uppercase?: boolean;
}

export const typeScale: Record<TypeStyleName, TypeStyle> = {
  display: { family: 'heading', weight: 800, size: 34, lineHeight: 40, letterSpacing: -0.4 },
  title: { family: 'heading', weight: 800, size: 24, lineHeight: 30, letterSpacing: -0.2 },
  headline: { family: 'heading', weight: 700, size: 19, lineHeight: 24 },
  label: { family: 'heading', weight: 700, size: 15, lineHeight: 20 },
  body: { family: 'body', weight: 400, size: 15, lineHeight: 21 },
  bodyStrong: { family: 'body', weight: 600, size: 15, lineHeight: 21 },
  message: { family: 'body', weight: 400, size: 16, lineHeight: 22 },
  caption: { family: 'body', weight: 500, size: 13, lineHeight: 17 },
  captionStrong: { family: 'body', weight: 600, size: 13, lineHeight: 17 },
  /**
   * A section's label ("Needs you", "Coming up", a settings group): the spec sheet's mono, in
   * sentence case, never uppercase (BRAND.md). The same style as `mono`, named for what it
   * heads.
   */
  overline: { family: 'mono', weight: 500, size: 12, lineHeight: 16, letterSpacing: 0.3 },
  /** A spec sheet's label: mono, sentence case, quiet. Never for running text. */
  mono: { family: 'mono', weight: 500, size: 12, lineHeight: 16, letterSpacing: 0.3 },
};

export const radii = {
  xs: 6,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  bubble: 18,
  bubbleTail: 6,
  pill: 999,
} as const;

export const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const;

export const motion = {
  fast: 150,
  base: 200,
  slow: 250,
} as const;

export const breakpoints = {
  tablet: 768,
  desktop: 1024,
  wide: 1280,
} as const;

export const minTouchTarget = 44;
