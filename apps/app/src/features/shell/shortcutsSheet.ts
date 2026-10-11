/** Whether the keyboard shortcuts sheet is open: its own module, so the settings menu can open
 * it without carrying the shortcuts themselves into the first download. */
import { create } from 'zustand';

export const useShortcutsSheet = create<{ open: boolean; setOpen: (open: boolean) => void }>(
  (set) => ({ open: false, setOpen: (open) => set({ open }) }),
);
