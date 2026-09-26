import { uuidv7 } from '@caishy/core';
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
        .where('request_state', '=', 'pending')
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
