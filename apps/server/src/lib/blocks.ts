/**
 * Who may still write in a conversation once someone has blocked (PRD §55). Writing is more than
 * sending: an edit, a reaction, a vote, moving a card and typing all reach the other side, so
 * every one of them asks here first.
 *
 * - A direct conversation between two people either of whom blocked the other: neither writes.
 * - A business conversation whose customer blocked the organization: it's closed, for the
 *   customer and for the whole team (its apps' bots included), until the customer unblocks it.
 */
import type { Kysely, Transaction } from 'kysely';
import type { AppContext } from '../context';
import type { Database } from '../db/schema';
import { AppError, forbidden } from './errors';
import { isBlockedEitherWay } from './relations';

type Q = Kysely<Database> | Transaction<Database>;

export async function orgBlocked(db: Q, userId: string, orgId: string): Promise<boolean> {
  const row = await db
    .selectFrom('org_blocks')
    .select('user_id')
    .where('user_id', '=', userId)
    .where('org_id', '=', orgId)
    .executeTakeFirst();
  return Boolean(row);
}

/** The customer has blocked the organization this business conversation is with. */
export async function businessClosed(
  db: Q,
  conversationId: string,
): Promise<{ customerId: string; orgId: string; orgName: string } | null> {
  const row = await db
    .selectFrom('business_threads as t')
    .innerJoin('org_blocks as b', (j) =>
      j.onRef('b.user_id', '=', 't.customer_id').onRef('b.org_id', '=', 't.org_id'),
    )
    .innerJoin('organizations as o', 'o.id', 't.org_id')
    .select(['t.customer_id', 't.org_id', 'o.name'])
    .where('t.conversation_id', '=', conversationId)
    .executeTakeFirst();
  return row?.customer_id
    ? { customerId: row.customer_id, orgId: row.org_id, orgName: row.name }
    : null;
}

export async function assertCanWrite(
  ctx: AppContext,
  conversationId: string,
  userId: string,
): Promise<void> {
  const conversation = await ctx.db
    .selectFrom('conversations')
    .select(['kind'])
    .where('id', '=', conversationId)
    .executeTakeFirst();
  if (!conversation) return;
  if (conversation.kind === 'direct') {
    const other = await ctx.db
      .selectFrom('participants')
      .select('user_id')
      .where('conversation_id', '=', conversationId)
      .where('user_id', '<>', userId)
      .executeTakeFirst();
    if (other && (await isBlockedEitherWay(ctx.db, userId, other.user_id)))
      throw forbidden('You can’t message this person.');
    return;
  }
  if (conversation.kind === 'business') {
    const closed = await businessClosed(ctx.db, conversationId);
    if (!closed) return;
    if (closed.customerId === userId)
      throw new AppError(
        403,
        'org_blocked',
        `You blocked ${closed.orgName}. Unblock it to write to it again.`,
      );
    throw new AppError(403, 'conversation_closed', 'The customer closed this conversation.');
  }
}
