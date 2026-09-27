/**
 * Pinned messages (PRD §22, §56): a few messages a conversation keeps at its top for everyone in
 * it. Pinned and unpinned by whoever may change the conversation: either person in a one-to-one,
 * a group's owner and admins; never in a conversation with an organization.
 */

/** The most a conversation keeps pinned at once. */
export const PINNED_MAX = 5;

export const canPin = (kind: string, role: string): boolean =>
  kind !== 'business' && (kind === 'direct' || role === 'owner' || role === 'admin');
