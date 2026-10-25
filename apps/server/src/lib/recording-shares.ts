/**
 * A call's recording shared on (R114 (7), M17 I13e): anyone who was in the call shares it into
 * conversations they're in, once it's recorded, as a message of theirs that points at the
 * recording (`payload.recording = { callId }`, the server's mark on a text that says nothing
 * else: a device's text carries no payload) and is found again by `call_recording_shares`.
 * Whoever is in that conversation plays the parts the sharer could, by the share's own addresses
 * (`/messages/:id/recording/…`), while the message is readable to them and the recording is
 * kept; a share goes when the recording does (`lib/call-recording.ts`). Never into a private
 * conversation (R18) nor a customer conversation (the mask, R15; calls with organizations are
 * M16 H8a), never to someone reached by mail (`notByMail`), and never forwarded on (the forward
 * route refuses it): the consent button said who may share it, and that's whoever was in the call.
 */
import type { MessageIdsResponse, RecordingShareResponse } from '@caime/core';
import { tr } from '@caime/core';
import type { AppContext } from '../context';
import type { Call } from '../db/schema';
import { assertCanWrite } from './blocks';
import { playableFrame } from './call-frames';
import { playablePart, recordingFor, type ShareVia } from './call-recording';
import { membership } from './conversation-views';
import { AppError, badRequest, notFound } from './errors';
import { afterMessage } from './message-effects';
import { assertCanSend, messageViews, participantsOf, readableBy, sendMessage } from './messages';

/** The share this person may read: its call, and whose reading it carries. */
async function shareFor(
  ctx: AppContext,
  messageId: string,
  viewerId: string,
): Promise<{ call: Call; via: ShareVia }> {
  const m = await ctx.db
    .selectFrom('messages')
    .select(['id', 'conversation_id', 'sender_id', 'payload'])
    .where('id', '=', messageId)
    .where(readableBy(viewerId, ctx.now()))
    .executeTakeFirst();
  const callId = (m?.payload as { recording?: { callId?: unknown } } | null)?.recording?.callId;
  if (!m || typeof callId !== 'string' || !m.sender_id) throw notFound(tr('That recording'));
  await membership(ctx, viewerId, m.conversation_id);
  const call = await ctx.db
    .selectFrom('calls')
    .selectAll()
    .where('id', '=', callId)
    .executeTakeFirst();
  if (!call) throw notFound(tr('That recording'));
  return { call, via: { messageId: m.id, sharedBy: m.sender_id } };
}

/** `GET /messages/:id/recording`: the recording as whoever is in the share's conversation plays it. */
export async function recordingShareView(
  ctx: AppContext,
  messageId: string,
  viewerId: string,
): Promise<RecordingShareResponse> {
  const { call, via } = await shareFor(ctx, messageId, viewerId);
  return {
    recording: await recordingFor(ctx, call, viewerId, via),
    callAt: call.created_at.toISOString(),
  };
}

/** `GET /messages/:id/recording/:partId`: a part of a share, ready, by the sharer's reading. */
export async function playableShare(
  ctx: AppContext,
  messageId: string,
  viewerId: string,
  partId: string,
) {
  const { call, via } = await shareFor(ctx, messageId, viewerId);
  return playablePart(ctx, call, viewerId, partId, via);
}

/** `GET /messages/:id/recording/frames/:frameId`: a frame of a share (M17 I13h), by the sharer's reading. */
export async function frameShare(
  ctx: AppContext,
  messageId: string,
  viewerId: string,
  frameId: string,
) {
  const { call, via } = await shareFor(ctx, messageId, viewerId);
  return playableFrame(ctx, call, viewerId, frameId, via);
}

/**
 * Share the call's recording into these conversations, all or none: each checked as a send
 * there is (blocks, a request unanswered, an organization closed, someone reached by mail), each
 * a send on the limiter, told and followed as any message, and kept in the index that finds it
 * when the recording goes.
 */
export async function shareRecording(
  ctx: AppContext,
  call: Call,
  userId: string,
  conversationIds: string[],
  clientId: string,
): Promise<MessageIdsResponse> {
  const recording = await recordingFor(ctx, call, userId);
  if (!recording || recording.state === 'deleted') throw notFound(tr('That recording'));
  if (recording.state === 'recording')
    throw new AppError(
      409,
      'conflict',
      tr('The recording can be shared once the call is over and it’s ready to play.'),
    );
  const copy = (conversationId: string) => ({
    clientId: `${clientId}:${conversationId}`,
    kind: 'text' as const,
    body: null,
    payload: { recording: { callId: call.id } },
  });
  const targets = [...new Set(conversationIds)];
  for (const conversationId of targets) {
    const { conversation } = await membership(ctx, userId, conversationId);
    if (conversation.privacy_class === 'private')
      throw badRequest(tr('A recording isn’t shared into a private conversation.'));
    if (conversation.kind === 'business')
      throw badRequest(tr('A recording isn’t shared into a customer conversation.'));
    await assertCanWrite(ctx, conversationId, userId);
    await assertCanSend(ctx, userId, conversationId, copy(conversationId), {
      serverPayload: true,
    });
  }
  for (const _ of targets)
    ctx.limiter.hit(`send:${userId}`, ctx.config.isTest ? 10_000 : 120, 60_000);
  const out: string[] = [];
  for (const conversationId of targets) {
    const result = await sendMessage(ctx, userId, conversationId, copy(conversationId), {
      serverPayload: true,
    });
    out.push(result.message.id);
    await ctx.db
      .insertInto('call_recording_shares')
      .values({ message_id: result.message.id, call_id: call.id, shared_by: userId })
      .onConflict((oc) => oc.column('message_id').doNothing())
      .execute();
    if (result.created) {
      const [view] = await messageViews(ctx.db, [result.message], userId);
      await ctx.bus.publish(
        (await participantsOf(ctx.db, conversationId)).map((p) => p.user_id),
        { type: 'message.created', data: { ...view, clientId: null } },
      );
      const { message, analysis } = result;
      ctx.defer('after-message', () => afterMessage(ctx, message, analysis));
    }
  }
  ctx.metrics.callRecordings.inc({ outcome: 'shared' }, out.length);
  return { messageIds: out };
}
