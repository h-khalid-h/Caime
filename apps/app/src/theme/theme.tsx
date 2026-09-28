/**
 * The theme (BRAND.md): light and dark from the brand tokens, the person's bubble colour for
 * their own messages, and the Playful or Minimal intensity. Colour carries meaning — spheres,
 * states — so screens read colours from here and never hard-code them.
 */
import {
  type BubbleColors,
  bubbleThemes,
  type ColorScheme,
  radii,
  type SphereColors,
  spacing,
  sphereStyles,
  type ThemeColors,
  themes,
  typeScale,
} from '@caime/brand/tokens';
import type { Sphere } from '@caime/core/taxonomy';
import { createContext, type ReactNode, useContext, useEffect, useMemo } from 'react';
import { Platform, useColorScheme } from 'react-native';
import { type Personality, usePrefs } from './prefs';

export interface SphereTheme extends SphereColors {
  solid: string;
  icon: string;
}

export interface Theme {
  scheme: ColorScheme;
  c: ThemeColors;
  /** The person's own message bubbles. */
  bubble: BubbleColors;
  personality: Personality;
  /** Characters, stickers and brand moments are on (Playful) or kept for key moments (Minimal). */
  playful: boolean;
  sphere: (s: Sphere | null | undefined) => SphereTheme;
  radii: Record<keyof typeof radii, number>;
  space: typeof spacing;
  type: typeof typeScale;
}

const FALLBACK_SPHERE: Sphere = 'other';

function buildTheme(
  scheme: ColorScheme,
  personality: Personality,
  bubble: keyof typeof bubbleThemes,
): Theme {
  const c = themes[scheme];
  const b = bubbleThemes[bubble] ?? bubbleThemes.plum;
  const sphere = (s: Sphere | null | undefined): SphereTheme => {
    const style = sphereStyles[s ?? FALLBACK_SPHERE] ?? sphereStyles[FALLBACK_SPHERE];
    return { ...style[scheme], solid: style.solid, icon: style.icon };
  };
  return {
    scheme,
    c,
    bubble: b[scheme],
    personality,
    playful: personality === 'playful',
    sphere,
    radii: personality === 'minimal' ? { ...radii, lg: 12, xl: 14, xxl: 20, bubble: 14 } : radii,
    space: spacing,
    type: typeScale,
  };
}

const ThemeContext = createContext<Theme>(buildTheme('light', 'playful', 'plum'));

export function useResolvedScheme(): ColorScheme {
  const system = useColorScheme();
  const pref = usePrefs((p) => p.theme);
  if (pref === 'light' || pref === 'dark') return pref;
  return system === 'dark' ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useResolvedScheme();
  const personality = usePrefs((p) => p.personality);
  const bubble = usePrefs((p) => p.bubbleTheme);
  const theme = useMemo(
    () => buildTheme(scheme, personality, bubble),
    [scheme, personality, bubble],
  );

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const root = document.documentElement;
    root.style.colorScheme = scheme;
    root.style.backgroundColor = theme.c.canvas;
    document.body.style.backgroundColor = theme.c.canvas;
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'theme-color');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', theme.c.canvas);
  }, [scheme, theme]);

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
