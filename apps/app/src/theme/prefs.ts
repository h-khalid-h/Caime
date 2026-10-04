/**
 * Appearance and composer preferences. Kept on the device so the first frame is already right,
 * and mirrored to the account (`me.preferences`) so every device agrees (BRAND.md B7).
 */
import type { BubbleTheme } from '@caime/brand/tokens';
import type { LanguageChoice } from '@caime/core/i18n';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type ThemePreference = 'system' | 'light' | 'dark';
export type Personality = 'playful' | 'minimal';

export interface PrefValues {
  theme: ThemePreference;
  personality: Personality;
  bubbleTheme: BubbleTheme;
  /** null: the platform default (Enter sends on web and desktop, never on phones). */
  enterToSend: boolean | null;
  reduceMotion: boolean;
  /** Work messages wait while a meeting on your calendar is on (R51). */
  holdWhileBusy: boolean;
  /** The interface language (R54): the device's, or one chosen. */
  language: LanguageChoice;
  /** Suggestions follow what you keep taking and passing on (M11). */
  learnFromChoices: boolean;
}

interface PrefsState extends PrefValues {
  set: (patch: Partial<PrefValues>) => void;
}

export const DEFAULT_PREFS: PrefValues = {
  theme: 'system',
  personality: 'playful',
  bubbleTheme: 'plum',
  enterToSend: null,
  reduceMotion: false,
  holdWhileBusy: false,
  language: 'auto',
  learnFromChoices: true,
};

export const usePrefs = create<PrefsState>()(
  persist(
    (set) => ({
      ...DEFAULT_PREFS,
      set: (patch) => set(patch),
    }),
    {
      name: 'caime.prefs',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ set: _set, ...values }) => values,
    },
  ),
);
