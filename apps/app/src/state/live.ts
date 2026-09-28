/**
 * Ephemeral, never persisted: who is typing, who is online, the realtime connection, and which
 * conversation is on screen (so arriving messages there are read, not counted as unread).
 */
import type { PresenceState } from '@caime/core/api';
import { create } from 'zustand';

const TYPING_MS = 6000;

interface LiveState {
  typing: Record<string, Record<string, number>>;
  presence: Record<string, PresenceState>;
  connection: 'idle' | 'connecting' | 'open' | 'offline';
  openConversationId: string | null;
  setTyping: (conversationId: string, userId: string) => void;
  clearTyping: (conversationId: string, userId: string) => void;
  setPresence: (userId: string, state: PresenceState) => void;
  setConnection: (s: LiveState['connection']) => void;
  setOpenConversation: (id: string | null) => void;
  reset: () => void;
}

export const useLive = create<LiveState>((set) => ({
  typing: {},
  presence: {},
  connection: 'idle',
  openConversationId: null,
  setTyping: (conversationId, userId) =>
    set((s) => ({
      typing: {
        ...s.typing,
        [conversationId]: { ...(s.typing[conversationId] ?? {}), [userId]: Date.now() + TYPING_MS },
      },
    })),
  clearTyping: (conversationId, userId) =>
    set((s) => {
      const current = { ...(s.typing[conversationId] ?? {}) };
      delete current[userId];
      return { typing: { ...s.typing, [conversationId]: current } };
    }),
  setPresence: (userId, state) => set((s) => ({ presence: { ...s.presence, [userId]: state } })),
  setConnection: (connection) => set({ connection }),
  setOpenConversation: (openConversationId) => set({ openConversationId }),
  reset: () => set({ typing: {}, presence: {}, connection: 'idle', openConversationId: null }),
}));

/** User ids currently typing in a conversation (expired entries drop out on the next tick). */
export function typingIn(state: LiveState, conversationId: string, now = Date.now()): string[] {
  const entries = state.typing[conversationId];
  if (!entries) return [];
  return Object.entries(entries)
    .filter(([, until]) => until > now)
    .map(([id]) => id);
}
