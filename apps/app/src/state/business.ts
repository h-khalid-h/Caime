/**
 * The team inbox opened last, for the rail's Business entry: someone on several teams comes
 * back to the one they were in, never always to the first. In memory only: a launch starts
 * from the first team, as the summary lists them.
 */
import { create } from 'zustand';

interface BusinessState {
  lastTeam: string | null;
  opened: (handle: string) => void;
}

export const useBusiness = create<BusinessState>()((set) => ({
  lastTeam: null,
  opened: (handle) => set((s) => (s.lastTeam === handle ? s : { lastTeam: handle })),
}));
