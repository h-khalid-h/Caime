/**
 * Appearance and composer preferences. Kept on the device so the first frame is already right,
 * and mirrored to the account (`me.preferences`) so every device agrees (BRAND.md B7).
 */
import type { BubbleTheme } from '@caime/brand/tokens';
import type { ArabicVarietyChoice } from '@caime/core/arabic-variety';
import type { LanguageChoice } from '@caime/core/i18n';
import type { Initiative } from '@caime/core/initiative';
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
  /** Cai's morning brief (R68): the hour it comes, or null for none. */
  caiBrief: string | null;
  /** Cai's weekly look at your people (R68). */
  caiDigest: boolean;
  /** How much Cai does unasked (R66). */
  caiInitiative: Initiative;
  /** How Cai and the Caime Friends speak Arabic (R72): as you write and live, or one chosen. */
  arabicVariety: ArabicVarietyChoice;
  /** Your mail says when it's opened (R75: the provider's pixel, said in the mail). */
  mailOpens: boolean;
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
  caiBrief: null,
  caiDigest: false,
  caiInitiative: 'usual',
  arabicVariety: 'auto',
  mailOpens: true,
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
