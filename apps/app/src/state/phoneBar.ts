/**
 * The phone's bar of places (`features/shell/TabBar.tsx` keeps this): whether it's on screen
 * now, for what stands off it (the screen's toasts sit above it, and a screen leaves the home
 * indicator's room to it rather than taking that room twice), and the place someone was last
 * in, which stays lit while a page opened from it is on top.
 */
import { create } from 'zustand';
import type { Place } from '@/features/shell/phoneBar';

export const usePhoneBar = create<{ shown: boolean; last: Place | null }>()(() => ({
  shown: false,
  last: null,
}));
