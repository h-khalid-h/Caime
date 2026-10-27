/**
 * A meeting's guest writes in its conversation while its call is on (R121 phase 2, M17 I13j): only a
 * guest who said they're 18 or over (`meeting_guests.adult`, R85 (3)), only words, and only while
 * the group call there is on and they're in it; read-only again after. Their lines carry the
 * server's own mark (`payload.guest`, `SendOptions.guest`), so everyone reads them as a guest's and
 * may report them as any line. The send route asks this before it sends, for a guest's session
 * alone; nothing else a guest does writes in the space (lib/guest-routes.ts).
 */
import type { SendMessageBodyT } from '@caime/core';
import { tr } from '@caime/core/i18n';
import type { AppContext } from '../context';
import { forbidden } from './errors';

/** Guests' lines in a minute, one guest: a conversation beside a call, never a flood. */
export const GUEST_LINES_PER_MINUTE = 20;

export async function assertGuestMayWrite(
  ctx: AppContext,
  userId: string,
  conversationId: string,
  body: SendMessageBodyT,
): Promise<void> {
  // A send tried again (ADR-8) answers with what was sent, even once the call is over.
  const sent = await ctx.db
    .selectFrom('messages')
    .select('id')
    .where('sender_id', '=', userId)
    .where('client_id', '=', body.clientId)
    .executeTakeFirst();
  if (sent) return;
  if (
    body.kind !== 'text' ||
    body.fileIds?.length ||
    body.payload !== undefined ||
    body.sealed ||
    body.privateReplyTo ||
    body.mentions?.length ||
    body.urgent
  )
    throw forbidden(tr('A guest writes words here, nothing else.'));
  const guest = await ctx.db
    .selectFrom('meeting_guests as g')
    .innerJoin('messages as m', 'm.id', 'g.space_message_id')
    .select('g.adult')
    .where('g.user_id', '=', userId)
    .where('m.conversation_id', '=', conversationId)
    .where('g.revoked_at', 'is', null)
    .orderBy('g.created_at', 'desc')
    .executeTakeFirst();
  // Under 18, or not said: they read what's written, and write nothing (R85 (3), R29).
  if (guest?.adult !== true)
    throw forbidden(tr('Writing here is for guests who said they’re 18 or over.'));
  const inCall = await ctx.db
    .selectFrom('calls as c')
    .innerJoin('call_members as cm', 'cm.call_id', 'c.id')
    .select('c.id')
    .where('c.conversation_id', '=', conversationId)
    .where('c.is_group', '=', true)
    .where('c.ended_at', 'is', null)
    .where('cm.user_id', '=', userId)
    .where('cm.state', '=', 'joined')
    .executeTakeFirst();
  if (!inCall) throw forbidden(tr('A guest writes here while the call is on and they’re in it.'));
  ctx.limiter.hit(`guest-write:${userId}`, GUEST_LINES_PER_MINUTE, 60_000);
}
