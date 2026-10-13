import type { ConversationView, MessageView } from '@caime/core/api';
import { GROUP_CALL_MAX } from '@caime/core/calls';
import { meetingAction } from '@caime/core/meetings';
import { isSystemKind } from '@caime/core/system-ids';

/**
 * Which call a meeting's Join opens in its conversation (R83), by the same rules as the
 * conversation's own call buttons: a direct conversation with someone who can be called (not
 * Cai or a friend, not a request, not someone reached by mail), or a group of up to eight.
 * Null where there's no call to make.
 */
export function meetingCall(
  c: ConversationView | null | undefined,
  can: { calls: boolean; groupCalls: boolean },
): 'direct' | 'group' | null {
  if (!c) return null;
  if (c.kind === 'direct') {
    const other = c.other;
    if (!other || !can.calls || c.request) return null;
    if (isSystemKind(other.person.kind) || other.person.kind === 'provisional') return null;
    return 'direct';
  }
  if (c.kind === 'group') {
    return can.groupCalls && c.participants.length <= GROUP_CALL_MAX ? 'group' : null;
  }
  return null;
}

/**
 * Joining from an address (R83: `?join=` from the calendar or a calendar app): the call to open
 * only when the card is there, not deleted, an accepted meeting held on Caime that can be joined
 * now, in a conversation where the call can be made. Anything else opens the conversation at the
 * card and starts nothing, so an address alone never places a call.
 */
export function joinFromLink(
  card: MessageView | undefined,
  c: ConversationView | null | undefined,
  can: { calls: boolean; groupCalls: boolean },
  now: Date,
): 'direct' | 'group' | null {
  if (!card || card.deletedAt || card.kind !== 'kit' || card.conversationId !== c?.id) return null;
  if (meetingAction((card.payload ?? {}) as Parameters<typeof meetingAction>[0], now) !== 'join')
    return null;
  return meetingCall(c, can);
}
