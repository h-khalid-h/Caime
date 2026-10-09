import { dirOf } from '@caime/core/i18n';
import { I18nManager, Platform } from 'react-native';
import { useLanguage } from '@/lib/languageState';

/**
 * Whether the layout runs right to left (R73): on the web it follows the interface language at
 * once (the root `Direction` tells react-native-web), on a phone it's what the app launched
 * with (`I18nManager`, applied at the next launch after a change), which is what the screens are
 * laid out by. Anything drawn with a side (a back arrow, a chevron, a trailing alignment) asks
 * this, never the language or `I18nManager` on its own.
 */
export function useRtl(): boolean {
  const language = useLanguage((s) => s.language);
  if (Platform.OS !== 'web') return I18nManager.isRTL;
  return language !== null && dirOf(language) === 'rtl';
}
