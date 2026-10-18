/**
 * Who may do what in a conversation and with an organization (convention 4: one rule, read by
 * the server before it acts and by the app before it offers). The space rules are in
 * `spaces.ts`, an organization's team rules in `orgs.ts`; these are the conversation's own and
 * the under-18 rules an organization meets (R29).
 */
import type { ConversationKind } from './api';
import { canChangeSpaceRole, canRemoveFromSpace, type SpaceRole } from './spaces';

/** A participant's role in a conversation, as `ConversationView.me.role` says it. */
export type ConversationRole = 'owner' | 'admin' | 'member' | (string & {});

/** The roles that run a group, a space or an organization: for a query's `in` list. */
export const MANAGING_ROLES = ['owner', 'admin'] as const;

const manages = (role: string | null | undefined): boolean => role === 'owner' || role === 'admin';

/** Who adds people to a group (PRD §56): its owner and admins. */
export function canAddToGroup(role: ConversationRole | null | undefined): boolean {
  return manages(role);
}

/**
 * Join links (M16 C3e, review 2026-10-17 §1 H5): a link a group's or a space's owner or admins
 * hand out, which lets anyone who opens it in, so a group moves over from another app in one
 * message. Open as long as R1's invites; a group or space a link fills holds as many as a group
 * is started with, its owner beside them; ten open at once is plenty for any one place.
 */
export const JOIN_LINK_DAYS = 30;
/** How long an invitation to a group or a space waits for its answer (M16 B4). */
export const PLACE_INVITE_DAYS = 7;
export const JOIN_LINK_ROOM = 256;
export const JOIN_LINKS_OPEN = 10;

/**
 * Whether a conversation takes a join link of its own: a standalone group. Never a private one
 * (R18: every message is sealed for each device of people chosen one by one, never whoever holds
 * a link), a topic (its group's people are its people) or a space's conversation (the space's
 * link lets people in). The server also refuses a meeting's space, which holds its guests.
 */
export function joinLinkFits(c: {
  kind: ConversationKind | string;
  privacyClass: string;
  parentId: string | null;
  spaceId: string | null;
}): boolean {
  return (
    c.kind === 'group' && c.privacyClass === 'standard' && c.parentId === null && c.spaceId === null
  );
}

/** Who writes in a conversation of a kind: in a broadcast its owner and admins; everyone else reads. */
export function canPostTo(
  kind: ConversationKind | string,
  role: ConversationRole | null | undefined,
): boolean {
  return kind !== 'broadcast' || manages(role);
}

/** Who removes whom from a group: the owner anyone but themselves, admins members (the space rule). */
export function canRemoveFromGroup(actor: ConversationRole, target: ConversationRole): boolean {
  return canRemoveFromSpace(actor as SpaceRole, target as SpaceRole);
}

/** Only a group's owner makes admins, or members again (the space rule). */
export function canChangeGroupRole(actor: ConversationRole, target: ConversationRole): boolean {
  return canChangeSpaceRole(actor as SpaceRole, target as SpaceRole);
}

/**
 * Whose leaving hands the thing on: a group's, a space's or an organization's owner, to
 * `nextOwner`'s choice. Anyone else just goes.
 */
export function handsOverOnLeaving(role: string | null | undefined): boolean {
  return role === 'owner';
}

/** Who changes a conversation's name, purpose, context and settings (PRD §56). */
export function canEditConversation(
  kind: ConversationKind | string,
  role: ConversationRole | null | undefined,
): boolean {
  return kind === 'direct' || manages(role);
}

/**
 * Who removes someone else's message for everyone: a group's owner and admins. In a
 * one-to-one nobody moderates the other (each deletes their own, or hides for themselves).
 */
export function canRemoveOthersMessages(
  kind: ConversationKind | string,
  role: ConversationRole | null | undefined,
): boolean {
  return kind !== 'direct' && manages(role);
}

/**
 * Who sets disappearing messages: either side of a one-to-one, a group's owner and admins, and
 * never in a group's topic, which follows its group (PRD §58).
 */
export function canChangeDisappearing(
  kind: ConversationKind | string,
  role: ConversationRole | null | undefined,
  isTopic: boolean,
): boolean {
  return !isTopic && canEditConversation(kind, role);
}

/**
 * Under 18, a person writes only to an organization that has proved who it is (R29): a school,
 * a club, a clinic with its domain verified. An adult writes to any.
 */
export function minorMayWriteToOrg(minor: boolean, orgVerified: boolean): boolean {
  return !minor || orgVerified;
}
