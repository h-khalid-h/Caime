/**
 * Caime Mail (PRODUCT-REVIEW R75): what the app and the server both say of a mail's subject. A
 * thread is a topic named by its subject without the replies' prefixes, and a first mail nobody
 * gave a subject takes its first line: the composer offers it, the server sends it.
 */
import { truncate } from './format';

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
  return truncate(line, SUBJECT_LINE_MAX);
}

/** The subject an answer carries: the thread's, under one "Re:"; null without a subject to answer. */
export function replySubject(subject: string | null | undefined): string | null {
  if (!subject) return null;
  return `Re: ${bareSubject(subject) ?? subject}`;
}

/** What a mail says of itself, for telling a notice from a person's mail (R75). */
export interface MailSignals {
  /** List-Id or List-Unsubscribe: sent to a list. */
  list: boolean;
  /** Precedence: bulk, list or junk. */
  precedence: string | null;
  /** Auto-Submitted, other than "no": written by a machine. */
  autoSubmitted: string | null;
}

/** Local parts a person doesn't answer from: a no-reply address, a notifier, a bounce. */
const NO_REPLY =
  /^(no[-_.]?reply|do[-_.]?not[-_.]?reply|donotreply|notifications?|notify|alerts?|newsletters?|news|mailer[-_.]?daemon|bounces?|postmaster|updates?|marketing|digest)([-_.+].*)?$/i;

/**
 * A notice (R75): mail sent to a list, by a machine, or from an address nobody answers. It is
 * never a person's and never a request, so a mail declaring itself one only makes itself
 * quieter: a sender can't use it to reach anyone sooner.
 */
export function isNoticeMail(fromAddress: string, signals: MailSignals): boolean {
  if (signals.list) return true;
  const precedence = signals.precedence?.trim().toLowerCase();
  if (precedence === 'bulk' || precedence === 'list' || precedence === 'junk') return true;
  const auto = signals.autoSubmitted?.trim().toLowerCase();
  if (auto && auto !== 'no') return true;
  const local = fromAddress.split('@')[0] ?? '';
  return NO_REPLY.test(local);
}

/**
 * How often someone reached by email may be written to again before they answer (M16 F2): as
 * anyone writing by mail follows up, once a day has passed since the last, twice at most. Anyone
 * on Caime is asked once (a message request), and nobody hears more until they answer.
 */
export const MAIL_FOLLOW_UPS = 2;
export const MAIL_FOLLOW_UP_AFTER_MS = 24 * 3_600_000;
