import type { ConversationView, MessageView } from '@caime/core/api';
import { describe, expect, it } from 'vitest';
import { joinFromLink, meetingCall } from './meetingCall';

const can = { calls: true, groupCalls: true };
const direct = (kind = 'person', extra: Partial<ConversationView> = {}) =>
  ({
    kind: 'direct',
    request: null,
    participants: [{}, {}],
    other: { person: { id: 'p', kind } },
    ...extra,
  }) as unknown as ConversationView;
const group = (n: number) =>
  ({
    kind: 'group',
    request: null,
    participants: Array.from({ length: n }, () => ({})),
    other: null,
  }) as unknown as ConversationView;

describe('the call a meeting’s Join opens (R83)', () => {
  it('is the direct call with someone who can be called', () => {
    expect(meetingCall(direct(), can)).toBe('direct');
  });
  it('is none with someone reached by mail, a request, or where calls can’t be made', () => {
    expect(meetingCall(direct('provisional'), can)).toBeNull();
    expect(meetingCall(direct('person', { request: {} } as never), can)).toBeNull();
    expect(meetingCall(direct(), { calls: false, groupCalls: true })).toBeNull();
    expect(meetingCall(null, can)).toBeNull();
  });
  it('is the group call in a group of up to eight', () => {
    expect(meetingCall(group(8), can)).toBe('group');
    expect(meetingCall(group(9), can)).toBeNull();
    expect(meetingCall(group(3), { calls: true, groupCalls: false })).toBeNull();
  });
  it('is none with Cai or a Caime Friend', () => {
    expect(meetingCall(direct('assistant'), can)).toBeNull();
    expect(meetingCall(direct('character'), can)).toBeNull();
  });
});

describe('joining from an address (R83)', () => {
  const at = '2026-10-13T10:00:00.000Z';
  const now = new Date(at);
  const conv = { ...direct(), id: 'c1' } as unknown as ConversationView;
  const card = (over: Partial<MessageView> = {}, payload: Record<string, unknown> = {}) =>
    ({
      id: 'm1',
      conversationId: 'c1',
      kind: 'kit',
      deletedAt: null,
      payload: {
        kit: 'meeting',
        state: 'accepted',
        fields: { start: { at, hasTime: true }, durationMinutes: 30 },
        ...payload,
      },
      ...over,
    }) as unknown as MessageView;
  it('calls only for an accepted meeting held here, now, in a conversation that can call', () => {
    expect(joinFromLink(card(), conv, can, now)).toBe('direct');
  });
  it('starts nothing for a missing, deleted, other or not-yet card, or another conversation', () => {
    expect(joinFromLink(undefined, conv, can, now)).toBeNull();
    expect(joinFromLink(card({ deletedAt: at }), conv, can, now)).toBeNull();
    expect(joinFromLink(card({ kind: 'text' } as never), conv, can, now)).toBeNull();
    expect(joinFromLink(card({}, { state: 'proposed' }), conv, can, now)).toBeNull();
    expect(joinFromLink(card({}, { kit: 'appointment' }), conv, can, now)).toBeNull();
    expect(joinFromLink(card(), conv, can, new Date(Date.parse(at) - 3_600_000))).toBeNull();
    expect(joinFromLink(card({ conversationId: 'c2' }), conv, can, now)).toBeNull();
    expect(
      joinFromLink(card({}, { fields: { start: { at }, place: 'Room 4' } }), conv, can, now),
    ).toBeNull();
  });
});
