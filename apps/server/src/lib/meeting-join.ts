/**
 * The way in for someone without an account to a call held on Caime: their own link,
 * `/j/<token>`. A meeting's guest (R84) has one to the meeting's space; someone reached by mail
 * (M16 F6c: a page's booker, or whoever a meeting or an appointment held on Caime was mailed to)
 * has one to the card in their one-to-one, and joins its call there. Reading it says what it is
 * and who it's with; taking it, once they've said whether they're 18 or over (R85 (3)), signs
 * them in as the provisional person they are (the guard, `guest-routes.ts`), until a day after it
 * ends. Someone the address already belongs to on Caime is told to sign in instead. A guest's
 * link is good until it's replaced by a newer invitation, the guest is removed, or a day after the
 * meeting; a link to a card in a one-to-one while the card is asked or agreed, until a day after
 * it ends.
 */

import { createHmac } from 'node:crypto';
import { uuidv7 } from '@caime/core';
import { tr } from '@caime/core/i18n';
import { HELD_APPOINTMENT_STATES } from '@caime/core/kit-states';
import { cardEndMs } from '@caime/core/meetings';
import type { AppContext } from '../context';
import { hashToken } from './crypto';
import { notFound } from './errors';
import { serverKey } from './server-keys';

/** A guest's session, and their link, last until a day after their meeting ends. */
export const GUEST_GRACE_MS = 24 * 60 * 60_000;

/** The key a link to a card's call in a one-to-one is made from (M16 F6c). */
const CALL_LINK_KEY = 'call.links';

/**
 * The states in which a card's call in a one-to-one is joined by link (M16 F6c): asked or
 * agreed. A meeting's space holds an agreed meeting alone.
 */
const OPEN_STATES: Readonly<Record<string, readonly string[]>> = {
  meeting: ['proposed', 'accepted'],
  appointment: HELD_APPOINTMENT_STATES,
};

interface CardPayload {
  kit?: string;
  state?: string;
  title?: string;
  fields?: {
    title?: unknown;
    start?: { at?: string };
    durationMinutes?: unknown;
    notes?: unknown;
  };
  booking?: { name?: string; endAt?: string | null } | null;
}

/** When a card is, and until when its link holds: its end by core's one rule (M16 D3), a day on. */
function linkTime(p: CardPayload): { at: Date; end: number; endsAt: Date } | null {
  const at = new Date(String(p.fields?.start?.at));
  if (Number.isNaN(at.getTime())) return null;
  // A booked stay's nights, not an hour from its start.
  const end = cardEndMs(at.getTime(), {
    durationMinutes: p.fields?.durationMinutes,
    booking: p.booking,
  });
  return { at, end, endsAt: new Date(end + GUEST_GRACE_MS) };
}

/** A card in a one-to-one whose call is joined by link now: asked or agreed, not a day past it. */
function openInDirect(p: CardPayload, now: Date): boolean {
  if (!OPEN_STATES[p.kit ?? '']?.includes(p.state ?? '')) return false;
  const time = linkTime(p);
  return Boolean(time && now <= time.endsAt);
}

export interface GuestLink {
  guestRowId: string;
  userId: string;
  userKind: string;
  guestName: string;
  host: string | null;
  conversationId: string;
  messageId: string;
  seq: number;
  title: string;
  at: Date;
  durationMinutes: number;
  /** The card says Cai takes notes in its call (M16 F7c). */
  notes: boolean;
  endsAt: Date;
  /** Its call is the one-to-one's (M16 F6c), not a meeting space's group call. */
  direct: boolean;
  /** An appointment, a booking among them, rather than a meeting. */
  booking: boolean;
  /** What they said of their age before: on this link, or on the page they booked from. */
  adult: boolean | null;
}

/** The link's card and guest, or 404 for a link that isn't one, or is no longer. */
export async function guestLink(ctx: AppContext, token: string): Promise<GuestLink> {
  const gone = () => notFound(tr('That invitation'));
  if (!/^cmg_[A-Za-z0-9_-]{16,}$/.test(token)) throw gone();
  const row = await ctx.db
    .selectFrom('meeting_guests as g')
    .innerJoin('messages as m', 'm.id', 'g.space_message_id')
    .innerJoin('conversations as c', 'c.id', 'm.conversation_id')
    .leftJoin('meeting_spaces as ms', 'ms.space_message_id', 'g.space_message_id')
    .innerJoin('users as u', 'u.id', 'g.user_id')
    .innerJoin('participants as p', (j) =>
      j.onRef('p.conversation_id', '=', 'm.conversation_id').onRef('p.user_id', '=', 'g.user_id'),
    )
    .leftJoin('users as h', 'h.id', 'g.invited_by')
    .select([
      'g.id',
      'g.user_id',
      'g.adult',
      'u.kind',
      'u.display_name',
      'u.deleted_at',
      'h.display_name as host',
      'm.conversation_id',
      'c.kind as conversation_kind',
      'ms.message_id as space_of',
      'm.id as message_id',
      'm.seq',
      'm.payload',
      'm.deleted_at as card_deleted',
      'p.left_at',
    ])
    .where('g.token_hash', '=', hashToken(token))
    .where('g.revoked_at', 'is', null)
    .executeTakeFirst();
  if (!row || row.deleted_at || row.card_deleted || row.left_at) throw gone();
  const p = (row.payload ?? {}) as CardPayload;
  // A meeting's space (R84), its meeting agreed; or a one-to-one (M16 F6c), its card asked or
  // agreed. Nothing else is joined by link.
  const direct = row.conversation_kind === 'direct';
  if (direct ? !OPEN_STATES[p.kit ?? '']?.includes(p.state ?? '') : !row.space_of) throw gone();
  if (!direct && p.state !== 'accepted') throw gone();
  const time = linkTime(p);
  if (!time || ctx.now() > time.endsAt) throw gone();
  const booking = p.kit === 'appointment';
  return {
    guestRowId: row.id,
    userId: row.user_id,
    userKind: row.kind,
    guestName: row.display_name,
    host: row.host ?? null,
    conversationId: row.conversation_id,
    messageId: row.message_id,
    seq: Number(row.seq),
    title: String(
      (booking && p.booking?.name) ||
        p.title ||
        p.fields?.title ||
        (booking ? tr('Appointment') : tr('Meeting')),
    ),
    at: time.at,
    durationMinutes: Math.round((time.end - time.at.getTime()) / 60_000),
    notes: p.fields?.notes === 'cai',
    endsAt: time.endsAt,
    direct,
    booking,
    adult: row.adult ?? null,
  };
}

/**
 * Someone reached by mail's own link to a card's call in their one-to-one (M16 F6c): made from
 * the server's key, the card and the person, so every mail about the card carries the same link
 * and nothing keeps it but its hash; its row is made once, naming whom the card is with. A page's
 * booker said they're 18 or over as they booked (`adult`).
 */
export async function callLinkFor(
  ctx: AppContext,
  card: { id: string },
  userId: string,
  withId: string | null,
  adult: boolean | null = null,
): Promise<string> {
  const key = await serverKey(ctx, CALL_LINK_KEY);
  const token = `cmg_${createHmac('sha256', key).update(`${card.id}:${userId}`).digest('base64url')}`;
  await ctx.db
    .insertInto('meeting_guests')
    .values({
      id: uuidv7(),
      space_message_id: card.id,
      user_id: userId,
      invited_by: withId,
      token_hash: hashToken(token),
      adult,
    })
    .onConflict((oc) => oc.columns(['space_message_id', 'user_id']).doNothing())
    .execute();
  return `${ctx.config.PUBLIC_URL}/j/${token}`;
}

/**
 * Someone reached by mail's link to a card's call in this one-to-one, while the card is open (M16
 * F6c): `taken` once they've come in by it, which lets them call there or be rung; `mailed` while
 * it waits for them; null where they have none.
 */
export async function callLinkIn(
  ctx: AppContext,
  conversationId: string,
  userId: string,
): Promise<'taken' | 'mailed' | null> {
  const rows = await ctx.db
    .selectFrom('meeting_guests as g')
    .innerJoin('messages as m', 'm.id', 'g.space_message_id')
    .select(['g.joined_at', 'm.payload', 'm.deleted_at'])
    .where('g.user_id', '=', userId)
    .where('m.conversation_id', '=', conversationId)
    .where('g.revoked_at', 'is', null)
    .execute();
  const open = rows.filter(
    (r) => !r.deleted_at && openInDirect(r.payload as CardPayload, ctx.now()),
  );
  return open.some((r) => r.joined_at) ? 'taken' : open.length ? 'mailed' : null;
}

/** Whether someone has a session that's still good: a guest's page that could ring. */
export async function sessionLive(ctx: AppContext, userId: string): Promise<boolean> {
  const session = await ctx.db
    .selectFrom('sessions')
    .select('id')
    .where('user_id', '=', userId)
    .where('revoked_at', 'is', null)
    .where('expires_at', '>', ctx.now())
    .executeTakeFirst();
  return Boolean(session);
}
