/**
 * A space's people and its conversations (PRD §41): who's in it now, a conversation started in
 * it, and telling everyone in it that it changed. Here rather than in the routes so a topic
 * under a space (lib/topics.ts) and the space routes start conversations the same way.
 */
import { uuidv7 } from '@caime/core';
import type { AppContext } from '../context';
import { sendSystem } from './conversation-views';
import { recordEvent } from './events';

export async function activeMembers(ctx: AppContext, spaceId: string) {
  return ctx.db
    .selectFrom('space_members')
    .select(['user_id', 'role', 'joined_at'])
    .where('space_id', '=', spaceId)
    .where('left_at', 'is', null)
    .orderBy('joined_at')
    .execute();
}

/** A conversation in the space: everyone in it, or just its starter until others join. */
export async function createSpaceConversation(
  ctx: AppContext,
  userId: string,
  spaceId: string,
  input: { title: string; purpose?: string | null; everyone: boolean },
): Promise<string> {
  const members = input.everyone
    ? (await activeMembers(ctx, spaceId)).map((m) => m.user_id).filter((u) => u !== userId)
    : [];
  const id = uuidv7();
  await ctx.db.transaction().execute(async (trx) => {
    await trx
      .insertInto('conversations')
      .values({
        id,
        kind: 'group',
        title: input.title,
        purpose: input.purpose ?? null,
        space_id: spaceId,
        created_by: userId,
      })
      .execute();
    await trx
      .insertInto('participants')
      .values([
        { conversation_id: id, user_id: userId, role: 'owner' },
        ...members.map((u) => ({ conversation_id: id, user_id: u, role: 'member' as const })),
      ])
      .execute();
    await recordEvent(trx, 'conversation.created', userId, {
      conversationId: id,
      kind: 'space',
      spaceId,
    });
  });
  await sendSystem(ctx, id, userId, 'group_created', { title: input.title });
  await ctx.bus.publish([userId, ...members], {
    type: 'conversation.created',
    data: { conversationId: id },
  });
  await tellSpace(ctx, spaceId);
  return id;
}

/** Everyone in the space refreshes it (and whoever else is named, such as someone who left). */
export async function tellSpace(ctx: AppContext, spaceId: string, also: string[] = []) {
  const members = (await activeMembers(ctx, spaceId)).map((m) => m.user_id);
  await ctx.bus.publish([...new Set([...members, ...also])], {
    type: 'space.updated',
    data: { spaceId },
  });
}
