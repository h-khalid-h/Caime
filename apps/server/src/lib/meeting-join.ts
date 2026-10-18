/**
 * The way in for a meeting's guest (R84): their own link, `/j/<token>`. Reading it says what
 * the meeting is and who asked; taking it, once the guest has said whether they're 18 or over
 * (R85 (3)), signs them in as the provisional person they are, for that meeting only (the
 * guard, `guest-routes.ts`), until a day after it ends. Someone the address already belongs to
 * on Caime is told to sign in instead: their invitation waits there as a request. A link is good
 * until it's replaced by a newer invitation, the guest is removed, or a day after the meeting.
 */

import { tr } from '@caime/core/i18n';
import { cardEndMs } from '@caime/core/meetings';
import type { AppContext } from '../context';
import { hashToken } from './crypto';
import { notFound } from './errors';

/** A guest's session, and their link, last until a day after their meeting ends. */
export const GUEST_GRACE_MS = 24 * 60 * 60_000;

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
  endsAt: Date;
}

/** The link's meeting and guest, or 404 for a link that isn't one, or is no longer. */
export async function guestLink(ctx: AppContext, token: string): Promise<GuestLink> {
  const gone = () => notFound(tr('That invitation'));
  if (!/^cmg_[A-Za-z0-9_-]{16,}$/.test(token)) throw gone();
  const row = await ctx.db
    .selectFrom('meeting_guests as g')
    .innerJoin('meeting_spaces as ms', 'ms.space_message_id', 'g.space_message_id')
    .innerJoin('messages as m', 'm.id', 'g.space_message_id')
    .innerJoin('users as u', 'u.id', 'g.user_id')
    .innerJoin('participants as p', (j) =>
      j.onRef('p.conversation_id', '=', 'ms.conversation_id').onRef('p.user_id', '=', 'g.user_id'),
    )
    .leftJoin('users as h', 'h.id', 'g.invited_by')
    .select([
      'g.id',
      'g.user_id',
      'u.kind',
      'u.display_name',
      'u.deleted_at',
      'h.display_name as host',
      'ms.conversation_id',
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
  const p = (row.payload ?? {}) as {
    state?: string;
    title?: string;
    fields?: { title?: unknown; start?: { at?: string }; durationMinutes?: unknown };
    booking?: { endAt?: string | null } | null;
  };
  if (p.state !== 'accepted') throw gone();
  const at = new Date(String(p.fields?.start?.at));
  if (Number.isNaN(at.getTime())) throw gone();
  // Its end by core's one rule (M16 D3): a booked stay's nights, not an hour from its start.
  const end = cardEndMs(at.getTime(), {
    durationMinutes: p.fields?.durationMinutes,
    booking: p.booking,
  });
  const durationMinutes = Math.round((end - at.getTime()) / 60_000);
  const endsAt = new Date(end + GUEST_GRACE_MS);
  if (ctx.now() > endsAt) throw gone();
  return {
    guestRowId: row.id,
    userId: row.user_id,
    userKind: row.kind,
    guestName: row.display_name,
    host: row.host ?? null,
    conversationId: row.conversation_id,
    messageId: row.message_id,
    seq: Number(row.seq),
    title: String(p.title || p.fields?.title || tr('Meeting')),
    at,
    durationMinutes,
    endsAt,
  };
}
