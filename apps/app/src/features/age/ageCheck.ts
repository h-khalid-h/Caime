/**
 * Asking for a check of one's age (M16 B7): what asked for it (a trigger the server named, or the
 * person from Settings), kept apart from the sheet that explains it, which loads when first asked.
 */
import type { AgeTrigger } from '@caime/core/age-assurance';
import { create } from 'zustand';

export type AgeAsked = AgeTrigger | 'self';

export const useAgeCheck = create<{ asked: AgeAsked | null }>(() => ({ asked: null }));

/** Opens the sheet: why Caime asks (when a trigger did), and the way to the provider's page. */
export function askAgeCheck(asked: AgeAsked): void {
  useAgeCheck.setState({ asked });
}
