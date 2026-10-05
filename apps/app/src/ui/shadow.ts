import { Platform, type ViewStyle } from 'react-native';

/**
 * Something floating over the page (a toast, a pill, a card, the tab bar) casts the theme's
 * shadow (`t.c.shadow`, BRAND.md: soft, tinted, stronger on a dark theme), never a hard-coded
 * colour: one box shadow on the web, the platform's shadow with an elevation on phones.
 */
export function lifted(shadow: string, y = 6, blur = 16): ViewStyle {
  return Platform.OS === 'web'
    ? ({ boxShadow: `0 ${y}px ${blur * 1.5}px ${shadow}` } as ViewStyle)
    : {
        shadowColor: shadow,
        shadowOpacity: 1,
        shadowRadius: blur,
        shadowOffset: { width: 0, height: y },
        elevation: Math.max(1, Math.round(y)),
      };
}
