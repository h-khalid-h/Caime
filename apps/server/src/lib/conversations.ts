import { nextOwner, uuidv7 } from '@caishy/core';
import { type Kysely, sql, type Transaction } from 'kysely';
import type { Database } from '../db/schema';
import { pairKey } from './relations';

type Q = Kysely<Database> | Transaction<Database>;

/**
 * The one general direct conversation for a pair (PRD §16), created on first need. When a
 * message request conversation already exists, it becomes the general one on connection.
 */
export async function ensureDirectConversation(
  db: Q,
  a: string,
  b: string,
  opts: { connectionId?: string | null; createdBy: string; requestFrom?: string | null },
): Promise<{ id: string; created: boolean }> {
  const { key } = pairKey(a, b);
  const existing = await db
    .selectFrom('conversations')
    .select(['id', 'connection_id'])
    .where('direct_key', '=', key)
    .where('is_general', '=', true)
    .executeTakeFirst();
  if (existing) {
    if (opts.connectionId && existing.connection_id !== opts.connectionId) {
      await db
        .updateTable('conversations')
        .set({ connection_id: opts.connectionId })
        .where('id', '=', existing.id)
        .execute();
      await db
        .updateTable('participants')
        .set({ request_state: 'accepted' })
        .where('conversation_id', '=', existing.id)
        .where('request_state', 'in', ['pending', 'declined'])
        .execute();
    }
    return { id: existing.id, created: false };
  }
  const id = uuidv7();
  await db
    .insertInto('conversations')
    .values({
      id,
      kind: 'direct',
      direct_key: key,
      connection_id: opts.connectionId ?? null,
      is_general: true,
      created_by: opts.createdBy,
    })
    .execute();
  const requestRecipient = opts.requestFrom ? (opts.requestFrom === a ? b : a) : null;
  await db
    .insertInto('participants')
    .values([
      {
        conversation_id: id,
        user_id: a,
        role: 'member',
        request_state: requestRecipient === a ? 'pending' : null,
      },
      {
        conversation_id: id,
        user_id: b,
        role: 'member',
        request_state: requestRecipient === b ? 'pending' : null,
      },
    ])
    .execute();
  return { id, created: true };
}

/**
 * One change at a time to who's in a group or who runs it (PRD §56): adding, leaving, removing,
 * making admins and handing it on each take this lock first and read who's who under it, so two
 * at once never leave it with two owners, or none.
 */
export async function lockConversation(trx: Transaction<Database>, id: string): Promise<void> {
  await trx.selectFrom('conversations').select('id').where('id', '=', id).forUpdate().execute();
}

/** Someone's place in a conversation now, if they're still in it. */
export async function seatIn(db: Q, conversationId: string, userId: string) {
  return db
    .selectFrom('participants')
    .selectAll()
    .where('conversation_id', '=', conversationId)
    .where('user_id', '=', userId)
    .where('left_at', 'is', null)
    .executeTakeFirst();
}

/**
 * A group whose owner goes (they leave, or their account does) passes to whoever has been its
 * admin longest, else whoever has been in it longest, so someone can always run it (PRD §56).
 * Returns who owns it now, or null when nobody is left. Called under lockConversation.
 */
export async function handOverGroup(
  db: Q,
  conversationId: string,
  leaving: string,
): Promise<string | null> {
  const people = await db
    .selectFrom('participants as p')
    .innerJoin('users as u', 'u.id', 'p.user_id')
    .select(['p.user_id', 'p.role', 'p.joined_at'])
    .where('p.conversation_id', '=', conversationId)
    .where('p.left_at', 'is', null)
    .where('p.role', 'in', ['admin', 'member'])
    // People only: an app's bot or an agent never runs someone's group.
    .where('u.kind', '=', 'human')
    .execute();
  const heir = nextOwner(
    people.map((p) => ({ userId: p.user_id, role: p.role, joinedAt: p.joined_at.toISOString() })),
    leaving,
  );
  if (heir)
    await db
      .updateTable('participants')
      .set({ role: 'owner' })
      .where('conversation_id', '=', conversationId)
      .where('user_id', '=', heir)
      .where('left_at', 'is', null)
      .execute();
  return heir;
}

/** A group's topic (PRD §58): the group again, on one subject, with its people and its roles. */
export const isGroupTopic = (c: { kind: string; parent_id: string | null }) =>
  c.kind === 'group' && c.parent_id !== null;

/**
 * A conversation's name where nothing else says what it is (a call, a notification, a search
 * result): a group's topic goes by its group's with its own, "Book club · Middlemarch".
 */
export function titleWithGroup(alias: string) {
  const c = (col: string) => sql.ref(`${alias}.${col}`);
  return sql<string | null>`case when ${c('kind')} = 'group' and ${c('parent_id')} is not null
    then coalesce((select g.title from conversations g where g.id = ${c('parent_id')}) || ' · ', '')
      || ${c('title')}
    else ${c('title')} end`;
}

export async function shownTitle(db: Q, conversationId: string): Promise<string | null> {
  const row = await db
    .selectFrom('conversations as c')
    .select(titleWithGroup('c').as('title'))
    .where('c.id', '=', conversationId)
    .executeTakeFirst();
  return row?.title ?? null;
}

/** Who a topic's people change for: who came into it, who went, whose role moved. */
export interface TopicChange {
  topicId: string;
  joined: string[];
  left: string[];
  changed: string[];
}

/**
 * A group's topics have its people, in the roles they have in it: after any change to who's in
 * the group or who runs it, each topic is made to match, under the same lock (the group's, which
 * the caller holds, then each topic's in order). Someone new is caught up, as in the group, and
 * has it as quiet as they have the group; someone gone is nobody in its topics either.
 */
export async function mirrorTopics(
  trx: Transaction<Database>,
  parentId: string,
  now: Date,
): Promise<TopicChange[]> {
  const topics = await trx
    .selectFrom('conversations')
    .select(['id', 'last_seq'])
    .where('parent_id', '=', parentId)
    .where('kind', '=', 'group')
    .orderBy('id')
    .forUpdate()
    .execute();
  if (!topics.length) return [];
  const people = new Map(
    (
      await trx
        .selectFrom('participants')
        .select(['user_id', 'role', 'muted_until', 'attention'])
        .where('conversation_id', '=', parentId)
        .where('left_at', 'is', null)
        .execute()
    ).map((p) => [p.user_id, p]),
  );
  const changes: TopicChange[] = [];
  for (const topic of topics) {
    const seats = await trx
      .selectFrom('participants')
      .select(['user_id', 'role', 'left_at'])
      .where('conversation_id', '=', topic.id)
      .execute();
    const change: TopicChange = { topicId: topic.id, joined: [], left: [], changed: [] };
    for (const [userId, { role, muted_until, attention }] of people) {
      const seat = seats.find((x) => x.user_id === userId);
      if (!seat || seat.left_at) {
        // Coming into a topic, it's as quiet for them as the group is: muted, or only when
        // they're named, if that's how they have the group. A topic's own setting is theirs after.
        const quiet = { muted_until, attention };
        await trx
          .insertInto('participants')
          .values({
            conversation_id: topic.id,
            user_id: userId,
            role,
            joined_at: now,
            last_read_seq: topic.last_seq,
            last_delivered_seq: topic.last_seq,
            ...quiet,
          })
          .onConflict((oc) =>
            oc.columns(['conversation_id', 'user_id']).doUpdateSet({
              left_at: null,
              role,
              joined_at: now,
              last_read_seq: topic.last_seq,
              last_delivered_seq: topic.last_seq,
              ...quiet,
            }),
          )
          .execute();
        change.joined.push(userId);
      } else if (seat.role !== role) {
        await trx
          .updateTable('participants')
          .set({ role })
          .where('conversation_id', '=', topic.id)
          .where('user_id', '=', userId)
          .execute();
        change.changed.push(userId);
      }
    }
    for (const seat of seats)
      if (!seat.left_at && !people.has(seat.user_id)) {
        await trx
          .updateTable('participants')
          .set({ left_at: now, role: 'member' })
          .where('conversation_id', '=', topic.id)
          .where('user_id', '=', seat.user_id)
          .execute();
        change.left.push(seat.user_id);
      }
    if (change.joined.length || change.left.length || change.changed.length) changes.push(change);
  }
  return changes;
}

/**
 * Before an account goes, or someone leaves a space: every group of theirs they owned passes on
 * (a space's General goes with the space). `where` narrows it to one space's conversations.
 * Returns each one handed on and who owns it now, to be told once the change is in.
 */
export async function handOverGroups(
  trx: Transaction<Database>,
  userId: string,
  where: { spaceId?: string } = {},
  now: Date = new Date(),
): Promise<Array<{ conversationId: string; heir: string | null }>> {
  const owned = await trx
    .selectFrom('participants as p')
    .innerJoin('conversations as c', 'c.id', 'p.conversation_id')
    .select('p.conversation_id')
    .where('p.user_id', '=', userId)
    .where('p.role', '=', 'owner')
    .where('p.left_at', 'is', null)
    .where('c.kind', 'not in', ['direct', 'business'])
    .where('c.is_general', '=', false)
    // A group's topics are run as the group is: they follow it, below.
    .where((eb) => eb.or([eb('c.parent_id', 'is', null), eb('c.kind', '<>', 'group')]))
    .$if(where.spaceId !== undefined, (qb) => qb.where('c.space_id', '=', where.spaceId as string))
    // Always in the same order, so two hand-overs never wait on each other's locks.
    .orderBy('p.conversation_id')
    .execute();
  const handed: Array<{ conversationId: string; heir: string | null }> = [];
  for (const { conversation_id } of owned) {
    await lockConversation(trx, conversation_id);
    await trx
      .updateTable('participants')
      .set({ role: 'member' })
      .where('conversation_id', '=', conversation_id)
      .where('user_id', '=', userId)
      .execute();
    const heir = await handOverGroup(trx, conversation_id, userId);
    handed.push({ conversationId: conversation_id, heir });
    // Its topics are run as it is, by the same people.
    for (const topic of await mirrorTopics(trx, conversation_id, now))
      if (topic.changed.length) handed.push({ conversationId: topic.topicId, heir });
  }
  return handed;
}
