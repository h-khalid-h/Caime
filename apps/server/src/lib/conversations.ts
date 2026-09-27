import { nextOwner, uuidv7 } from '@caishy/core';
import type { Kysely, Transaction } from 'kysely';
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

/**
 * Before an account goes, or someone leaves a space: every group of theirs they owned passes on
 * (a space's General goes with the space). `where` narrows it to one space's conversations.
 * Returns each one handed on and who owns it now, to be told once the change is in.
 */
export async function handOverGroups(
  trx: Transaction<Database>,
  userId: string,
  where: { spaceId?: string } = {},
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
    handed.push({
      conversationId: conversation_id,
      heir: await handOverGroup(trx, conversation_id, userId),
    });
  }
  return handed;
}
