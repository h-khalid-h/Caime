/**
 * What a live event changes (M16 D3): the queries it asks again by `qk`'s own keys, once however
 * many events ask, a sooner ask never put off by a later one, and nothing said about a crowd's
 * messages or a conversation just left.
 */
import type { InboxAllResponse, InboxItemView, MessageView, RealtimeEvent } from '@caime/core/api';
import { QueryClient, type QueryKey } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { qk } from '@/api/keys';
import { applyEvent, leftConversation } from './apply';

const h = vi.hoisted(() => ({
  receipts: vi.fn((_id: string, _body: { delivered: number }) => Promise.resolve({ ok: true })),
  resolve: vi.fn(),
}));

vi.mock('@/api/endpoints', () => ({ endpoints: { receipts: h.receipts } }));
vi.mock('@/features/calls/calls', () => ({ onCallEvent: vi.fn(), onGroupCallEvent: vi.fn() }));
vi.mock('@/state/outbox', () => ({ useOutbox: { getState: () => ({ resolve: h.resolve }) } }));

const me = 'me';
let seq = 0;

/** A message from someone else in `conversationId`. */
const messageIn = (conversationId: string, over: Partial<MessageView> = {}): MessageView => {
  seq += 1;
  return {
    id: `m${seq}`,
    conversationId,
    seq,
    senderId: 'someone',
    kind: 'text',
    body: 'hello',
    payload: {},
    clientId: null,
    mentions: [],
    isQuestion: false,
    isRequest: false,
    replyTo: null,
    createdAt: new Date().toISOString(),
    deletedAt: null,
    ...over,
  } as unknown as MessageView;
};

/** That message, as the socket brings it. */
const arrives = (conversationId: string, over: Partial<MessageView> = {}): RealtimeEvent => ({
  type: 'message.created',
  data: messageIn(conversationId, over),
});

/** The inbox holding one group of `members` people. */
function inboxWith(qc: QueryClient, conversationId: string, members: number) {
  qc.setQueryData<InboxAllResponse>(qk.inboxAll, {
    conversations: [
      {
        id: conversationId,
        kind: 'group',
        memberCount: members,
        pinned: false,
        lastActivityAt: new Date(0).toISOString(),
        lastSeq: 0,
        unreadCount: 0,
        draft: null,
        lastMessage: null,
      } as unknown as InboxItemView,
    ],
  } as unknown as InboxAllResponse);
}

let qc: QueryClient;
let asked: string[];

beforeEach(() => {
  vi.useFakeTimers();
  qc = new QueryClient();
  asked = [];
  vi.spyOn(qc, 'invalidateQueries').mockImplementation(async (filters) => {
    asked.push(JSON.stringify(filters?.queryKey));
  });
  h.receipts.mockClear();
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

const times = (key: QueryKey) => asked.filter((k) => k === JSON.stringify(key)).length;

describe('live events into the cache', () => {
  it('asks again once a burst is over, and says once what arrived', () => {
    inboxWith(qc, 'c-burst', 5);
    for (let i = 0; i < 3; i++) applyEvent(qc, arrives('c-burst'), me);
    vi.advanceTimersByTime(1600);
    expect(times(qk.memory('c-burst'))).toBe(1);
    expect(times(qk.assets('c-burst'))).toBe(1);
    expect(times(qk.spaces)).toBe(1);
    expect(times(qk.allSpaces)).toBe(1);
    // The patched row stands; the inbox is read once, a quarter-minute after the last.
    expect(times(qk.inbox)).toBe(0);
    vi.advanceTimersByTime(15_000);
    expect(times(qk.inbox)).toBe(1);
    expect(h.receipts).toHaveBeenCalledTimes(1);
    expect(h.receipts).toHaveBeenCalledWith('c-burst', { delivered: seq });
  });

  it('never puts off a sooner read with a later one', () => {
    inboxWith(qc, 'c-soon', 5);
    // A mention moves the conversation in the inbox: read again within the second, even though
    // an ordinary message (a quarter-minute's read) follows it.
    applyEvent(qc, arrives('c-soon', { mentions: [me] }), me);
    applyEvent(qc, arrives('c-soon'), me);
    vi.advanceTimersByTime(1300);
    expect(times(qk.inbox)).toBe(1);
    // And the other way round: the ordinary one first, the mention's read is still soon.
    applyEvent(qc, arrives('c-soon'), me);
    applyEvent(qc, arrives('c-soon', { mentions: [me] }), me);
    vi.advanceTimersByTime(1300);
    expect(times(qk.inbox)).toBe(2);
  });

  it('says nothing of a crowd’s messages, and reads its inbox only for what moves it', () => {
    inboxWith(qc, 'c-crowd', 150);
    applyEvent(qc, arrives('c-crowd'), me);
    applyEvent(qc, arrives('c-crowd', { isQuestion: true }), me);
    vi.advanceTimersByTime(20_000);
    expect(h.receipts).not.toHaveBeenCalled();
    expect(times(qk.inbox)).toBe(0);
    applyEvent(qc, arrives('c-crowd', { mentions: [me] }), me);
    vi.advanceTimersByTime(1300);
    expect(times(qk.inbox)).toBe(1);
  });

  it('drops what was waiting for a conversation just left', () => {
    inboxWith(qc, 'c-left', 5);
    applyEvent(qc, arrives('c-left'), me);
    leftConversation('c-left');
    vi.advanceTimersByTime(20_000);
    expect(h.receipts).not.toHaveBeenCalled();
    expect(times(qk.memory('c-left'))).toBe(0);
    expect(times(qk.assets('c-left'))).toBe(0);
  });

  it('asks again everything a connection changes, by qk’s keys', () => {
    applyEvent(qc, { type: 'connection.updated', data: {} }, me);
    applyEvent(qc, { type: 'relationship.changed', data: {} }, me);
    vi.advanceTimersByTime(500);
    for (const key of [
      qk.connections,
      qk.allRequests,
      qk.allPeople,
      qk.inbox,
      qk.allOrgs,
      qk.allConversationViews,
      qk.allRelationshipHistory,
      qk.allPoliciesFor,
      qk.allSuggestions,
    ])
      expect(times(key)).toBe(1);
  });

  it('asks each calendar once for a card moved and one deleted', () => {
    applyEvent(qc, { type: 'message.updated', data: messageIn('c-cal', { kind: 'kit' }) }, me);
    applyEvent(qc, { type: 'message.deleted', data: { id: 'm1', conversationId: 'c-cal' } }, me);
    vi.advanceTimersByTime(1300);
    for (const key of [qk.allCalendars, qk.allOrgCalendars, qk.allOrgOrders, qk.allSlots])
      expect(times(key)).toBe(1);
    // Attention's coming up reads the same cards.
    expect(times(qk.attentionHome)).toBe(1);
  });
});
