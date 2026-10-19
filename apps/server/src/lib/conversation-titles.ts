/**
 * What a conversation is called for one reader, as their inbox names it (PRD §19): the
 * organization to its customer (R15, and the organization they write for, R64), a space's
 * conversation by its space, a one-to-one by the other person or its topic, a group's topic by
 * its group. The inbox and a person's feed (M16 G5) read it here, so the two never differ.
 */
import { tr } from '@caime/core';
import { spaceConversationTitle } from './spaces';

export interface TitledConversation {
  kind: string;
  title: string | null;
  is_general: boolean;
  parent_id: string | null;
  /** A group topic's group's own title. */
  group_title: string | null;
}

export interface TitleParts {
  /** The organization a customer talks to, or null for anyone else. */
  org: { name: string } | null;
  /** The organization the customer writes for (R64), when they do. */
  asOrg: string | null;
  space: { name: string } | null;
  /** In a one-to-one, the other person. */
  other: { displayName: string } | null | undefined;
}

export function conversationTitle(c: TitledConversation, parts: TitleParts): string {
  if (parts.org)
    return parts.asOrg
      ? tr('{name}, for {org}', { name: parts.org.name, org: parts.asOrg })
      : parts.org.name;
  if (parts.space) return spaceConversationTitle(parts.space, c);
  if (c.kind === 'direct')
    return c.is_general ? (parts.other?.displayName ?? 'Deleted account') : (c.title ?? 'Topic');
  if (c.parent_id && c.kind === 'group') return c.group_title ?? 'Group';
  return c.title ?? 'Group';
}

/** A topic's own name, beside its conversation's (a one-to-one's topic, a group's). */
export const conversationTopic = (c: TitledConversation): string | null =>
  (c.kind === 'direct' && !c.is_general) || (c.parent_id && c.kind === 'group') ? c.title : null;
