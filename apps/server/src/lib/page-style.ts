/**
 * The server's own pages draw from the brand's tokens as the app does (R69): colours from
 * `themes` (light, and dark when the device asks), type from `typeScale`, shape from `radii` and
 * `controlHeight`. A page's CSS names these variables and helpers, never a colour or a size of its
 * own, so a token changed changes every page, and an entry screen's static twin stays the app's.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  breakpoints,
  bubbleThemes,
  controlHeight,
  fonts,
  minTouchTarget,
  radii,
  type ThemeColors,
  type TypeStyleName,
  themes,
  typeScale,
  wordmarkColour,
} from '@caime/brand/tokens';

const SYSTEM = 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';

/** The families as the shell declares them (the app's index.html), with the system's behind. */
export const FACE = {
  body: `${fonts.body},${SYSTEM}`,
  heading: `${fonts.heading},${fonts.body},${SYSTEM}`,
  mono: 'ui-monospace,"SF Mono",Menlo,Consolas,"Liberation Mono",monospace',
} as const;

/** The theme's colours a page may name, each as `--` and its name (`--text-secondary`). */
const COLOURS = [
  'canvas',
  'surface',
  'surfaceRaised',
  'surfaceMuted',
  'border',
  'borderStrong',
  'text',
  'textSecondary',
  'textTertiary',
  'ink',
  'primary',
  'onPrimary',
  'accent',
  'accentSoft',
  'link',
  'focus',
  'danger',
  'dangerSoft',
] as const satisfies readonly (keyof ThemeColors)[];

const kebab = (name: string) => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

function scheme(name: 'light' | 'dark'): string {
  const mine = bubbleThemes.plum[name];
  return [
    ...COLOURS.map((k) => `--${kebab(k)}:${themes[name][k]}`),
    // A message of one's own, as the app draws it by default.
    `--mine:${mine.bg}`,
    `--on-mine:${mine.fg}`,
    `--wordmark:${wordmarkColour[name]}`,
  ].join(';');
}

/** Every colour a page names, for the scheme the device asks for. */
export const THEME_VARS = `:root{${scheme('light')}}@media (prefers-color-scheme:dark){:root{${scheme('dark')}}}`;

/** A style of the type scale, as declarations: family, weight, size, line height, spacing. */
export function type(name: TypeStyleName): string {
  const s = typeScale[name];
  return [
    `font-family:${FACE[s.family]}`,
    `font-weight:${s.weight}`,
    `font-size:${s.size}px`,
    `line-height:${s.lineHeight}px`,
    `letter-spacing:${s.letterSpacing ?? 0}px`,
  ].join(';');
}

/** Shapes, heights and widths, in pixels, as the app's primitives and layout take them. */
export const px = {
  radius: (name: keyof typeof radii) => `${radii[name]}px`,
  height: (name: keyof typeof controlHeight) => `${controlHeight[name]}px`,
  touch: `${minTouchTarget}px`,
  /** Where the app lays a screen out for a desktop (`useLayout`). */
  desktop: `${breakpoints.desktop}px`,
};

/**
 * The shell's own font declarations (the app's index.html, `caime-fonts`), for a page the server
 * writes as a document of its own (the privacy policy, the terms, the operator's reports): the
 * faces are declared once, there, and read from it; without a built app the system's face draws.
 */
export function shellFaces(webDir: string | undefined): string {
  if (!webDir) return '';
  const shell = join(resolve(webDir), 'index.html');
  if (!existsSync(shell)) return '';
  return /<style id="caime-fonts">[\s\S]*?<\/style>/.exec(readFileSync(shell, 'utf8'))?.[0] ?? '';
}
