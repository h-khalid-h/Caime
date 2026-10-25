/**
 * Unsent text per conversation, kept on the device instantly and mirrored to the account
 * (debounced) so the inbox shows "Draft:" on every device. In a private conversation (R18) it's
 * only held while the app is open: never mirrored, never written to the device's storage.
 * Signing out forgets them all.
 */

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { endpoints } from '@/api/endpoints';
import AsyncStorage from '@/lib/kv';

interface DraftState {
  drafts: Record<string, string>;
  /** Private conversations' drafts: in memory only. */
  local: Record<string, string>;
  set: (conversationId: string, text: string) => void;
  setLocal: (conversationId: string, text: string) => void;
  clear: (conversationId: string) => void;
  /** Signed out: every draft goes, here and in storage. */
  reset: () => void;
}

const timers = new Map<string, ReturnType<typeof setTimeout>>();
const synced = new Map<string, string>();
/** How many times each conversation's draft was cleared: a save begun before a clear is stale. */
const cleared = new Map<string, number>();

function sync(conversationId: string, text: string): void {
  const existing = timers.get(conversationId);
  if (existing) clearTimeout(existing);
  timers.set(
    conversationId,
    setTimeout(() => {
      timers.delete(conversationId);
      const value = text.trim() ? text : null;
      if ((synced.get(conversationId) ?? null) === value) return;
      const epoch = cleared.get(conversationId) ?? 0;
      // Marked synced only once the account has it: a failed request leaves it to the next
      // keystroke's sync, or the next sync of this conversation, to try again. A save that was
      // on its way when the message went (the send cleared the draft, on the device and on the
      // account) would put the sent words back as the account's draft, which every other device
      // then shows as "Draft:" and in its composer: such a save is followed by taking it back.
      void endpoints
        .updateConversation(conversationId, { draft: value })
        .then(() => {
          if ((cleared.get(conversationId) ?? 0) !== epoch) return takeBack(conversationId);
          synced.set(conversationId, value ?? '');
        })
        .catch(() => {});
    }, 1500),
  );
}

function takeBack(conversationId: string): Promise<void> {
  return endpoints
    .updateConversation(conversationId, { draft: null })
    .then(() => {
      synced.set(conversationId, '');
    })
    .catch(() => {});
}

export const useDrafts = create<DraftState>()(
  persist(
    (set) => ({
      drafts: {},
      local: {},
      set: (conversationId, text) => {
        set((s) => ({ drafts: { ...s.drafts, [conversationId]: text } }));
        sync(conversationId, text);
      },
      setLocal: (conversationId, text) =>
        set((s) => ({ local: { ...s.local, [conversationId]: text } })),
      clear: (conversationId) => {
        const t = timers.get(conversationId);
        if (t) clearTimeout(t);
        timers.delete(conversationId);
        cleared.set(conversationId, (cleared.get(conversationId) ?? 0) + 1);
        synced.set(conversationId, '');
        set((s) => {
          const next = { ...s.drafts };
          delete next[conversationId];
          const local = { ...s.local };
          delete local[conversationId];
          return { drafts: next, local };
        });
      },
      reset: () => {
        for (const t of timers.values()) clearTimeout(t);
        timers.clear();
        synced.clear();
        cleared.clear();
        set({ drafts: {}, local: {} });
      },
    }),
    {
      name: 'caime.drafts',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ drafts: s.drafts }),
    },
  ),
);
