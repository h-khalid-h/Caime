import type { ConversationView } from '@caime/core/api';
import { describe, expect, it } from 'vitest';
import { meetingCall } from './meetingCall';

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
