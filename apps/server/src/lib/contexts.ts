/**
 * Who may see and change a conversation's context (PRD §17: its project, order, trip, deadline)
 * and a conversation's own settings. The same rule everywhere: either person in a one-to-one; in
 * a group, its owner and admins.
 */
import type { Kysely, Transaction } from 'kysely';
import type { Database } from '../db/schema';

type Q = Kysely<Database> | Transaction<Database>;

/** A conversation's name, purpose, context and disappearing messages. */
export const canEditConversation = (kind: string, role: string): boolean =>
  kind === 'direct' || role === 'owner' || role === 'admin';

/** Anyone in a conversation it's linked to reads it, and so does whoever made it. */
export async function contextVisible(db: Q, userId: string, contextId: string): Promise<boolean> {
  const linked = await db
    .selectFrom('conversations as c')
    .innerJoin('participants as p', (j) =>
      j.onRef('p.conversation_id', '=', 'c.id').on('p.user_id', '=', userId),
    )
    .select('c.id')
    .where('c.context_id', '=', contextId)
    .where('p.left_at', 'is', null)
    .executeTakeFirst();
  if (linked) return true;
  const own = await db
    .selectFrom('contexts')
    .select('id')
    .where('id', '=', contextId)
    .where('created_by', '=', userId)
    .executeTakeFirst();
  return Boolean(own);
}

/**
 * Changing it (or linking it to another conversation): whoever made it, or whoever may change a
 * conversation it's linked to. Someone in a group who isn't one of its admins reads it, and
 * that's all.
 */
export async function contextEditable(db: Q, userId: string, contextId: string): Promise<boolean> {
  const own = await db
    .selectFrom('contexts')
    .select('id')
    .where('id', '=', contextId)
    .where('created_by', '=', userId)
    .executeTakeFirst();
  if (own) return true;
  const runs = await db
    .selectFrom('conversations as c')
    .innerJoin('participants as p', (j) =>
      j.onRef('p.conversation_id', '=', 'c.id').on('p.user_id', '=', userId),
    )
    .select('c.id')
    .where('c.context_id', '=', contextId)
    .where('p.left_at', 'is', null)
    .where((eb) => eb.or([eb('c.kind', '=', 'direct'), eb('p.role', 'in', ['owner', 'admin'])]))
    .executeTakeFirst();
  return Boolean(runs);
}
