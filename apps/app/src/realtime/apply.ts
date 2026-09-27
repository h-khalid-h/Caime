/**
 * Turn a realtime event into cache changes. Data events edit the cache directly (instant);
 * signal events invalidate the queries they affect (refetched once, debounced).
 */
import type { RealtimeEvent } from '@caishy/core/api';
import type { QueryClient } from '@tanstack/react-query';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { onCallEvent, onGroupCallEvent } from '@/features/calls/calls';
import {
  applyEditToInbox,
  applyMessageToInbox,
  patchCache,
  patchMessage,
  patchPinned,
  removeMessage,
  updateMessage,
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
/** Conversations this device's person left here: nothing more is said to the server about them. */
const left = new Set<string>();

/**
 * Just left a conversation: what was waiting to be sent about it (that its messages arrived) and
 * refetches of it are dropped, since the server would only answer that they aren't in it.
 */
export function leftConversation(conversationId: string): void {
  left.add(conversationId);
  // Only what was already under way: added back later, it's theirs again.
  setTimeout(() => left.delete(conversationId), 30_000);
  deliveredAcks.delete(conversationId);
  for (const key of [
    `delivered:${conversationId}`,
    JSON.stringify(qk.conversation(conversationId)),
    JSON.stringify(qk.memory(conversationId)),
  ]) {
    const timer = pending.get(key);
    if (timer) clearTimeout(timer);
    pending.delete(key);
  }
}

function ackDelivered(conversationId: string, seq: number): void {
  if (left.has(conversationId)) return;
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
    case 'call.ringing':
    case 'call.updated':
    case 'call.signal':
      onCallEvent(event);
      // Over: it's in the call history now.
      if (event.type === 'call.updated' && event.data.state === 'ended') invalidate(['calls']);
      return;
    case 'devices.changed':
      // Someone's devices for private conversations changed (mine too: one of mine may be
      // waiting to be approved): what's sealed for, and each code, is looked at again (R18).
      void import('@/features/e2ee/private')
        .then((p) => p.devicesChanged(event.data.userId))
        .catch(() => {});
      return;
    case 'groupcall.ringing':
    case 'groupcall.updated':
    case 'groupcall.signal':
      onGroupCallEvent(event);
      if (event.type === 'groupcall.updated' && event.data.state === 'ended') invalidate(['calls']);
      return;
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
      // Dates, amounts, open items and what's shared are read from messages: refresh them.
      soon(
        `memory:${m.conversationId}`,
        () => {
          void qc.invalidateQueries({ queryKey: qk.memory(m.conversationId) });
          void qc.invalidateQueries({ queryKey: qk.assets(m.conversationId) });
        },
        1500,
      );
      // A space shows its conversations' unread counts: refresh whichever space is on screen.
      soon(
        'spaces',
        () => {
          void qc.invalidateQueries({ queryKey: qk.spaces });
          void qc.invalidateQueries({ queryKey: ['space'] });
        },
        1500,
      );
      return;
    }
    case 'message.updated':
      updateMessage(qc, event.data, me);
      applyEditToInbox(qc, event.data);
      // Pinned, its words at the top are these now.
      patchPinned(qc, event.data);
      // A card that moved (a meeting accepted, cancelled) changes what's coming up.
      if (event.data.kind === 'kit') {
        const id = event.data.conversationId;
        soon(`memory:${id}`, () => void qc.invalidateQueries({ queryKey: qk.memory(id) }), 800);
        soon('spaces', () => void qc.invalidateQueries({ queryKey: ['space'] }), 800);
      }
      return;
    case 'message.deleted':
      patchMessage(qc, event.data.conversationId, event.data.id, (m) => ({
        ...m,
        body: null,
        payload: {},
        entities: {},
        files: [],
        poll: null,
        album: null,
        reactions: [],
        deletedAt: new Date().toISOString(),
      }));
      invalidate(qk.inbox, 'inbox');
      // What it shared, and what was read from it, go with it.
      invalidate(qk.memory(event.data.conversationId));
      invalidate(qk.assets(event.data.conversationId));
      return;
    case 'pins.changed':
      if (typeof event.data.conversationId === 'string')
        invalidate(qk.pins(event.data.conversationId));
      return;
    case 'message.hidden':
      removeMessage(qc, event.data.conversationId, event.data.id);
      invalidate(qk.inbox, 'inbox');
      invalidate(qk.memory(event.data.conversationId));
      invalidate(qk.assets(event.data.conversationId));
      invalidate(qk.pins(event.data.conversationId));
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
      patchCache(qc, qk.conversation(conversationId), (data: unknown) => {
        const d = data as
          | {
              conversation?: {
                participants: Array<{
                  userId: string;
                  readSeq: number | null;
                  deliveredSeq: number;
                }>;
                business: { org: { id: string }; readSeq: number | null } | null;
              };
            }
          | undefined;
        if (!d?.conversation) return data;
        // A customer hears the organization read it, as the organization (R15).
        const business = d.conversation.business;
        const orgRead =
          business && business.org.id === userId && readSeq
            ? { ...business, readSeq: Math.max(business.readSeq ?? 0, readSeq) }
            : business;
        return {
          ...d,
          conversation: {
            ...d.conversation,
            business: orgRead,
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
      // An organization blocked or unblocked: its page, your conversation with it, and whether
      // you follow its updates change.
      invalidate(['org'], 'org');
      invalidate(['conversation'], 'conversation');
      if (event.type === 'block.changed') invalidate(['updates'], 'updates');
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
      // Which rule applies to them follows how you know them, and what Caishy offered is
      // answered once you've said.
      invalidate(['policy-for'], 'policy-for');
      invalidate(['suggestions'], 'suggestions');
      return;
    case 'policies.changed':
      invalidate(qk.policies);
      invalidate(['policy-for'], 'policy-for');
      invalidate(qk.inbox, 'inbox');
      // A person's page says what they see of you.
      invalidate(['person'], 'person');
      return;
    case 'saved.changed':
      invalidate(qk.saved, 'saved');
      return;
    case 'automations.changed':
      invalidate(qk.automations);
      // A collection an automation saves to is listed before anything is in it.
      invalidate(qk.saved, 'saved');
      return;
    case 'updates.changed':
      invalidate(['updates'], 'updates');
      return;
    case 'suggestion.created':
    case 'suggestion.resolved':
      invalidate(['suggestions'], 'suggestions');
      return;
    case 'space.updated': {
      const id = typeof event.data.spaceId === 'string' ? event.data.spaceId : null;
      invalidate(qk.spaces, 'spaces');
      if (id) invalidate(qk.space(id), `space:${id}`);
      return;
    }
    case 'space.removed': {
      const id = typeof event.data.spaceId === 'string' ? event.data.spaceId : null;
      if (id) qc.removeQueries({ queryKey: qk.space(id) });
      invalidate(qk.spaces, 'spaces');
      invalidate(qk.inbox, 'inbox');
      invalidate(qk.inboxAll, 'inbox-all');
      return;
    }
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
    case 'notifications.read': {
      invalidate(qk.notifications);
      // Read anywhere (or taken back): this browser stops showing them on the lock screen too.
      const ids = Array.isArray(event.data.ids)
        ? event.data.ids.filter((id): id is string => typeof id === 'string')
        : [];
      if (event.data.all === true || ids.length)
        void import('@/features/push/webPush')
          .then((p) => p.closeShownNotifications(event.data.all === true ? null : ids))
          .catch(() => {});
      return;
    }
    case 'me.updated':
      // Their plan (or anything else of theirs) changed: what every screen shows of them, the
      // Settings menu too, is asked for again.
      invalidate(qk.me);
      void import('@/state/session').then((m) => m.useSession.getState().refresh());
      return;
    case 'business.updated': {
      // A thread moved (a customer wrote, someone took it, it was resolved): the team's views.
      const id = typeof event.data.threadId === 'string' ? event.data.threadId : null;
      invalidate(['org-inbox'], 'org-inbox');
      invalidate(qk.businessSummary, 'business-summary');
      if (id) invalidate(qk.conversation(id));
      return;
    }
  }
}
