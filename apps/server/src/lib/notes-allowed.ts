/**
 * Whether Cai may take notes where someone asks for them (M16 F7, F7c; R85, R52): on a Caime
 * whose speech provider is set up, outside a private conversation, asked by an adult on Caime
 * with AI assist on, with nobody under 18 among the people it would hear. Asked in a call
 * (`mayAsk`, `lib/call-notes.ts`) and ahead, by a meeting's card that says so (`sendMessage`).
 * Who is under 18 is never said (R29): the same words whoever it is.
 */
import { tr } from '@caime/core';
import type { AppContext } from '../context';
import { AppError, forbidden } from './errors';
import { anyMinor, minorOf } from './users';

export async function assertNotesAllowed(
  ctx: AppContext,
  input: {
    conversationId: string;
    askerId: string;
    /** Everyone it would hear: the call's people, or the conversation's. */
    people: string[];
    where: 'call' | 'conversation';
  },
): Promise<void> {
  if (!ctx.speech)
    throw new AppError(503, 'ai_unavailable', tr('Cai can’t take notes on this Caime yet.'));
  const [conversation, me] = await Promise.all([
    ctx.db
      .selectFrom('conversations')
      .select('privacy_class')
      .where('id', '=', input.conversationId)
      .executeTakeFirstOrThrow(),
    ctx.db
      .selectFrom('users')
      .select(['kind', 'ai_enabled', 'birth_date', 'time_zone', 'age_minor_until'])
      .where('id', '=', input.askerId)
      .executeTakeFirstOrThrow(),
  ]);
  if (conversation.privacy_class === 'private')
    throw new AppError(
      403,
      'ai_private',
      tr('Cai doesn’t take notes in a private conversation: nothing said there reaches Caime.'),
    );
  if (me.kind !== 'human') throw forbidden(tr('Only someone on Caime can ask Cai to take notes.'));
  if (minorOf(me, ctx.now()))
    throw new AppError(403, 'ai_adults_only', tr('AI assist is for adults for now.'));
  if (!me.ai_enabled)
    throw new AppError(403, 'ai_off', tr('Turn on AI assist in Settings to use it.'));
  if (await anyMinor(ctx.db, input.people, ctx.now()))
    throw forbidden(
      input.where === 'call'
        ? tr('Cai can’t take notes in this call.')
        : tr('Cai can’t take notes in this conversation.'),
    );
}
