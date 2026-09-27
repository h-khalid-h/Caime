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

/**
 * Its maker's alone: linked to no conversation yet. Once it's a conversation's, it's read and
 * changed as that conversation says, its maker included, so leaving a group, or being made a
 * member again, takes it with the rest.
 */
async function ownAndUnlinked(db: Q, userId: string, contextId: string): Promise<boolean> {
  const own = await db
    .selectFrom('contexts as x')
    .select('x.id')
    .where('x.id', '=', contextId)
    .where('x.created_by', '=', userId)
    .where((eb) =>
      eb.not(
        eb.exists(
          eb.selectFrom('conversations as c').select('c.id').whereRef('c.context_id', '=', 'x.id'),
        ),
      ),
    )
    .executeTakeFirst();
  return Boolean(own);
}

/** Anyone in a conversation it's linked to reads it; so does its maker, while it's theirs alone. */
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
  return Boolean(linked) || ownAndUnlinked(db, userId, contextId);
}

/**
 * Changing it, or linking it to another conversation: whoever may change a conversation it's
 * linked to (either person in a one-to-one, a group's owner and admins), or its maker while it's
 * theirs alone. Someone in a group who isn't one of its admins reads it, and that's all, so they
 * can't take it to a one-to-one of their own to change it there.
 */
export async function contextEditable(db: Q, userId: string, contextId: string): Promise<boolean> {
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
  return Boolean(runs) || ownAndUnlinked(db, userId, contextId);
}
