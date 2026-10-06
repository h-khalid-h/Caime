/**
 * Posting without someone typing it: as an organization's AI agent (PRD §74), Cai or a Caime
 * Friend (R67), or a person's follow-up sent from Cai's offer on their tap (R68). The message
 * goes through `sendMessage` like anyone's, is sent live to everyone else in the conversation
 * (and, with `echo`, to the sender's own devices with its client id, as a send is), and its
 * effects run after the response, as a sent message's do.
 */
import { SendMessageBody, uuidv4 } from '@caime/core';
import type { AppContext } from '../context';
import type { Message } from '../db/schema';
import { afterMessage } from './message-effects';
import { messageViews, participantsOf, sendMessage } from './messages';

export async function postAs(
  ctx: AppContext,
  senderId: string,
  conversationId: string,
  what: string | { kind: 'text' | 'kit' | 'sticker'; body?: string; payload?: unknown },
  opts: { clientId?: string; echo?: boolean } = {},
): Promise<{ message: Message; created: boolean }> {
  const clientId = opts.clientId ?? `agent:${uuidv4()}`;
  const result = await sendMessage(
    ctx,
    senderId,
    conversationId,
    SendMessageBody.parse({
      clientId,
      ...(typeof what === 'string' ? { body: what } : what),
    }),
  );
  if (!result.created) return { message: result.message, created: false };
  const [view] = await messageViews(ctx.db, [result.message], senderId);
  await ctx.bus.publish(
    (await participantsOf(ctx.db, conversationId))
      .map((p) => p.user_id)
      .filter((u) => u !== senderId),
    { type: 'message.created', data: { ...view, clientId: null } },
  );
  if (opts.echo) await ctx.bus.publish([senderId], { type: 'message.created', data: view });
  const { message, analysis } = result;
  ctx.defer('after-message', () => afterMessage(ctx, message, analysis));
  return { message, created: true };
}
