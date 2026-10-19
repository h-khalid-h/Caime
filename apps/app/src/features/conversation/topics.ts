/**
 * Where a subject can have a conversation of its own (PRD §58), as the server decides it
 * (`assertCanStartTopic`): a one-to-one with someone you're connected with, or with someone
 * reached by mail (R75), or a group that isn't in a space (a space has its own conversations).
 */
import type { ConversationView } from '@caime/core/api';

/**
 * A one-to-one with someone reached by mail (R75): nothing about them is live, and a first mail
 * to them names its topic.
 */
export function mailBound(c: ConversationView): boolean {
  return c.kind === 'direct' && c.other?.person.kind === 'provisional';
}

/**
 * The other side reads this by email (M16 F3): a one-to-one with someone reached by mail, or on
 * an organization's side, a customer who writes by mail. Only what a mail carries is offered
 * (core `notByMail`), as the server sends only that.
 */
export function reachedByMail(c: ConversationView): boolean {
  return mailBound(c) || c.business?.thread?.customer?.kind === 'provisional';
}

export function topicsFor(c: ConversationView): 'direct' | 'group' | null {
  // Only between people connected now (a view from before says nothing, so offers nothing).
  if (
    c.kind === 'direct' &&
    c.isGeneral &&
    c.other &&
    !c.request &&
    c.privacyClass !== 'private' &&
    (c.connected === true || mailBound(c))
  )
    return 'direct';
  if (c.kind === 'group' && !c.space && !c.parentId) return 'group';
  return null;
}
