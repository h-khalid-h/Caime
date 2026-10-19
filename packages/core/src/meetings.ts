/**
 * Meetings (R83): planned, with a time and people, held on Caime, in person, or on another
 * service. Where it's held is the Meeting kit's own Where: empty (or "Caime"), it's held here and
 * has a Join; a web address, it's on another service and Caime only opens the link; anything
 * else is a place, in person. A call is unplanned and rings; a meeting's Join opens the call of
 * its conversation at its time, and nothing else starts one.
 */

export type MeetingVenue = 'caime' | 'link' | 'place';

/**
 * Cai's own address at Caime's mail domain (R86): `assistant@cai.me`. It sends a meeting's
 * invitations for whoever invites, and reads the guests' answers to them; nothing else.
 */
export const CAI_MAIL = 'assistant';

/** Join opens this long before a meeting starts. */
export const JOIN_EARLY_MS = 10 * 60_000;
/** And stays open this long after its planned end, since meetings run over. */
export const JOIN_LATE_MS = 30 * 60_000;
/** A card whose length isn't known is taken as this long, wherever its end is read. */
export const CARD_MINUTES = 60;

/**
 * When a meeting or an appointment ends (M16 D3), the one rule every reader takes: a booking's
 * own end (a catalog item's length, a stay's nights), else the minutes its card says it lasts (a
 * day at most: what a device sent is never trusted), else an hour. `at` is its start (epoch ms);
 * a booking's end that isn't after its start is no end.
 */
export function cardEndMs(
  at: number,
  card: { durationMinutes?: unknown; booking?: { endAt?: unknown } | null },
): number {
  const endAt = card.booking?.endAt;
  const booked = typeof endAt === 'string' ? Date.parse(endAt) : Number.NaN;
  if (Number.isFinite(booked) && booked > at) return booked;
  const asked = Number(card.durationMinutes);
  const minutes = Number.isFinite(asked) && asked > 0 ? Math.min(asked, 24 * 60) : CARD_MINUTES;
  return at + minutes * 60_000;
}

const CAIME = /^(on\s+)?ca[iı]me$/i;
// A web address, with or without its scheme (meet.google.com/abc-defg-hij, zoom.us/j/123): one
// word, a dot in its host, nothing a street address has (no spaces, no commas).
const LINK = /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(:\d+)?(\/\S*)?$/i;

/**
 * Where a meeting is held, from what its Where says. Never throws on what a device sent. A card
 * made of an invitation from someone's calendar (M16 F4, `invitation`) is held where its organizer
 * says: on another service or at a place, never on Caime, and a Where it never said is a place
 * nobody named (nothing to join, no guests to ask).
 */
export function meetingVenue(place: unknown, invitation?: unknown): MeetingVenue {
  const p = typeof place === 'string' ? place.trim() : '';
  if (/^https?:\/\//i.test(p) || LINK.test(p)) return 'link';
  if (invitation) return 'place';
  if (!p || CAIME.test(p)) return 'caime';
  return 'place';
}

/** The address to open for a meeting on another service: its scheme added when it has none. */
export function meetingLink(place: string): string {
  const p = place.trim();
  return /^https?:\/\//i.test(p) ? p : `https://${p}`;
}

/** Whether a meeting from `at` to `end` (epoch ms) can be joined at `now`. */
function windowOpen(at: number, end: number, now: Date): boolean {
  const t = now.getTime();
  return t >= at - JOIN_EARLY_MS && t <= Math.max(end, at) + JOIN_LATE_MS;
}

/**
 * Whether a meeting held on Caime can be joined now: from ten minutes before it starts to half
 * an hour after it was planned to end. `start` is the card's field as stored (`{ at, hasTime }`);
 * a day without a time, or a start that isn't a date, is never open.
 */
export function joinOpen(start: unknown, durationMinutes: unknown, now: Date): boolean {
  const s = (start ?? {}) as { at?: unknown; hasTime?: unknown };
  if (s.hasTime === false || typeof s.at !== 'string') return false;
  const at = Date.parse(s.at);
  if (!Number.isFinite(at)) return false;
  return windowOpen(at, cardEndMs(at, { durationMinutes }), now);
}

/** What a meeting card offers beyond its moves: Join when held here, Open when held elsewhere. */
export type MeetingAction = 'join' | 'open' | null;

/**
 * For an accepted meeting card: Join while it can be joined (held on Caime), Open for one held
 * on another service, nothing for one in person or not accepted. Whether this device can make
 * the call is the app's to say.
 */
export function meetingAction(
  card: {
    kit?: unknown;
    state?: unknown;
    fields?: Record<string, unknown> | null;
    movedTo?: unknown;
    invitation?: unknown;
  },
  now: Date,
): MeetingAction {
  if (card.kit !== 'meeting' || card.state !== 'accepted') return null;
  // Moved to its own space (R84): joined there, from the card's copy.
  if (card.movedTo) return null;
  const f = card.fields ?? {};
  const venue = meetingVenue(f.place, card.invitation);
  if (venue === 'link') return 'open';
  if (venue === 'caime' && joinOpen(f.start, f.durationMinutes, now)) return 'join';
  return null;
}

/**
 * The same for a line of the calendar (`CalendarItemView`): an agreed meeting with a time, held
 * here while it can be joined, or on another service. Its end is the server's (as booked, as its
 * field says, else an hour), so the calendar and the card agree.
 */
export function calendarAction(
  item: {
    kind: string;
    state: string;
    hasTime: boolean;
    at: string;
    endAt: string | null;
    place: string | null;
    invitation?: boolean;
  },
  now: Date,
): MeetingAction {
  if (item.kind !== 'meeting' || item.state !== 'agreed') return null;
  const venue = meetingVenue(item.place, item.invitation);
  if (venue === 'link') return 'open';
  if (venue !== 'caime' || !item.hasTime) return null;
  const at = Date.parse(item.at);
  if (!Number.isFinite(at)) return null;
  const end = item.endAt ? Date.parse(item.endAt) : cardEndMs(at, {});
  return windowOpen(at, Number.isFinite(end) ? end : at, now) ? 'join' : null;
}

/**
 * Where a meeting held on Caime is joined from outside its card (the calendar, the feed in
 * someone's calendar app): its conversation, opened at the card (`seq`), told to join it
 * (`join`, the card's message id). The conversation checks the card before it calls, so the
 * address alone starts nothing.
 */
export function joinPath(conversationId: string, seq: number, messageId: string): string {
  return `/c/${encodeURIComponent(conversationId)}?seq=${seq}&join=${encodeURIComponent(messageId)}`;
}
