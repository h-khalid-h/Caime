/**
 * Whether an organization takes cards through its own account (R65), apart from the rest of
 * lib/checkout.ts so the message path (`payToFor`) reads it without importing the checkout.
 */
import type { AppContext } from '../context';

/** Whether this Caime can connect organizations' accounts at all. */
export function checkoutAvailable(ctx: AppContext): boolean {
  return Boolean(ctx.config.STRIPE_SECRET_KEY && ctx.config.STRIPE_CONNECT_CLIENT_ID);
}

/** The organization's connected account, when it can take payments now. */
export async function checkoutAccountOf(
  ctx: AppContext,
  orgId: string,
): Promise<{ accountId: string } | null> {
  if (!checkoutAvailable(ctx)) return null;
  const row = await ctx.db
    .selectFrom('org_checkout')
    .select(['account_id', 'charges_enabled'])
    .where('org_id', '=', orgId)
    .executeTakeFirst();
  return row?.charges_enabled ? { accountId: row.account_id } : null;
}
