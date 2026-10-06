/**
 * Posting as an account nobody types for: an organization's AI agent (PRD §74), Cai or a Caime
 * Friend (R67). The message goes through `sendMessage` like anyone's, is sent live to everyone
 * else in the conversation, and its effects run after the response, as a sent message's do.
 */
import { SendMessageBody, uuidv4 } from '@caime/core';
import type { AppContext } from '../context';
import { afterMessage } from './message-effects';
import { messageViews, participantsOf, sendMessage } from './messages';

export async function postAs(
  ctx: AppContext,
  senderId: string,
  conversationId: string,
  what: string | { kind: 'kit' | 'sticker'; payload: unknown },
): Promise<void> {
  const result = await sendMessage(
    ctx,
    senderId,
    conversationId,
    SendMessageBody.parse({
      clientId: `agent:${uuidv4()}`,
      ...(typeof what === 'string' ? { body: what } : what),
    }),
  );
  if (!result.created) return;
  const [view] = await messageViews(ctx.db, [result.message], senderId);
  await ctx.bus.publish(
    (await participantsOf(ctx.db, conversationId))
      .map((p) => p.user_id)
      .filter((u) => u !== senderId),
    { type: 'message.created', data: { ...view, clientId: null } },
  );
  const { message, analysis } = result;
  ctx.defer('after-message', () => afterMessage(ctx, message, analysis));
}
