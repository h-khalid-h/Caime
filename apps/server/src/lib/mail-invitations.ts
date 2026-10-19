/**
 * Invitations from someone's calendar (M16 F4, review 2026-10-17 §6: "calendar invitations
 * arrive as a bare file"): a meeting someone's Google, Outlook or Apple calendar mails to a
 * person's Caime address arrives as a meeting card from its organizer, which the person agrees
 * to or turns down as any card. Their answer goes back to the organizer's calendar as their own
 * calendar app would send it (`METHOD:REPLY`, `queueInvitationAnswer` in `mail-out.ts`), and the
 * organizer's later word moves the same card: a new time asks again, a cancellation cancels it.
 *
 * Only what reads as theirs alone becomes a card: from a sender confirmed (`mail-in.ts` has
 * checked) who is its organizer, inviting this very address, to one time (never a series), with
 * a time, not over, a day long at most, in a zone Caime can name, never as a notice. Anything
 * else arrives as the mail it is, its calendar a file, as before.
 */
import { createHash } from 'node:crypto';
import { KITS, kitHeadline, truncate } from '@caime/core';
import { msg } from '@caime/core/i18n';
import {
  type IcsInvitation,
  type IcsPerson,
  invitationWords,
  readInvitation,
} from '@caime/core/ics';
import { sql } from 'kysely';
import type { AppContext } from '../context';
import { MESSAGE_COLUMNS, type Message, type UserRow } from '../db/schema';
import { queueCalendarPush } from './calendar-push';
import { afterCardMove } from './card-moves';
import { mayMove, moveCard } from './kit-moves';
import { cardStartAt } from './kits';
import { calendarOf } from './mail-calendar';
import type { InboundOutcome } from './mail-in';
import type { InboundMail } from './mail-provider';
import { messageViews, participantsOf } from './messages';

/** What a card made of an invitation keeps of it: enough to answer it and to know its updates. */
export interface CardInvitation {
  uid: string;
  /** The organizer's latest change Caime has read. */
  sequence: number;
  organizer: IcsPerson;
  /** The address it invited, lowercased: the answer is that address's. */
  attendee: string;
}

type InvitedCard = {
  kit?: string;
  state?: string;
  title?: string;
  fields?: Record<string, unknown>;
  history?: Array<{ state: string; by: string; at: string }>;
  invitation?: CardInvitation;
};

/** A day: anything longer is no meeting a card holds (`cardEndMs` reads a day at most). */
const DAY_MINUTES = 24 * 60;

/**
 * The invitation a mail carries for this address, read on its person's clock (a floating time
 * is theirs): from its organizer, inviting this address. Null when it carries none of those.
 */
export function invitationIn(
  mail: InboundMail,
  toAddress: string,
  zone: string,
): IcsInvitation | null {
  const text = calendarOf(mail);
  const inv = text ? readInvitation(text, zone) : null;
  if (!inv?.organizer || inv.organizer.email !== mail.from.address.toLowerCase()) return null;
  if (inv.method === 'REQUEST' && !inv.attendees.includes(toAddress.toLowerCase())) return null;
  return inv;
}

/** A card's client id (ADR-8): one per event and address invited, so its later word finds it. */
export function invitationClientId(uid: string, toAddress: string): string {
  const key = `${uid}\n${toAddress.toLowerCase()}`;
  return `invite:${createHash('sha256').update(key).digest('base64url')}`;
}

/** The card's fields: its title, its time, how long, and where, as the organizer has them. */
function fieldsOf(inv: IcsInvitation): Record<string, unknown> {
  const minutes = Math.round((inv.end.getTime() - inv.start.getTime()) / 60_000);
  return {
    ...(inv.summary ? { title: truncate(inv.summary, 200) } : {}),
    start: { at: inv.start.toISOString(), hasTime: true },
    ...(minutes > 0 ? { durationMinutes: minutes } : {}),
    ...(inv.place ? { place: inv.place } : {}),
  };
}

/** A new invitation as Caime posts it: the card, and what its organizer wrote of it. */
export interface InvitationCard {
  clientId: string;
  payload: Record<string, unknown>;
  words: string | null;
}

/** The card a new invitation makes, or null when it can't be one (then it arrives as mail). */
export function invitationCard(
  inv: IcsInvitation,
  toAddress: string,
  now: Date,
): InvitationCard | null {
  if (inv.method !== 'REQUEST' || !inv.hasTime || !inv.organizer) return null;
  const minutes = (inv.end.getTime() - inv.start.getTime()) / 60_000;
  if (minutes > DAY_MINUTES || inv.end.getTime() < now.getTime()) return null;
  const fields = fieldsOf(inv);
  const invitation: CardInvitation = {
    uid: inv.uid,
    sequence: inv.sequence,
    organizer: inv.organizer,
    attendee: toAddress.toLowerCase(),
  };
  return {
    clientId: invitationClientId(inv.uid, toAddress),
    payload: {
      kit: 'meeting',
      label: KITS.meeting.name,
      title: kitHeadline('meeting', fields),
      fields,
      state: 'proposed',
      history: [],
      invitation,
    },
    words: invitationWords(inv.description),
  };
}

/**
 * Its organizer's later word on a card made of their invitation, for the person it invited: a
 * new time or place moves the card (a new time asks again, since what was agreed was another),
 * a cancellation cancels it, and the same word again, or an older one, changes nothing. Null when
 * there's no such card here, so a new invitation makes one and anything else arrives as mail.
 */
export async function changedInvitation(
  ctx: AppContext,
  inv: IcsInvitation,
  sender: UserRow,
  person: UserRow,
  toAddress: string,
): Promise<InboundOutcome | null> {
  const card = await ctx.db
    .selectFrom('messages')
    .select(MESSAGE_COLUMNS)
    .where('sender_id', '=', sender.id)
    .where('client_id', '=', invitationClientId(inv.uid, toAddress))
    .executeTakeFirst();
  const p = (card?.payload ?? {}) as InvitedCard;
  if (!card || card.deleted_at || card.kind !== 'kit' || p.invitation?.uid !== inv.uid) return null;
  const inIt = await ctx.db
    .selectFrom('participants')
    .select('user_id')
    .where('conversation_id', '=', card.conversation_id)
    .where('user_id', '=', person.id)
    .where('left_at', 'is', null)
    .executeTakeFirst();
  if (!inIt) return null;
  if (inv.sequence < p.invitation.sequence) return 'duplicate';
  if (inv.method === 'CANCEL') {
    if (p.state === 'cancelled' || p.state === 'declined') return 'duplicate';
    if (!mayMove(card, 'cancelled', sender.id, null)) return 'duplicate';
    const moved = await moveCard(ctx, card, {
      to: 'cancelled',
      actorId: sender.id,
      business: null,
    });
    return moved === 'conflict' ? 'duplicate' : 'invited';
  }
  return retimed(ctx, card, inv, sender.id);
}

/** The organizer's new word on their meeting: its fields as they now are, asked again if the time moved. */
async function retimed(
  ctx: AppContext,
  card: Message,
  inv: IcsInvitation,
  organizerId: string,
): Promise<InboundOutcome> {
  const p = (card.payload ?? {}) as InvitedCard;
  const fields = fieldsOf(inv);
  const was = p.fields ?? {};
  const moved =
    (was.start as { at?: unknown } | undefined)?.at !== (fields.start as { at: string }).at ||
    Number(was.durationMinutes ?? 0) !== Number(fields.durationMinutes ?? 0);
  const changed = moved || was.place !== fields.place || was.title !== fields.title;
  if (!changed && inv.sequence === p.invitation?.sequence) return 'duplicate';
  // A new time asks again; a card its organizer called off stands again on their word that it
  // stands; one its person turned down or called off is asked again only for another time. A
  // time already over asks nobody.
  const calledOffByThem = p.state === 'cancelled' && p.history?.at(-1)?.by === organizerId;
  const ahead = inv.end.getTime() >= ctx.now().getTime();
  const to =
    ahead && p.state !== 'proposed' && (moved || calledOffByThem) ? 'proposed' : (p.state ?? '');
  const from = p.state ?? '';
  const updated = await ctx.db.transaction().execute(async (trx) => {
    const row = await trx
      .selectFrom('messages')
      .select(['deleted_at', 'payload'])
      .where('id', '=', card.id)
      .forUpdate()
      .executeTakeFirst();
    const now = (row?.payload ?? {}) as InvitedCard;
    // Moved by someone in the meantime, or a later word read first: this one is past.
    if (!row || row.deleted_at || now.state !== from) return null;
    if ((now.invitation?.sequence ?? 0) > inv.sequence || !now.invitation) return null;
    const history =
      to === from
        ? (now.history ?? [])
        : [...(now.history ?? []), { state: to, by: organizerId, at: ctx.now().toISOString() }];
    const next = {
      fields,
      title: kitHeadline('meeting', fields),
      state: to,
      history: history.slice(-50),
      invitation: { ...now.invitation, sequence: inv.sequence },
    };
    return trx
      .updateTable('messages')
      .set({
        payload: sql`payload || ${JSON.stringify(next)}::jsonb`,
        card_start_at: cardStartAt({ kit: 'meeting', fields }),
      })
      .where('id', '=', card.id)
      .returning(MESSAGE_COLUMNS)
      .executeTakeFirstOrThrow();
  });
  if (!updated) return 'duplicate';
  // A new time is said as a move is: everyone shown it, the person told, their calendars after it.
  if (moved || to !== from) {
    await afterCardMove(ctx, updated, {
      from,
      to,
      actorId: organizerId,
      business: null,
      label: moved ? msg('New time') : undefined,
    });
    return 'invited';
  }
  // Anything else (its name, its place) is shown where the card is, quietly.
  const members = (await participantsOf(ctx.db, card.conversation_id)).map((m) => m.user_id);
  const [view] = await messageViews(ctx.db, [updated], organizerId);
  if (view)
    await ctx.bus.publish(members, { type: 'message.updated', data: { ...view, clientId: null } });
  await queueCalendarPush(ctx, members);
  return 'invited';
}
