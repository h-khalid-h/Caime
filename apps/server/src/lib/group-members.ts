/**
 * Into an existing group (PRD §56): the one way anyone joins one, whether its owner or admins
 * added them (the members route) or they let themselves in by its join link (M16 C3e). Under the
 * group's lock, `vouch` says why they may come in (refusing otherwise); then a meeting's guests
 * keep anyone under 18 out (R84), so does an open join link (R29), a private group holds what
 * its sealing can (R18), and its topics take its people.
 */
import { PRIVATE_GROUP_MAX } from '@caime/core';
import type { Transaction } from 'kysely';
import type { AppContext } from '../context';
import type { Database } from '../db/schema';
import { privateGroupFull, sendSystem } from './conversation-views';
import { lockConversation, mirrorTopics, type TopicChange } from './conversations';
import { assertNoMinorWhileLinkOpen } from './join-links';
import { assertNoMinorWithGuests } from './meeting-guests';
import { participantsOf } from './messages';
import { spaceChanged } from './spaces';

/** A topic's people changed with its group's: everyone in it, and whoever went, sees so. */
export async function tellTopics(ctx: AppContext, changes: TopicChange[]): Promise<void> {
  for (const c of changes)
    await ctx.bus.publish(
      [...c.left, ...(await participantsOf(ctx.db, c.topicId)).map((p) => p.user_id)],
      { type: 'conversation.updated', data: { conversationId: c.topicId } },
    );
}

/**
 * Adds whoever isn't in it yet, and answers who that was. `actorId` added them, or, with
 * `joined`, is the one who came in by a link (the line says "joined", not "added").
 */
export async function addToGroup(
  ctx: AppContext,
  conversationId: string,
  userIds: string[],
  opts: {
    actorId: string;
    /** Under the group's lock, before anyone comes in: why they may (throws otherwise). */
    vouch: (trx: Transaction<Database>, inIt: string[]) => Promise<void>;
    joined?: boolean;
  },
): Promise<string[]> {
  const id = conversationId;
  const added = await ctx.db.transaction().execute(async (trx) => {
    await lockConversation(trx, id);
    // Who's in it, and what it is, as they are now.
    const inIt = (await participantsOf(trx, id)).map((p) => p.user_id);
    await opts.vouch(trx, inIt);
    const present = new Set(inIt);
    const fresh = [...new Set(userIds)].filter((u) => !present.has(u));
    // A meeting's guests are strangers to everyone in it (R84): nobody under 18 joins them (R29).
    await assertNoMinorWithGuests(trx, id, fresh, ctx.now());
    // An open join link lets strangers in: nobody under 18 joins while one is (R29).
    await assertNoMinorWhileLinkOpen(trx, { kind: 'group', id }, fresh, ctx.now());
    const conversation = await trx
      .selectFrom('conversations')
      .select(['last_seq', 'privacy_class', 'space_id'])
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
    // Every message in a private group is sealed for each of its people's devices.
    if (conversation.privacy_class === 'private' && present.size + fresh.length > PRIVATE_GROUP_MAX)
      throw privateGroupFull();
    const { last_seq } = conversation;
    for (const userId of fresh)
      await trx
        .insertInto('participants')
        .values({
          conversation_id: id,
          user_id: userId,
          role: 'member',
          joined_at: ctx.now(),
          last_read_seq: last_seq,
        })
        // Back in it after leaving, they start again: a member, from now, caught up. Whatever
        // they were before (an admin, the longest there) isn't theirs any more.
        .onConflict((oc) =>
          oc
            .columns(['conversation_id', 'user_id'])
            .doUpdateSet({
              left_at: null,
              role: 'member',
              joined_at: ctx.now(),
              last_read_seq: last_seq,
              last_delivered_seq: last_seq,
            })
            .where('participants.left_at', 'is not', null),
        )
        .execute();
    // Its topics have its people.
    return {
      fresh,
      spaceId: conversation.space_id,
      topics: await mirrorTopics(trx, id, ctx.now()),
    };
  });
  await tellTopics(ctx, added.topics);
  if (!added.fresh.length) return [];
  if (opts.joined)
    await sendSystem(ctx, id, opts.actorId, 'member_joined', { userId: opts.actorId });
  else await sendSystem(ctx, id, opts.actorId, 'members_added', { userIds: added.fresh });
  await ctx.bus.publish([...(await participantsOf(ctx.db, id)).map((p) => p.user_id)], {
    type: 'conversation.updated',
    data: { conversationId: id },
  });
  // Someone let in by a link is new to the inbox: it shows the group at once.
  if (opts.joined)
    await ctx.bus.publish(added.fresh, {
      type: 'conversation.created',
      data: { conversationId: id },
    });
  // A space's conversation: the space shows who's in each of its conversations.
  if (added.spaceId) await spaceChanged(ctx, added.spaceId);
  return added.fresh;
}
