/**
 * Who may do what in a conversation and with an organization (convention 4: one rule, read by
 * the server before it acts and by the app before it offers). The space rules are in
 * `spaces.ts`, an organization's team rules in `orgs.ts`; these are the conversation's own and
 * the under-18 rules an organization meets (R29).
 */
import type { ConversationKind } from './api';

/** A participant's role in a conversation, as `ConversationView.me.role` says it. */
export type ConversationRole = 'owner' | 'admin' | 'member' | (string & {});

const manages = (role: string | null | undefined): boolean => role === 'owner' || role === 'admin';

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
