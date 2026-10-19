/**
 * Cai's own address, `assistant@<MAIL_DOMAIN>` (R86). It sends a meeting's invitations for
 * whoever invites (`meeting-guests.ts`), and reads one thing that comes back: a guest's answer
 * from their calendar app (`METHOD:REPLY`), from the very address that was invited, its sender
 * vouched for by its own server (checked before anything reaches here, `mail-in.ts`). That
 * answer is kept on the invitation, and whoever invited is told. Nothing else sent to Cai's
 * address is read, by a model or anyone: it's counted and dropped, so mail can never give Cai
 * instructions.
 */

import { tr } from '@caime/core/i18n';
import { readReply } from '@caime/core/ics';
import type { AppContext } from '../context';
import { calendarOf } from './mail-calendar';
import type { InboundOutcome } from './mail-in';
import type { InboundMail } from './mail-provider';
import { notify } from './notify';

const UID = /^meeting-([0-9a-f-]{36})@caime$/;

export async function caiMail(ctx: AppContext, mail: InboundMail): Promise<InboundOutcome> {
  const text = calendarOf(mail);
  const reply = text ? readReply(text) : null;
  const spaceMessageId = reply ? UID.exec(reply.uid)?.[1] : undefined;
  // Only the invited address answers for itself.
  if (!reply || !spaceMessageId || reply.attendee !== mail.from.address.toLowerCase())
    return 'refused';
  const guest = await ctx.db
    .selectFrom('meeting_guests as g')
    .innerJoin('users as u', 'u.id', 'g.user_id')
    .innerJoin('meeting_spaces as ms', 'ms.space_message_id', 'g.space_message_id')
    .innerJoin('messages as m', 'm.id', 'g.space_message_id')
    .select([
      'g.id',
      'g.answer',
      'g.invited_by',
      'u.display_name',
      'ms.conversation_id',
      'm.payload',
    ])
    .where('g.space_message_id', '=', spaceMessageId)
    .where('u.email', '=', reply.attendee)
    .where('g.revoked_at', 'is', null)
    .executeTakeFirst();
  if (!guest) return 'refused';
  // The same answer again (a provider's retry, a second tap) changes nothing and says nothing.
  if (guest.answer === reply.answer) return 'duplicate';
  await ctx.db
    .updateTable('meeting_guests')
    .set({ answer: reply.answer, answered_at: ctx.now() })
    .where('id', '=', guest.id)
    .execute();
  if (guest.invited_by) {
    const p = (guest.payload ?? {}) as { title?: string; fields?: { title?: unknown } };
    const title = String(p.title || p.fields?.title || tr('Meeting'));
    const name = guest.display_name;
    await notify(ctx, {
      userId: guest.invited_by,
      kind: 'meeting_answer',
      level: 'activity',
      title: () =>
        reply.answer === 'accepted'
          ? tr('{name} is coming: {title}', { name, title })
          : reply.answer === 'declined'
            ? tr('{name} can’t come: {title}', { name, title })
            : tr('{name} might come: {title}', { name, title }),
      groupKey: `meeting-answer:${guest.id}`,
      data: { conversationId: guest.conversation_id, messageId: spaceMessageId },
      quotes: [spaceMessageId],
    });
  }
  return 'delivered';
}
