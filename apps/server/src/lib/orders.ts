/**
 * An organization's orders (R60), for its team's Orders view and its apps: the Order cards in
 * its customer conversations, newest first, each as the card stands. The order lives in its
 * conversation, where the team moves it; nothing here changes one.
 */
import type { OrgOrderView } from '@caime/core/api';
import { sql } from 'kysely';
import type { AppContext } from '../context';

const MAX_ORDERS = 200;

export async function orgOrders(
  ctx: AppContext,
  orgId: string,
  opts: { limit?: number } = {},
): Promise<OrgOrderView[]> {
  const rows = await ctx.db
    .selectFrom('messages as m')
    .innerJoin('business_threads as t', 't.conversation_id', 'm.conversation_id')
    .leftJoin('users as c', 'c.id', 't.customer_id')
    .select([
      'm.id',
      'm.conversation_id',
      'm.payload',
      'm.created_at',
      'c.id as customer_id',
      'c.display_name',
    ])
    .where('t.org_id', '=', orgId)
    .where('m.kind', '=', 'kit')
    .where('m.deleted_at', 'is', null)
    .where(sql`m.payload->>'kit'`, '=', 'order_status')
    .orderBy('m.created_at', 'desc')
    .limit(opts.limit ?? MAX_ORDERS)
    .execute();
  return rows.map((row) => {
    const payload = (row.payload ?? {}) as {
      state?: string;
      fields?: { reference?: unknown; summary?: unknown; amount?: unknown };
    };
    const amount = payload.fields?.amount as { value?: unknown; currency?: unknown } | undefined;
    return {
      messageId: row.id,
      conversationId: row.conversation_id,
      customer: row.customer_id
        ? { id: row.customer_id, displayName: row.display_name ?? '' }
        : null,
      reference: typeof payload.fields?.reference === 'string' ? payload.fields.reference : null,
      summary: typeof payload.fields?.summary === 'string' ? payload.fields.summary : null,
      amount:
        amount && typeof amount.value === 'number' && typeof amount.currency === 'string'
          ? { value: amount.value, currency: amount.currency }
          : null,
      state: payload.state ?? 'placed',
      createdAt: row.created_at.toISOString(),
    };
  });
}
