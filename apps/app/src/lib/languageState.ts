/**
 * The language this device shows (R54), kept apart from how it's loaded so the API client can
 * read it without the loader's dependencies (the device's locales, React Native).
 */
import type { InterfaceLanguage } from '@caime/core/i18n';
import { create } from 'zustand';

interface LanguageState {
  /** The language the app is rendered in; null until the catalog is ready. */
  language: InterfaceLanguage | null;
  /** Bumped when the language changes, so the root remounts. */
  generation: number;
}

export const useLanguage = create<LanguageState>(() => ({ language: null, generation: 0 }));
