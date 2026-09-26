/**
 * The offline outbox (ADR-8): a message is on screen the instant it's written, survives the app
 * closing, and is sent in order when the network allows. The server deduplicates by clientId, so
 * a retry after a lost response can never send twice.
 */
import type { MessageView } from '@caishy/core/api';
import { uuidv4 } from '@caishy/core/ids';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { ApiError, NetworkError } from '@/api/client';
import { endpoints, type SendBody } from '@/api/endpoints';
import { queryClient } from '@/api/queryClient';
import { applyMessageToInbox, upsertMessage } from './cache';

export interface OutboxItem {
  clientId: string;
  conversationId: string;
  body: SendBody;
  replyTo: MessageView['replyTo'];
  createdAt: string;
  status: 'queued' | 'sending' | 'failed';
  error?: string;
  attempts: number;
}

interface OutboxState {
  items: OutboxItem[];
  enqueue: (
    conversationId: string,
    body: Omit<SendBody, 'clientId'>,
    replyTo?: MessageView['replyTo'],
  ) => string;
  resolve: (clientId: string) => void;
  retry: (clientId: string) => void;
  discard: (clientId: string) => void;
  flush: () => void;
  clear: () => void;
}

let flushing = false;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleRetry(attempts: number): void {
  if (retryTimer) return;
  const delay = Math.min(30_000, 1000 * 2 ** Math.min(attempts, 5));
  retryTimer = setTimeout(() => {
    retryTimer = null;
    useOutbox.getState().flush();
  }, delay);
}

async function sendOne(item: OutboxItem): Promise<'sent' | 'offline' | 'failed'> {
  const set = useOutbox.setState;
  const update = (patch: Partial<OutboxItem>) =>
    set((s) => ({
      items: s.items.map((i) => (i.clientId === item.clientId ? { ...i, ...patch } : i)),
    }));
  update({ status: 'sending', attempts: item.attempts + 1 });
  try {
    const { message } = await endpoints.send(item.conversationId, item.body);
    upsertMessage(queryClient, message);
    applyMessageToInbox(queryClient, message, { mine: true, reading: true });
    useOutbox.getState().resolve(item.clientId);
    return 'sent';
  } catch (err) {
    if (
      err instanceof NetworkError ||
      (err instanceof ApiError && (err.status >= 500 || err.status === 429))
    ) {
      update({ status: 'queued' });
      return 'offline';
    }
    update({
      status: 'failed',
      error: err instanceof ApiError ? err.message : 'Couldn’t send.',
    });
    return 'failed';
  }
}

export const useOutbox = create<OutboxState>()(
  persist(
    (set, get) => ({
      items: [],
      enqueue: (conversationId, body, replyTo = null) => {
        const clientId = uuidv4();
        const item: OutboxItem = {
          clientId,
          conversationId,
          body: { ...body, clientId },
          replyTo,
          createdAt: new Date().toISOString(),
          status: 'queued',
          attempts: 0,
        };
        set((s) => ({ items: [...s.items, item] }));
        get().flush();
        return clientId;
      },
      resolve: (clientId) =>
        set((s) => ({ items: s.items.filter((i) => i.clientId !== clientId) })),
      retry: (clientId) => {
        set((s) => ({
          items: s.items.map((i) =>
            i.clientId === clientId ? { ...i, status: 'queued', error: undefined } : i,
          ),
        }));
        get().flush();
      },
      discard: (clientId) =>
        set((s) => ({ items: s.items.filter((i) => i.clientId !== clientId) })),
      flush: () => {
        if (flushing) return;
        flushing = true;
        void (async () => {
          try {
            // In order, one at a time: a conversation's messages never overtake each other.
            for (;;) {
              const next = get().items.find((i) => i.status === 'queued');
              if (!next) break;
              const result = await sendOne(next);
              if (result === 'offline') {
                scheduleRetry(next.attempts + 1);
                break;
              }
            }
          } finally {
            flushing = false;
          }
        })();
      },
      clear: () => set({ items: [] }),
    }),
    {
      name: 'caishy.outbox',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ items: s.items }),
      // Anything mid-send when the app closed goes back in the queue.
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        setTimeout(() => {
          useOutbox.setState((s) => ({
            items: s.items.map((i) => (i.status === 'sending' ? { ...i, status: 'queued' } : i)),
          }));
        }, 0);
      },
    },
  ),
);
