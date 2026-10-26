/**
 * Messages written now and sent later (M16 E8b): the sender's words kept in
 * `scheduled_messages` until their time, then sent by the `message.scheduled` job through
 * `sendMessage` as if typed at that moment, so every rule is read again then (still in it, not
 * blocked, a request's one message, an organization closed); sent, the row goes. One that can't
 * go keeps its row with why, in the sender's language, and the sender is told once. A private
 * conversation's words never reach the server, so none is kept for one. Checked now as a send
 * would be, so what would be refused today is refused at once rather than at its time.
 */
import type { ScheduleMessageBody } from '@caime/core';
import { uuidv7 } from '@caime/core';
import type { ScheduledMessageView } from '@caime/core/api';
import { tr } from '@caime/core/i18n';
import type { z } from 'zod';
import type { AppContext } from '../context';
import { membership } from './conversation-views';
import { AppError, badRequest, notFound } from './errors';
import { asReader } from './i18n';
import { enqueue, registerJob } from './jobs';
import { afterMessage } from './message-effects';
import { assertCanSend, messageViews, participantsOf, sendMessage } from './messages';
import { notify } from './notify';

/** As many as one person keeps waiting at once, across their conversations. */
export const SCHEDULED_MAX = 100;
/** How far ahead a message may be written for. */
export const SCHEDULE_AHEAD_DAYS = 366;
/** The soonest a message may be sent later: anything sooner is a send. */
const SOONEST_MS = 60_000;

const COLUMNS = [
  'id',
  'conversation_id',
  'sender_id',
  'body',
  'reply_to_id',
  'mentions',
  'send_at',
  'failure',
  'created_at',
] as const;

type Row = {
  id: string;
  conversation_id: string;
  body: string;
  reply_to_id: string | null;
  send_at: Date;
  failure: string | null;
  created_at: Date;
};

const viewOf = (r: Row): ScheduledMessageView => ({
  id: r.id,
  conversationId: r.conversation_id,
  body: r.body,
  replyToId: r.reply_to_id,
  sendAt: new Date(r.send_at).toISOString(),
  failure: r.failure,
  createdAt: new Date(r.created_at).toISOString(),
});

const clientIdOf = (id: string) => `scheduled:${id}`;

export async function scheduleMessage(
  ctx: AppContext,
  userId: string,
  conversationId: string,
  body: z.infer<typeof ScheduleMessageBody>,
): Promise<ScheduledMessageView> {
  const { conversation } = await membership(ctx, userId, conversationId);
  if (conversation.privacy_class === 'private')
    throw badRequest(
      tr('A private conversation’s words stay on your devices, so they can’t wait on the server.'),
    );
  const sendAt = new Date(body.sendAt);
  const now = ctx.now().getTime();
  if (sendAt.getTime() < now + SOONEST_MS)
    throw badRequest(tr('Choose a time at least a minute from now.'));
  if (sendAt.getTime() > now + SCHEDULE_AHEAD_DAYS * 86_400_000)
    throw badRequest(tr('Choose a time within a year.'));
  // The same words sent again after an answer that never came are the one kept already.
  const kept = await ctx.db
    .selectFrom('scheduled_messages')
    .select(COLUMNS)
    .where('sender_id', '=', userId)
    .where('client_id', '=', body.clientId)
    .executeTakeFirst();
  if (kept) {
    if (kept.conversation_id !== conversationId)
      throw badRequest(tr('That clientId was already used.'));
    return viewOf(kept);
  }
  // Refused now as a send would be (a block, a request's one message, an organization closed).
  await assertCanSend(ctx, userId, conversationId, {
    clientId: clientIdOf(uuidv7()),
    kind: 'text',
    body: body.body,
    replyToId: body.replyToId ?? null,
  });
  const waiting = await ctx.db
    .selectFrom('scheduled_messages')
    .select((eb) => eb.fn.countAll<number>().as('n'))
    .where('sender_id', '=', userId)
    .executeTakeFirstOrThrow();
  if (Number(waiting.n) >= SCHEDULED_MAX)
    throw badRequest(
      tr('You have {max} messages waiting to be sent. Send or delete one first.', {
        max: SCHEDULED_MAX,
      }),
    );
  const id = uuidv7();
  const row = await ctx.db
    .insertInto('scheduled_messages')
    .values({
      id,
      conversation_id: conversationId,
      sender_id: userId,
      client_id: body.clientId,
      body: body.body,
      reply_to_id: body.replyToId ?? null,
      mentions: body.mentions ?? [],
      send_at: sendAt,
    })
    .onConflict((oc) => oc.columns(['sender_id', 'client_id']).doNothing())
    .returning(COLUMNS)
    .executeTakeFirst();
  if (!row) {
    const again = await ctx.db
      .selectFrom('scheduled_messages')
      .select(COLUMNS)
      .where('sender_id', '=', userId)
      .where('client_id', '=', body.clientId)
      .executeTakeFirstOrThrow();
    return viewOf(again);
  }
  await enqueue(ctx, 'message.scheduled', { id }, { runAt: sendAt, dedupeKey: `scheduled:${id}` });
  return viewOf(row);
}

/** The asker's own in a conversation they're in, the soonest first. */
export async function scheduledIn(
  ctx: AppContext,
  userId: string,
  conversationId: string,
): Promise<ScheduledMessageView[]> {
  await membership(ctx, userId, conversationId);
  const rows = await ctx.db
    .selectFrom('scheduled_messages')
    .select(COLUMNS)
    .where('conversation_id', '=', conversationId)
    .where('sender_id', '=', userId)
    .orderBy('send_at')
    .execute();
  return rows.map(viewOf);
}

/** Its sender takes it back before its time; one that couldn't go is let go the same way. */
export async function deleteScheduled(ctx: AppContext, userId: string, id: string): Promise<void> {
  const gone = await ctx.db
    .deleteFrom('scheduled_messages')
    .where('id', '=', id)
    .where('sender_id', '=', userId)
    .returning('conversation_id')
    .executeTakeFirst();
  if (!gone) throw notFound(tr('That message'));
}

/**
 * Sends one now: at its time (the job), or when its sender asks before it (`early`). Sent, the row
 * goes; refused, the row keeps why and its sender is told. Twice is once: the message's client id
 * is the row's, so a second run finds the message already there.
 */
export async function sendScheduled(
  ctx: AppContext,
  id: string,
  opts: { by?: string } = {},
): Promise<{ messageId: string } | { failure: string } | null> {
  const row = await ctx.db
    .selectFrom('scheduled_messages')
    .select([...COLUMNS])
    .where('id', '=', id)
    .executeTakeFirst();
  if (!row || (opts.by && row.sender_id !== opts.by)) throw notFound(tr('That message'));
  // Run again after it failed, or before its time: only its sender's Send now goes on.
  if (row.failure && !opts.by) return { failure: row.failure };
  if (!opts.by && new Date(row.send_at).getTime() > ctx.now().getTime()) return null;
  const sender = row.sender_id;
  try {
    const result = await asReader(ctx, sender, () =>
      sendMessage(ctx, sender, row.conversation_id, {
        clientId: clientIdOf(row.id),
        kind: 'text',
        body: row.body,
        replyToId: row.reply_to_id,
        ...(row.mentions.length ? { mentions: row.mentions } : {}),
      }),
    );
    await ctx.db.deleteFrom('scheduled_messages').where('id', '=', row.id).execute();
    if (result.created) {
      const [view] = await messageViews(ctx.db, [result.message], sender);
      const members = (await participantsOf(ctx.db, row.conversation_id)).map((p) => p.user_id);
      await ctx.bus.publish(members, {
        type: 'message.created',
        data: { ...view!, clientId: null },
      });
      const { message, analysis } = result;
      ctx.defer('after-message', () => afterMessage(ctx, message, analysis));
    }
    await ctx.bus.publish([sender], {
      type: 'scheduled.changed',
      data: { conversationId: row.conversation_id },
    });
    return { messageId: result.message.id };
  } catch (e) {
    if (!(e instanceof AppError)) throw e;
    // Refused by a rule (no longer in it, blocked, a request unanswered): kept, with why.
    const failure = e.message;
    await ctx.db
      .updateTable('scheduled_messages')
      .set({ failure, failed_at: ctx.now() })
      .where('id', '=', row.id)
      .execute();
    await ctx.bus.publish([sender], {
      type: 'scheduled.changed',
      data: { conversationId: row.conversation_id },
    });
    if (!opts.by)
      await notify(ctx, {
        userId: sender,
        kind: 'message',
        level: 'attention',
        title: () => tr('A message you wrote for later couldn’t be sent'),
        body: () => failure,
        data: { conversationId: row.conversation_id },
      });
    return { failure };
  }
}

export function registerScheduledJob(): void {
  registerJob('message.scheduled', async (ctx, payload) => {
    const id = (payload as { id?: unknown }).id;
    if (typeof id !== 'string') return;
    await sendScheduled(ctx, id).catch((e) => {
      // Taken back since it was queued: nothing to send.
      if (e instanceof AppError && e.status === 404) return;
      throw e;
    });
  });
}
