/**
 * One conversation as a text file for someone in it (M16 E7): what they may read of it
 * (`readableBy`, no system line), in order, each message's words as a model reads them
 * (`wordsFor`: a text whole, else what the message is), on their own clock, written in WhatsApp's
 * line by core `chatExportText`, so any WhatsApp importer, Caime's own included, reads it back.
 * A customer reads the organization where its team wrote (R15). A private conversation's words
 * never reach the server: its export is refused, never an empty file.
 */
import { chatExportText } from '@caime/core/chat-export';
import { tr } from '@caime/core/i18n';
import { zonedParts } from '@caime/core/time';
import type { AppContext } from '../context';
import { masksFor } from './business';
import { membership } from './conversation-views';
import { badRequest } from './errors';
import { readableBy } from './messages';
import { wordsFor } from './transcript';

/** As many messages as WhatsApp's own export without media keeps. */
export const EXPORT_MAX = 40_000;
/** A message's words as far as an export carries them. */
const WORDS_MAX = 20_000;

export async function chatExport(
  ctx: AppContext,
  userId: string,
  conversationId: string,
): Promise<{ text: string; count: number }> {
  const { conversation } = await membership(ctx, userId, conversationId);
  if (conversation.privacy_class === 'private')
    throw badRequest(tr('A private conversation’s words stay on your devices.'));
  const me = await ctx.db
    .selectFrom('users')
    .select('time_zone')
    .where('id', '=', userId)
    .executeTakeFirstOrThrow();
  const zone = me.time_zone || 'UTC';
  const rows = await ctx.db
    .selectFrom('messages as m')
    .leftJoin('users as u', 'u.id', 'm.sender_id')
    .select([
      'm.kind',
      'm.body',
      'm.payload',
      'm.deleted_at',
      'm.sender_id',
      'm.created_at',
      'u.display_name',
    ])
    .where('m.conversation_id', '=', conversationId)
    .where('m.kind', '<>', 'system')
    .where(readableBy(userId, ctx.now(), 'm'))
    .orderBy('m.seq', 'desc')
    .limit(EXPORT_MAX)
    .execute();
  rows.reverse();
  const mask = (await masksFor(ctx, userId, [conversationId])).get(conversationId);
  const text = chatExportText(
    rows.map((r) => ({
      at: zonedParts(r.created_at, zone),
      author:
        mask && r.sender_id !== userId && r.sender_id !== mask.customerId
          ? mask.orgName
          : (r.display_name ?? ''),
      text: wordsFor(r, WORDS_MAX),
    })),
  );
  return { text, count: rows.length };
}
