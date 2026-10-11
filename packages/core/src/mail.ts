/**
 * Caime Mail (PRODUCT-REVIEW R75): what the app and the server both say of a mail's subject. A
 * thread is a topic named by its subject without the replies' prefixes, and a first mail nobody
 * gave a subject takes its first line: the composer offers it, the server sends it.
 */

/** A topic's name, and so a subject, is at most this long. */
export const SUBJECT_MAX = 120;
/** A subject read from a first line is cut here: what mail clients show whole. */
export const SUBJECT_LINE_MAX = 72;

/**
 * A subject without the replies' and forwards' prefixes (Re:, Fwd:, their stacking and counts,
 * the French, German, Scandinavian and Arabic ones), trimmed to what a topic is named; null when
 * nothing is left.
 */
export function bareSubject(subject: string | null | undefined): string | null {
  const s = (subject ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(?:(?:re|fwd?|fw|aw|tr|sv|vs|wg|رد|إعادة توجيه|إ\.ت)\s*(?:\[\d+\])?\s*:\s*)+/iu, '')
    .trim();
  return s.length ? s.slice(0, SUBJECT_MAX) : null;
}

/** The first line of a message's words as its subject, cut to a mail's width; null without one. */
export function subjectFromText(text: string): string | null {
  const line = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length);
  if (!line) return null;
  return line.length > SUBJECT_LINE_MAX
    ? `${line.slice(0, SUBJECT_LINE_MAX - 1).trimEnd()}…`
    : line;
}

/** The subject an answer carries: the thread's, under one "Re:"; null without a subject to answer. */
export function replySubject(subject: string | null | undefined): string | null {
  if (!subject) return null;
  return `Re: ${bareSubject(subject) ?? subject}`;
}
