/**
 * Topics (PRD §58): a conversation of its own under a group or a space, with the group's people
 * in its roles (`mirrorTopics`). Who may start one and how one is made, for the routes and for
 * accepting a topic suggestion.
 */
/**
 * Conversations and messages (PRD §15–§22, §26, §56; R14).
 */

import { tr, uuidv7 } from '@caime/core';
import { sql } from 'kysely';
import type { AppContext } from '../context';

import type { Conversation } from '../db/schema';
import { assertCanWrite } from '../lib/blocks';
import { lockConversation, mirrorTopics, seatIn } from '../lib/conversations';
import { badRequest, forbidden, notFound } from '../lib/errors';
import { recordEvent } from '../lib/events';
import { participantsOf } from '../lib/messages';
import { between } from '../lib/relations';
import { membership, sendSystem } from './conversation-views';
import { createSpaceConversation } from './space-conversations';

/**
 * Whether someone may start a topic from a conversation (PRD §58), however they start it (from
 * its details, or by accepting a suggestion): someone who may write there (blocks), from a
 * one-to-one only with someone they're connected with and never a private one, and never with an
 * organization. A few an hour.
 */
export async function assertCanStartTopic(
  ctx: AppContext,
  userId: string,
  conversation: Pick<Conversation, 'id' | 'kind' | 'privacy_class'>,
): Promise<void> {
  await assertCanWrite(ctx, conversation.id, userId);
  if (conversation.kind === 'business')
    throw badRequest(tr('Topics are for conversations between people.'));
  if (conversation.kind === 'direct') {
    // Connected now: a connection removed since leaves the pair's one-to-one, not its topics.
    const other = await ctx.db
      .selectFrom('participants')
      .select('user_id')
      .where('conversation_id', '=', conversation.id)
      .where('user_id', '<>', userId)
      .executeTakeFirst();
    if (!other || !(await between(ctx.db, userId, other.user_id)).connected)
      throw forbidden(tr('Connect first to start topics.'));
    // A private one-to-one keeps to itself: a topic of it would be written in the clear.
    if (conversation.privacy_class === 'private')
      throw badRequest(
        tr('A private conversation keeps to itself: start a topic from your main one.'),
      );
  }
  ctx.limiter.hit(`topic:${userId}`, ctx.config.isTest ? 1000 : 20, 3_600_000);
}

export async function createTopicConversation(
  ctx: AppContext,
  userId: string,
  parentId: string,
  title: string,
  privacy: 'standard' | 'private' = 'standard',
) {
  const { conversation } = await membership(ctx, userId, parentId);
  // In a space, a topic that keeps coming up in General becomes a conversation for everyone.
  if (conversation.space_id && conversation.is_general && privacy === 'standard')
    return createSpaceConversation(ctx, userId, conversation.space_id, { title, everyone: true });
  if (conversation.kind === 'group' && !conversation.space_id)
    return createGroupTopic(ctx, userId, conversation.parent_id ?? conversation.id, title);
  if (conversation.kind !== 'direct' || !conversation.direct_key)
    throw badRequest(tr('Topics branch off a one-to-one, a group, or a space’s General.'));
  const members = await participantsOf(ctx.db, parentId);
  const id = uuidv7();
  await ctx.db.transaction().execute(async (trx) => {
    await trx
      .insertInto('conversations')
      .values({
        id,
        kind: 'direct',
        title,
        direct_key: conversation.direct_key,
        connection_id: conversation.connection_id,
        privacy_class: privacy,
        is_general: false,
        parent_id: conversation.is_general ? parentId : (conversation.parent_id ?? parentId),
        created_by: userId,
      })
      .execute();
    await trx
      .insertInto('participants')
      .values(members.map((m) => ({ conversation_id: id, user_id: m.user_id })))
      .execute();
    await recordEvent(trx, 'conversation.created', userId, { conversationId: id, kind: 'topic' });
  });
  await ctx.bus.publish(
    members.map((m) => m.user_id),
    { type: 'conversation.created', data: { conversationId: id } },
  );
  return id;
}

/**
 * A group's topic (PRD §58): the group again, on one subject. Its people are the group's, in the
 * roles they have there, and stay so (mirrorTopics); it's as private as the group, and its
 * messages disappear as the group's do. A topic of a topic is one of the group's. The same
 * subject started twice is the one topic.
 */
async function createGroupTopic(
  ctx: AppContext,
  userId: string,
  groupId: string,
  title: string,
): Promise<string> {
  const name = title.trim();
  const made = await ctx.db.transaction().execute(async (trx) => {
    await lockConversation(trx, groupId);
    if (!(await seatIn(trx, groupId, userId))) throw notFound(tr('That conversation'));
    const group = await trx
      .selectFrom('conversations')
      .selectAll()
      .where('id', '=', groupId)
      .executeTakeFirstOrThrow();
    const same = await trx
      .selectFrom('conversations')
      .select('id')
      .where('parent_id', '=', groupId)
      .where('kind', '=', 'group')
      .where(sql`lower(title)`, '=', sql`lower(${name})`)
      .executeTakeFirst();
    if (same) return { id: same.id, group, fresh: false };
    const id = uuidv7();
    await trx
      .insertInto('conversations')
      .values({
        id,
        kind: 'group',
        title: name,
        parent_id: groupId,
        privacy_class: group.privacy_class,
        retention_days: group.retention_days,
        created_by: userId,
      })
      .execute();
    await mirrorTopics(trx, groupId, ctx.now());
    await recordEvent(trx, 'conversation.created', userId, { conversationId: id, kind: 'topic' });
    return { id, group, fresh: true };
  });
  if (!made.fresh) return made.id;
  const by = await ctx.db
    .selectFrom('users')
    .select('display_name')
    .where('id', '=', userId)
    .executeTakeFirstOrThrow();
  await sendSystem(ctx, made.id, userId, 'topic_created', {
    title: made.group.title,
    by: by.display_name,
  });
  await sendSystem(ctx, groupId, userId, 'topic_started', {
    title: name,
    by: by.display_name,
    conversationId: made.id,
  });
  await ctx.bus.publish(
    (await participantsOf(ctx.db, made.id)).map((p) => p.user_id),
    { type: 'conversation.created', data: { conversationId: made.id } },
  );
  // The group lists its topics.
  await ctx.bus.publish(
    (await participantsOf(ctx.db, groupId)).map((p) => p.user_id),
    { type: 'conversation.updated', data: { conversationId: groupId } },
  );
  return made.id;
}
