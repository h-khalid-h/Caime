/**
 * A calendar's answer to a card mailed from Caime (M16 F3): someone reached by email accepted or
 * declined a meeting or an appointment from their calendar (`METHOD:REPLY`), which sends the
 * answer to the address the invitation came from, a person's or an organization's. From the
 * address invited, its sender confirmed (`mail-in.ts` has checked), for a card of theirs that
 * went to that very address, it moves the card as a tap would (`moveCard`): an acceptance agrees
 * it (and answers their request, as a reply does), a refusal declines or cancels it. Nothing
 * more is posted: the card says it, and its sender is told as of any move. A "maybe" moves
 * nothing and arrives as their mail.
 */
import { readReply } from '@caime/core/ics';
import { AGREED_STATES } from '@caime/core/kit-states';
import type { AppContext } from '../context';
import { MESSAGE_COLUMNS, type UserRow } from '../db/schema';
import { assertCanWrite } from './blocks';
import { customerMask } from './business';
import { mayMove, moveCard } from './kit-moves';
import { calendarOf } from './mail-calendar';
import type { InboundOutcome } from './mail-in';
import type { InboundMail } from './mail-provider';

/** A card's event, as Caime names it (`meetingUid`): a card that repeats never goes by mail. */
const CARD_UID = /^(meeting|appointment)-([0-9a-f-]{36})@caime$/;

/** The answer applied, or null when the mail carries no answer to a card of Caime's. */
export async function answerFromCalendar(
  ctx: AppContext,
  mail: InboundMail,
  sender: UserRow,
): Promise<InboundOutcome | null> {
  const text = calendarOf(mail);
  const reply = text ? readReply(text) : null;
  const id = reply ? CARD_UID.exec(reply.uid)?.[2] : undefined;
  if (!reply || !id) return null;
  // Only the invited address answers for itself: someone reached by email, or the account they
  // have made with that address since (the same row, so still in the conversation).
  if (reply.attendee !== mail.from.address.toLowerCase()) return 'refused';
  const went = await ctx.db
    .selectFrom('mail_messages')
    .select('message_id')
    .where('message_id', '=', id)
    .where('direction', '=', 'out')
    .where('to_address', '=', reply.attendee)
    .executeTakeFirst();
  if (!went) return 'refused';
  const m = await ctx.db
    .selectFrom('messages')
    .select(MESSAGE_COLUMNS)
    .where('id', '=', id)
    .executeTakeFirst();
  const card = (m?.payload ?? {}) as { kit?: unknown; state?: string; sequence?: number };
  if (!m || m.deleted_at || m.kind !== 'kit') return 'refused';
  if (card.kit !== 'meeting' && card.kit !== 'appointment') return 'refused';
  // An answer to a time the card no longer has (M16 F5): its update has gone to them since.
  if (reply.sequence < (card.sequence ?? 0)) return 'duplicate';
  const kit = card.kit;
  const inIt = await ctx.db
    .selectFrom('participants')
    .select('user_id')
    .where('conversation_id', '=', m.conversation_id)
    .where('user_id', '=', sender.id)
    .where('left_at', 'is', null)
    .executeTakeFirst();
  if (!inIt) return 'refused';
  try {
    await assertCanWrite(ctx, m.conversation_id, sender.id);
  } catch {
    return 'refused';
  }
  const agreed = AGREED_STATES[kit];
  // Declining what was agreed is calling it off; an appointment is only ever cancelled.
  const to =
    reply.answer === 'accepted'
      ? agreed
      : reply.answer === 'declined'
        ? kit === 'meeting' && card.state === 'proposed'
          ? 'declined'
          : 'cancelled'
        : null;
  if (!to) return null;
  // The same answer again (their calendar's update, a second tap) changes nothing.
  if (card.state === to || (to === 'cancelled' && card.state === 'declined')) return 'duplicate';
  const business = await customerMask(ctx.db, m.conversation_id);
  if (!mayMove(m, to, sender.id, business)) return 'refused';
  // Answering the invitation is having seen it: said on the card its sender is shown next.
  await ctx.db
    .updateTable('mail_messages')
    .set({ seen_at: ctx.now() })
    .where('message_id', '=', m.id)
    .where('direction', '=', 'out')
    .where('seen_at', 'is', null)
    .execute();
  const moved = await moveCard(ctx, m, { to, actorId: sender.id, business });
  return moved === 'conflict' ? 'refused' : 'answered';
}
