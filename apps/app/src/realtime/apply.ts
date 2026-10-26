/**
 * Turn a realtime event into cache changes. Data events edit the cache directly (instant);
 * signal events invalidate the queries they affect (refetched once, debounced).
 */
import type { RealtimeEvent } from '@caime/core/api';
import { isLargeGroup } from '@caime/core/large-group';
import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { onCaiEvent, onCallEvent, onGroupCallEvent, onNotesEvent } from '@/features/calls/calls';
import {
  applyEditToInbox,
  applyMessageToInbox,
  draftGone,
  patchCache,
  patchMessage,
  patchPinned,
  removeMessage,
  updateMessage,
  upsertMessage,
} from '@/state/cache';
import { useLive } from '@/state/live';
import { useOutbox } from '@/state/outbox';

const pending = new Map<string, { timer: ReturnType<typeof setTimeout>; ms: number }>();

/**
 * Collapse bursts: many asks for one key within the window run it once, a moment after the last.
 * A slower ask never puts off a sooner one already waiting (a message that moves the inbox is read
 * again within its second even when an ordinary one follows it), and a key is always the same
 * work: an invalidation's key is its query's (M16 D3).
 */
function soon(key: string, fn: () => void, ms = 400): void {
  const waiting = pending.get(key);
  if (waiting && waiting.ms < ms) return;
  if (waiting) clearTimeout(waiting.timer);
  pending.set(key, {
    ms,
    timer: setTimeout(() => {
      pending.delete(key);
      fn();
    }, ms),
  });
}

const keyOf = (key: QueryKey) => JSON.stringify(key);

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
    ...[
      qk.conversation(conversationId),
      qk.memory(conversationId),
      qk.assets(conversationId),
      qk.pins(conversationId),
      qk.messages(conversationId),
    ].map(keyOf),
  ]) {
    const waiting = pending.get(key);
    if (waiting) clearTimeout(waiting.timer);
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
  /** Asked again a moment later, once however many events ask (`qk`'s keys only). */
  const invalidate = (key: QueryKey, ms?: number) =>
    soon(keyOf(key), () => void qc.invalidateQueries({ queryKey: key }), ms);
  // The calendar and an organization's bookings read cards: asked again, once, a moment later.
  const calendarChanged = () => {
    for (const key of [
      qk.allCalendars,
      qk.allOrgCalendars,
      qk.allOrgOrders,
      qk.allSlots,
      qk.attentionHome,
    ])
      invalidate(key, 1200);
  };

  switch (event.type) {
    case 'call.ringing':
    case 'call.updated':
    case 'call.signal':
      onCallEvent(event);
      // Over: it's in the call history now.
      if (event.type === 'call.updated' && event.data.state === 'ended') invalidate(qk.allCalls);
      return;
    case 'devices.changed':
      // Someone's devices for private conversations changed (mine too: one of mine may be
      // waiting to be approved): what's sealed for, and each code, is looked at again (R18).
      void import('@/features/e2ee/private')
        .then((p) => p.devicesChanged(event.data.userId))
        .catch(() => {});
      return;
    case 'call.notes':
      // Cai's notes in a call were asked for, began, moved or stopped (M16 F7).
      onNotesEvent(event);
      return;
    case 'call.cai':
    case 'call.cai.written':
    case 'call.cai.frame':
      // Cai spoke in a call, wrote to this person in it (M17 I13g), or asks the recorder for a
      // picture of the screen (M17 I13h).
      onCaiEvent(event);
      return;
    case 'callnotes.changed':
      // Words heard in a call's notes, or a line deleted: whoever reads them reads them again.
      invalidate(qk.callNotes(String(event.data.callId)));
      return;
    case 'groupcall.ringing':
    case 'groupcall.updated':
    case 'groupcall.signal':
      onGroupCallEvent(event);
      if (event.type === 'groupcall.updated' && event.data.state === 'ended')
        invalidate(qk.allCalls);
      return;
    case 'message.created': {
      const m = event.data;
      const mine = m.senderId === me;
      if (mine && m.clientId) useOutbox.getState().resolve(m.clientId);
      // Sending cleared their draft there on the account, whichever device sent it.
      if (mine) draftGone(qc, m.conversationId);
      upsertMessage(qc, m);
      const reading = useLive.getState().openConversationId === m.conversationId;
      if (m.senderId) useLive.getState().clearTyping(m.conversationId, m.senderId);
      const item = applyMessageToInbox(qc, m, { mine, reading });
      // A group of many (M16 D2b): nobody's ticks are shown there, so nothing says it arrived,
      // and its every message is no reason for hundreds of devices to read their inboxes again.
      const crowd = item !== null && isLargeGroup(item.kind, item.memberCount);
      if (!item) {
        invalidate(qk.inbox);
        invalidate(qk.missed);
      } else {
        // The patch carries the row (preview, unread, order). What it can't know is a move
        // between sections, which only a message to me can make (a mention, a question or a
        // request; in a crowd a question or request only when it answers me, as the server
        // reads a group): that is read again soon, and the rest in one trailing read a
        // quarter-minute on, since the inbox is the heaviest read there is (docs/RESOURCES.md).
        // A crowd's patch stands until the next read.
        const asks = (m.isQuestion || m.isRequest) && (!crowd || m.replyTo?.senderId === me);
        const moves = !mine && (m.mentions.includes(me) || asks);
        if (moves || !crowd) {
          invalidate(qk.inbox, moves ? 1200 : 15_000);
          // What they missed (M17 I3) is read from the same unread: again when the inbox is.
          invalidate(qk.missed, moves ? 1200 : 15_000);
        }
      }
      if (!mine && !crowd) ackDelivered(m.conversationId, m.seq);
      // Dates, amounts, open items and what's shared are read from messages: refresh them.
      invalidate(qk.memory(m.conversationId), 1500);
      invalidate(qk.assets(m.conversationId), 1500);
      // A space shows its conversations' unread counts: refresh whichever space is on screen.
      invalidate(qk.spaces, 1500);
      invalidate(qk.allSpaces, 1500);
      // A dated card (a meeting, an appointment) is on the calendar (R51), and may be the next
      // at the conversation's top (R123).
      if (m.kind === 'kit') {
        calendarChanged();
        invalidate(qk.nextCard(m.conversationId), 800);
      }
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
        invalidate(qk.memory(id), 800);
        invalidate(qk.nextCard(id), 800);
        invalidate(qk.allSpaces, 800);
        calendarChanged();
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
      invalidate(qk.inbox);
      invalidate(qk.missed);
      // What it shared, and what was read from it, go with it; a dated card leaves the calendar.
      invalidate(qk.memory(event.data.conversationId));
      invalidate(qk.assets(event.data.conversationId));
      invalidate(qk.nextCard(event.data.conversationId));
      calendarChanged();
      return;
    case 'pins.changed':
      if (typeof event.data.conversationId === 'string')
        invalidate(qk.pins(event.data.conversationId));
      return;
    case 'message.hidden':
      removeMessage(qc, event.data.conversationId, event.data.id);
      invalidate(qk.inbox);
      invalidate(qk.missed);
      invalidate(qk.memory(event.data.conversationId));
      invalidate(qk.assets(event.data.conversationId));
      invalidate(qk.pins(event.data.conversationId));
      calendarChanged();
      return;
    case 'message.sent':
      useOutbox.getState().resolve(event.data.clientId);
      return;
    case 'scheduled.changed':
      invalidate(qk.scheduled(event.data.conversationId));
      invalidate(qk.conversation(event.data.conversationId));
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
      if (userId === me) {
        invalidate(qk.inbox);
        // A conversation read leaves what they missed (M17 I3).
        invalidate(qk.missed);
      }
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
      // The inbox's one list is under its key (`qk.inboxAll` too).
      invalidate(qk.inbox);
      // Archived, muted or marked quiet, a conversation leaves what they missed (M17 I3).
      invalidate(qk.missed);
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
      invalidate(qk.allRequests);
      invalidate(qk.allPeople);
      invalidate(qk.inbox);
      // An organization blocked or unblocked: its page, your conversation with it, and whether
      // you follow its updates change.
      invalidate(qk.allOrgs);
      invalidate(qk.allConversationViews);
      if (event.type === 'block.changed') invalidate(qk.allUpdates);
      return;
    case 'connection.request':
    case 'connection.request.resolved':
      invalidate(qk.allRequests);
      invalidate(qk.allPeople);
      return;
    case 'relationship.changed':
    case 'relationship.shared':
      invalidate(qk.connections);
      invalidate(qk.allPeople);
      invalidate(qk.allRelationshipHistory);
      invalidate(qk.allConversationViews);
      invalidate(qk.inbox);
      // Which rule applies to them follows how you know them, and what Caime offered is
      // answered once you've said.
      invalidate(qk.allPoliciesFor);
      invalidate(qk.allSuggestions);
      return;
    case 'policies.changed':
      invalidate(qk.policies);
      invalidate(qk.allPoliciesFor);
      invalidate(qk.inbox);
      // A person's page says what they see of you.
      invalidate(qk.allPeople);
      return;
    case 'saved.changed':
      invalidate(qk.saved);
      return;
    case 'automations.changed':
      invalidate(qk.automations);
      // A collection an automation saves to is listed before anything is in it.
      invalidate(qk.saved);
      return;
    case 'updates.changed':
      invalidate(qk.allUpdates);
      return;
    case 'apps.changed':
      // An app let in or out, an account connected (R90), the calendar feed, a listing changed or reviewed (M15): Connected,
      // Developer, Discover and an organization's listings read again.
      invalidate(qk.connectedApps);
      invalidate(qk.accounts);
      invalidate(qk.oauthApps);
      invalidate(qk.calendarFeed);
      invalidate(qk.allDirectory);
      invalidate(qk.allOrgListings);
      return;
    case 'booking.changed':
      // A host's offer saved (hours, catalog, ordering, ways to be paid) on another device.
      if (event.data.orgId === null) invalidate(qk.myBooking);
      else {
        invalidate(qk.allOrgs);
        // The door's Book link follows the catalog (C2a).
        invalidate(qk.allOrgDoors);
      }
      invalidate(qk.allSlots);
      return;
    case 'family.changed':
      // A child signed up, was agreed to or let go of, or a request waits on a parent (R122).
      invalidate(qk.family);
      return;
    case 'invites.changed':
      // Asked into a group or a space, or an invitation answered on another device (M16 B4):
      // Attention carries them.
      invalidate(qk.attentionHome);
      return;
    case 'join.asked':
      // Someone asked through a link to a place this person runs, or an ask was answered on
      // another device (C3h): who waits, and how many each link let in, read again.
      invalidate(qk.allJoinRequests);
      invalidate(qk.allJoinLinks);
      return;
    case 'suggestion.created':
    case 'suggestion.resolved':
      invalidate(qk.allSuggestions);
      return;
    case 'space.updated': {
      const id = typeof event.data.spaceId === 'string' ? event.data.spaceId : null;
      invalidate(qk.spaces);
      if (id) invalidate(qk.space(id));
      return;
    }
    case 'space.removed': {
      const id = typeof event.data.spaceId === 'string' ? event.data.spaceId : null;
      if (id) qc.removeQueries({ queryKey: qk.space(id) });
      invalidate(qk.spaces);
      invalidate(qk.inbox);
      return;
    }
    case 'task.created':
    case 'task.updated':
    case 'task.deleted':
      invalidate(qk.allTasks);
      invalidate(qk.attentionHome);
      // The open conversation's line above the composer counts its actions (R66).
      invalidate(qk.allConversationViews);
      invalidate(qk.allMemory);
      invalidate(qk.inbox);
      return;
    case 'decision.created':
    case 'decision.updated':
      invalidate(qk.allDecisions);
      invalidate(qk.allMemory);
      return;
    case 'notifications.read': {
      invalidate(qk.notifications);
      // Read anywhere (or taken back): this browser stops showing them on the lock screen too.
      const ids = Array.isArray(event.data.ids)
        ? event.data.ids.filter((id): id is string => typeof id === 'string')
        : [];
      if (event.data.all === true || ids.length)
        void import('@/features/push/push')
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
      // The team's quick replies changed (M16 H2): its composers' list alone.
      if (event.data.quickReplies === true && typeof event.data.orgId === 'string') {
        invalidate(qk.quickReplies(event.data.orgId));
        return;
      }
      // Its forms changed (M16 H5): the setup's list, and the forms its conversations offer.
      if (event.data.forms === true && typeof event.data.orgId === 'string') {
        invalidate(qk.orgForms(event.data.orgId));
        invalidate(qk.allConversationViews);
        return;
      }
      // Its AI agent was removed with drafts nobody sent (M16 G6b): every thread and conversation
      // that showed one.
      if (event.data.drafts === true) {
        invalidate(qk.allOrgInboxes);
        invalidate(qk.allConversationViews);
        return;
      }
      // What the team keeps about a customer changed (M16 H3): that record, and the tags in use.
      if (typeof event.data.customerId === 'string' && typeof event.data.orgId === 'string') {
        invalidate(qk.customerRecord(event.data.orgId, event.data.customerId));
        invalidate(qk.customerTags(event.data.orgId));
      }
      // A thread moved (a customer wrote, someone took it, it was resolved): the team's views.
      const id = typeof event.data.threadId === 'string' ? event.data.threadId : null;
      invalidate(qk.allOrgInboxes);
      invalidate(qk.businessSummary);
      if (id) invalidate(qk.conversation(id));
      else {
        // No thread: the team itself changed (someone joined, through an invite too, or left):
        // its page, the organizations someone is on, and the invites still open.
        invalidate(qk.allOrgs);
        invalidate(qk.orgs);
        invalidate(qk.allTeamInvites);
      }
      return;
    }
  }
}
