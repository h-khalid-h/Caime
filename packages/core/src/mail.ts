/**
 * Caime Mail (PRODUCT-REVIEW R75): what the app and the server both say of a mail's subject. A
 * thread is a topic named by its subject without the replies' prefixes, and a first mail nobody
 * gave a subject takes its first line: the composer offers it, the server sends it.
 */
import { truncate } from './format';
import { tr } from './i18n';
import { meetingVenue } from './meetings';
import { isRepeat } from './repeat';

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

/**
 * The cards that reach someone by email (M16 F3, review 2026-10-17 §6), each said in words as it
 * reads on Caime, a meeting's and an appointment's with the calendar invitation whose answer
 * comes back to move it. A card that asks for taps nobody can make in a mail (an approval, a
 * review, a checklist, an album, a split, a form) isn't offered there and isn't sent.
 */
export const MAIL_CARDS = [
  'meeting',
  'appointment',
  'payment_request',
  'invoice',
  'order_status',
  'delivery',
  'purchase_order',
  'support_ticket',
] as const;

/** Why a message can't reach someone by email (M16 F3); null when a mail carries it. */
export type NotByMail = 'kind' | 'repeats' | 'live' | 'where';

/**
 * Whether a message, as its kind and payload say, reaches someone by email: words, photos,
 * files and a voice note's recording go as they are; a place as its line and a map; a card of
 * `MAIL_CARDS` in words. Never a sticker, a poll, a contact, a live location (it moves after the
 * mail has gone), a time that repeats, or a meeting held on Caime outside a one-to-one: in one
 * (`oneToOne`), its mail carries their own link to its call (M16 F6c).
 */
export function notByMail(kind: string, payload: unknown, oneToOne = false): NotByMail | null {
  const p = (payload ?? {}) as {
    kit?: unknown;
    fields?: Record<string, unknown>;
    live?: unknown;
    invitation?: unknown;
    recording?: unknown;
  };
  switch (kind) {
    case 'text':
      // A call's recording shared on (R114 (7)) plays in Caime alone.
      return p.recording ? 'kind' : null;
    case 'media':
    case 'file':
    case 'voice':
      return null;
    case 'location':
      return p.live ? 'live' : null;
    case 'kit':
      if (!(MAIL_CARDS as readonly unknown[]).includes(p.kit)) return 'kind';
      if (isRepeat(p.fields?.repeat)) return 'repeats';
      if (
        p.kit === 'meeting' &&
        !oneToOne &&
        meetingVenue(p.fields?.place, p.invitation) === 'caime'
      )
        return 'where';
      return null;
    default:
      return 'kind';
  }
}

/** What the refusal says, on the device before it's sent and from the server after. */
export function notByMailText(reason: NotByMail): string {
  switch (reason) {
    case 'repeats':
      return tr('A time that repeats doesn’t travel by email: send one time.');
    case 'live':
      return tr('A live location doesn’t travel by email: share the place.');
    case 'where':
      return tr('Say where it is: someone reached by email can’t join a call on Caime.');
    default:
      return tr('That doesn’t travel by email: they’d never see it.');
  }
}
