/**
 * An organization's quick replies (M16 H2): what its team keeps for what customers ask often,
 * found from the composer by "/" and the start of a shortcut. Light: the conversation screen
 * reads it.
 */
import { foldForFind } from './fold';

/** The most a team keeps. */
export const QUICK_REPLIES_MAX = 100;
/** The most a quick reply says. */
export const QUICK_REPLY_CHARS = 2000;
/** The most an automatic reply (a greeting, an away message) says. */
export const AUTO_REPLY_CHARS = 1000;
/** A shortcut: one word of letters in any script, digits, - or _, up to 30, as typed after "/". */
export const SHORTCUT_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N}_-]{0,29}$/u;

/**
 * What's being asked for when the words are only "/" and the start of a shortcut ("/hou"),
 * folded as finds are; null for anything else (a "/" further in, a space after it).
 */
export function quickReplyQuery(text: string): string | null {
  const m = /^\/([^\s/]*)$/u.exec(text);
  return m ? foldForFind(m[1] ?? '') : null;
}

/** The replies whose shortcut starts with what's asked for, in the team's own order. */
export function matchingReplies<R extends { shortcut: string }>(
  replies: readonly R[],
  query: string,
): R[] {
  return replies.filter((r) => foldForFind(r.shortcut).startsWith(query));
}
