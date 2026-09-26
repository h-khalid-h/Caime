/**
 * Unsent text per conversation, kept on the device instantly and mirrored to the account
 * (debounced) so the inbox shows "Draft:" on every device.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { endpoints } from '@/api/endpoints';

interface DraftState {
  drafts: Record<string, string>;
  set: (conversationId: string, text: string) => void;
  clear: (conversationId: string) => void;
}

const timers = new Map<string, ReturnType<typeof setTimeout>>();
const synced = new Map<string, string>();

function sync(conversationId: string, text: string): void {
  const existing = timers.get(conversationId);
  if (existing) clearTimeout(existing);
  timers.set(
    conversationId,
    setTimeout(() => {
      timers.delete(conversationId);
      const value = text.trim() ? text : null;
      if ((synced.get(conversationId) ?? null) === value) return;
      synced.set(conversationId, value ?? '');
      void endpoints.updateConversation(conversationId, { draft: value }).catch(() => {});
    }, 1500),
  );
}

export const useDrafts = create<DraftState>()(
  persist(
    (set) => ({
      drafts: {},
      set: (conversationId, text) => {
        set((s) => ({ drafts: { ...s.drafts, [conversationId]: text } }));
        sync(conversationId, text);
      },
      clear: (conversationId) => {
        const t = timers.get(conversationId);
        if (t) clearTimeout(t);
        timers.delete(conversationId);
        synced.set(conversationId, '');
        set((s) => {
          const next = { ...s.drafts };
          delete next[conversationId];
          return { drafts: next };
        });
      },
    }),
    {
      name: 'caishy.drafts',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ drafts: s.drafts }),
    },
  ),
);
