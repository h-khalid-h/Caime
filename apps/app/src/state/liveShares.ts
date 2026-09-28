import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface LiveShare {
  conversationId: string;
  until: string;
}

interface LiveSharesState {
  /** My live locations this device keeps moving, by message, until each ends (R29). */
  shares: Record<string, LiveShare>;
  start: (messageId: string, share: LiveShare) => void;
  end: (messageId: string) => void;
  clear: () => void;
}

export const useLiveShares = create<LiveSharesState>()(
  persist(
    (set) => ({
      shares: {},
      start: (messageId, share) => set((s) => ({ shares: { ...s.shares, [messageId]: share } })),
      end: (messageId) =>
        set((s) => {
          const { [messageId]: _, ...rest } = s.shares;
          return { shares: rest };
        }),
      clear: () => set({ shares: {} }),
    }),
    { name: 'caime.live-shares', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
