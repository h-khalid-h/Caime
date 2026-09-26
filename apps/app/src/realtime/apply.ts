/**
 * Turn a realtime event into cache changes. Data events edit the cache directly (instant);
 * signal events invalidate the queries they affect (refetched once, debounced).
 */
import type { RealtimeEvent } from '@caishy/core/api';
import type { QueryClient } from '@tanstack/react-query';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import {
  applyEditToInbox,
  applyMessageToInbox,
  patchMessage,
  removeMessage,
  upsertMessage,
} from '@/state/cache';
import { useLive } from '@/state/live';
import { useOutbox } from '@/state/outbox';

const pending = new Map<string, ReturnType<typeof setTimeout>>();

/** Collapse bursts: many events for one key within the window cause one refetch. */
function soon(key: string, fn: () => void, ms = 400): void {
  const existing = pending.get(key);
  if (existing) clearTimeout(existing);
  pending.set(
    key,
    setTimeout(() => {
      pending.delete(key);
      fn();
    }, ms),
  );
}

const deliveredAcks = new Map<string, number>();

function ackDelivered(conversationId: string, seq: number): void {
  const prev = deliveredAcks.get(conversationId) ?? 0;
  if (seq <= prev) return;
  deliveredAcks.set(conversationId, seq);
  soon(
    `delivered:${conversationId}`,
    () => {
      const upTo = deliveredAcks.get(conversationId) ?? seq;
      void endpoints.receipts(conversationId, { delivered: upTo }).catch(() => {});
    },
    800,
  );
}

export function applyEvent(qc: QueryClient, event: RealtimeEvent, me: string): void {
  const invalidate = (key: readonly unknown[], debounceKey = JSON.stringify(key)) =>
    soon(debounceKey, () => void qc.invalidateQueries({ queryKey: key }));

  switch (event.type) {
    case 'message.created': {
      const m = event.data;
      const mine = m.senderId === me;
      if (mine && m.clientId) useOutbox.getState().resolve(m.clientId);
      upsertMessage(qc, m);
      const reading = useLive.getState().openConversationId === m.conversationId;
      if (m.senderId) useLive.getState().clearTyping(m.conversationId, m.senderId);
      const known = applyMessageToInbox(qc, m, { mine, reading });
      if (!known) invalidate(qk.inbox, 'inbox');
      else soon('inbox', () => void qc.invalidateQueries({ queryKey: qk.inbox }), 1200);
      if (!mine) ackDelivered(m.conversationId, m.seq);
      // Dates, amounts and open items are read from messages: refresh the memory panel.
      soon(
        `memory:${m.conversationId}`,
        () => void qc.invalidateQueries({ queryKey: qk.memory(m.conversationId) }),
        1500,
      );
      return;
    }
    case 'message.updated':
      upsertMessage(qc, event.data);
      applyEditToInbox(qc, event.data);
      return;
    case 'message.deleted':
      patchMessage(qc, event.data.conversationId, event.data.id, (m) => ({
        ...m,
        body: null,
        payload: {},
        entities: {},
        files: [],
        poll: null,
        reactions: [],
        deletedAt: new Date().toISOString(),
      }));
      invalidate(qk.inbox, 'inbox');
      return;
    case 'message.hidden':
      removeMessage(qc, event.data.conversationId, event.data.id);
      invalidate(qk.inbox, 'inbox');
      return;
    case 'message.sent':
      useOutbox.getState().resolve(event.data.clientId);
      return;
    case 'reaction': {
      const { conversationId, messageId, userId, emoji, added } = event.data;
      patchMessage(qc, conversationId, messageId, (m) => {
        const others = m.reactions.filter((r) => r.emoji !== emoji);
        const current = m.reactions.find((r) => r.emoji === emoji);
        const ids = new Set(current?.userIds ?? []);
        if (added) ids.add(userId);
        else ids.delete(userId);
        if (ids.size === 0) return { ...m, reactions: others };
        const next = { emoji, count: ids.size, mine: ids.has(me), userIds: [...ids] };
        return {
          ...m,
          reactions: current
            ? m.reactions.map((r) => (r.emoji === emoji ? next : r))
            : [...m.reactions, next],
        };
      });
      return;
    }
    case 'poll.updated':
      invalidate(qk.messages(event.data.conversationId));
      return;
    case 'receipts': {
      const { conversationId, userId, readSeq, deliveredSeq } = event.data;
      qc.setQueryData(qk.conversation(conversationId), (data: unknown) => {
        const d = data as
          | {
              conversation?: {
                participants: Array<{
                  userId: string;
                  readSeq: number | null;
                  deliveredSeq: number;
                }>;
              };
            }
          | undefined;
        if (!d?.conversation) return data;
        return {
          ...d,
          conversation: {
            ...d.conversation,
            participants: d.conversation.participants.map((p) =>
              p.userId !== userId
                ? p
                : {
                    ...p,
                    readSeq: readSeq ?? p.readSeq,
                    deliveredSeq: Math.max(p.deliveredSeq, deliveredSeq ?? 0, readSeq ?? 0),
                  },
            ),
          },
        };
      });
      if (userId === me) invalidate(qk.inbox, 'inbox');
      return;
    }
    case 'typing':
      if (event.data.userId !== me)
        useLive.getState().setTyping(event.data.conversationId, event.data.userId);
      return;
    case 'presence':
      useLive.getState().setPresence(event.data.userId, event.data.state);
      return;
    case 'notification.created':
    case 'notification.updated':
      invalidate(qk.notifications);
      return;
    case 'conversation.created':
    case 'conversation.updated': {
      const id = typeof event.data.conversationId === 'string' ? event.data.conversationId : null;
      invalidate(qk.inbox, 'inbox');
      invalidate(qk.inboxAll, 'inbox-all');
      if (id) {
        invalidate(qk.conversation(id));
        invalidate(qk.memory(id));
      }
      return;
    }
    case 'connection.created':
    case 'connection.updated':
    case 'connection.removed':
    case 'block.changed':
      invalidate(qk.connections);
      invalidate(['requests'], 'requests');
      invalidate(['person'], 'person');
      invalidate(qk.inbox, 'inbox');
      return;
    case 'connection.request':
    case 'connection.request.resolved':
      invalidate(['requests'], 'requests');
      invalidate(['person'], 'person');
      return;
    case 'relationship.changed':
    case 'relationship.shared':
      invalidate(qk.connections);
      invalidate(['person'], 'person');
      invalidate(['relationship-history'], 'relationship-history');
      invalidate(['conversation'], 'conversation');
      invalidate(qk.inbox, 'inbox');
      return;
    case 'policies.changed':
      invalidate(qk.policies);
      invalidate(qk.inbox, 'inbox');
      return;
    case 'suggestion.created':
    case 'suggestion.resolved':
      invalidate(['suggestions'], 'suggestions');
      return;
    case 'task.created':
    case 'task.updated':
    case 'task.deleted':
      invalidate(['tasks'], 'tasks');
      invalidate(['memory'], 'memory');
      invalidate(qk.inbox, 'inbox');
      return;
    case 'decision.created':
    case 'decision.updated':
      invalidate(['decisions'], 'decisions');
      invalidate(['memory'], 'memory');
      return;
    case 'notifications.read':
      invalidate(qk.notifications);
      return;
    case 'me.updated':
      invalidate(qk.me);
      return;
  }
}
