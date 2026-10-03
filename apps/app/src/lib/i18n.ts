/**
 * The interface language on this device (R54). English is in the code; a catalog for another
 * language is loaded only when it's chosen or the device speaks it, before the first screen,
 * so nothing of it is in the startup chunk. Changing the language remounts the app (every
 * `tr()` runs again); on a phone the layout's direction follows at the next launch.
 */
import {
  type Catalog,
  english,
  type InterfaceLanguage,
  type LanguageChoice,
  makeTranslator,
  resolveLanguage,
  setTranslator,
} from '@caime/core/i18n';
import { getLocales } from 'expo-localization';
import { I18nManager, Platform } from 'react-native';
import { useLanguage } from '@/lib/languageState';
import { usePrefs } from '@/theme/prefs';

export { useLanguage };

export function deviceLanguageTag(): string | null {
  return getLocales()[0]?.languageTag ?? null;
}

async function catalogFor(language: InterfaceLanguage): Promise<Catalog> {
  if (language === 'ar') return (await import('@caime/core/locales/ar')).ar;
  return {};
}

function applyDirection(language: InterfaceLanguage): void {
  const rtl = language === 'ar';
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    document.documentElement.lang = language;
    document.documentElement.dir = rtl ? 'rtl' : 'ltr';
  }
  // React Native (and its web build) flips start/end styles from this; a phone applies it at
  // the next launch, the web at once.
  I18nManager.allowRTL(rtl);
  if (I18nManager.isRTL !== rtl) I18nManager.forceRTL(rtl);
}

/** The preferences come from the device's storage; the language waits for them. */
function prefsHydrated(): Promise<void> {
  if (usePrefs.persist.hasHydrated()) return Promise.resolve();
  return new Promise((resolve) => {
    const stop = usePrefs.persist.onFinishHydration(() => {
      stop();
      resolve();
    });
  });
}

/** Load the language chosen (or the device's) and make it the app's; resolves when ready. */
export async function loadLanguage(choice?: LanguageChoice): Promise<InterfaceLanguage> {
  if (!choice) await prefsHydrated();
  const language = resolveLanguage(choice ?? usePrefs.getState().language, deviceLanguageTag());
  const catalog = language === 'en' ? null : await catalogFor(language).catch(() => null);
  setTranslator(catalog ? makeTranslator(language, catalog) : english);
  applyDirection(catalog ? language : 'en');
  useLanguage.setState((s) => ({
    language: catalog ? language : 'en',
    generation: s.language === null ? s.generation : s.generation + 1,
  }));
  return catalog ? language : 'en';
}

// The preference may change from the setting, or arrive with the account on sign-in
// (`adoptPreferences`): either way the language follows it.
usePrefs.subscribe((state, previous) => {
  if (state.language !== previous.language && useLanguage.getState().language !== null)
    void loadLanguage(state.language);
});

/** The names of the languages, each in itself, for the setting. */
export const LANGUAGE_NAMES: Record<InterfaceLanguage, string> = { en: 'English', ar: 'العربية' };
