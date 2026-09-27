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
 * A group whose owner goes (they leave, or their account does) passes to whoever has been its
 * admin longest, else whoever has been in it longest, so someone can always run it (PRD §56).
 * Returns who owns it now, or null when nobody is left.
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
      .execute();
  return heir;
}

/** Before an account goes: every group it owned passes on (a space's General goes with the space). */
export async function handOverGroups(db: Q, userId: string): Promise<void> {
  const owned = await db
    .selectFrom('participants as p')
    .innerJoin('conversations as c', 'c.id', 'p.conversation_id')
    .select('p.conversation_id')
    .where('p.user_id', '=', userId)
    .where('p.role', '=', 'owner')
    .where('p.left_at', 'is', null)
    .where('c.kind', 'not in', ['direct', 'business'])
    .where('c.is_general', '=', false)
    .execute();
  for (const { conversation_id } of owned) {
    await db
      .updateTable('participants')
      .set({ role: 'member' })
      .where('conversation_id', '=', conversation_id)
      .where('user_id', '=', userId)
      .execute();
    await handOverGroup(db, conversation_id, userId);
  }
}
