/** Whether the You sheet is open: one sheet for the four places (the phone's tabs layout draws
 * it), whichever opened it; its own module, so the button never carries the sheet. */
import { create } from 'zustand';

export const useYouSheet = create<{ open: boolean; setOpen: (open: boolean) => void }>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));
