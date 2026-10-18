/**
 * A group of many (M16 D2b, review 2026-10-17 §4 H5): past a hundred people, a group is a crowd.
 * Nobody's devices say what arrived (a message's delivered ticks cost each device a request and
 * the server five queries), nobody is seen typing, each device patches its inbox rather than
 * reading it again, and what someone the recipient doesn't know says to everyone waits in their
 * inbox (R97 (3), `decideNotification`'s `crowd`). One number, read by the server before it
 * tells anyone and by the app before it asks; apart from `permissions.ts` so the live events'
 * applier carries nothing else.
 */
import type { ConversationKind } from './api';

export const LARGE_GROUP = 100;

/** The kinds of conversation that can be one: never a chat or an organization's thread. */
export const LARGE_GROUP_KINDS: readonly string[] = ['group', 'broadcast'];

/** A conversation of this kind with this many people in it (its owner too) is a crowd. */
export function isLargeGroup(kind: ConversationKind | string, memberCount: number): boolean {
  return LARGE_GROUP_KINDS.includes(kind) && memberCount > LARGE_GROUP;
}
