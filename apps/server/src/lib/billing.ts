/**
 * Billing (PRD §84, R25): Pro for a person, Business for an organization, bought with Stripe
 * Checkout and managed in Stripe's customer portal (the card, invoices, cancelling). Stripe's
 * webhook says where each subscription stands, and the plan follows it: on while it's paid (or a
 * failed payment is being tried again), off once it ends. A lower plan never takes anything away
 * (lib/plans.ts): it only stops new additions. An operator's plan (Enterprise, say) is left alone.
 */
import {
  BILLED_PLANS,
  BILLING_INTERVALS,
  type BilledPlan,
  type BillingInterval,
  type BillingView,
  fromLookupKey,
  isPaying,
  PLAN_NAMES,
  type PriceView,
  priceLookupKey,
  type SubscriptionView,
} from '@caishy/core';
import type { AppContext } from '../context';
import { audit } from './audit';
import { AppError } from './errors';
import { stripe } from './stripe';

/** Who pays: a person for themselves, or an organization. */
export type Payer = { userId: string } | { orgId: string };
const payerKey = (p: Payer) => ('userId' in p ? `user:${p.userId}` : `org:${p.orgId}`);
/** What each kind of payer can buy: Pro for a person, Business for an organization. */
export const planFor = (p: Payer): BilledPlan => ('userId' in p ? 'pro' : 'business');

/** Plans can be bought here: Stripe is set up, and its webhook can reach this server. */
export const billingEnabled = (ctx: AppContext) =>
  Boolean(ctx.config.STRIPE_SECRET_KEY && ctx.config.STRIPE_WEBHOOK_SECRET);

interface StripePrice {
  id: string;
  lookup_key: string | null;
  unit_amount: number | null;
  currency: string;
  active: boolean;
  recurring: { interval: string } | null;
}
export interface StripeSubscription {
  id: string;
  customer: string;
  status: string;
  cancel_at_period_end: boolean;
  current_period_end: number | null;
  items: { data: Array<{ price: { lookup_key: string | null } }> };
}

const PRICES_FOR_MS = 10 * 60_000;
const prices = new WeakMap<AppContext, { at: number; byKey: Map<string, StripePrice> }>();

/** Caishy's prices in Stripe, by lookup key, asked again every ten minutes. */
async function stripePrices(ctx: AppContext): Promise<Map<string, StripePrice>> {
  const s = stripe(ctx);
  if (!s) return new Map();
  const held = prices.get(ctx);
  if (held && ctx.now().getTime() - held.at < PRICES_FOR_MS) return held.byKey;
  const lookup_keys = BILLED_PLANS.flatMap((p) =>
    BILLING_INTERVALS.map((i) => priceLookupKey(p, i)),
  );
  const list = await s.get<{ data: StripePrice[] }>('/v1/prices', {
    lookup_keys,
    active: true,
    limit: 10,
  });
  const byKey = new Map<string, StripePrice>();
  for (const p of list.data)
    if (p.active && p.lookup_key && p.unit_amount != null && fromLookupKey(p.lookup_key))
      byKey.set(p.lookup_key, p);
  prices.set(ctx, { at: ctx.now().getTime(), byKey });
  return byKey;
}

async function priceViews(ctx: AppContext, plan: BilledPlan): Promise<PriceView[]> {
  const byKey = await stripePrices(ctx);
  return BILLING_INTERVALS.flatMap((interval) => {
    const p = byKey.get(priceLookupKey(plan, interval));
    return p ? [{ plan, interval, amount: p.unit_amount ?? 0, currency: p.currency }] : [];
  });
}

function customerOf(ctx: AppContext, payer: Payer) {
  return ctx.db
    .selectFrom('billing_customers')
    .selectAll()
    .$if('userId' in payer, (q) => q.where('user_id', '=', (payer as { userId: string }).userId))
    .$if('orgId' in payer, (q) => q.where('org_id', '=', (payer as { orgId: string }).orgId))
    .executeTakeFirst();
}

/** The subscription paying for the payer's plan now, if any. */
async function payingSubscription(ctx: AppContext, payer: Payer) {
  const customer = await customerOf(ctx, payer);
  if (!customer) return undefined;
  const subs = await ctx.db
    .selectFrom('billing_subscriptions')
    .selectAll()
    .where('customer_id', '=', customer.id)
    .where('plan', '=', planFor(payer))
    .orderBy('updated_at', 'desc')
    .execute();
  return subs.find((s) => isPaying(s.status));
}

/** What the payer sees of billing: what can be bought, and what they pay for now. */
export async function billingView(
  ctx: AppContext,
  payer: Payer,
  opts: { unavailable?: string | null } = {},
): Promise<BillingView> {
  const enabled = billingEnabled(ctx);
  // Stripe unreachable for a moment: nothing to buy, never an error on the plan page.
  const offered = enabled ? await priceViews(ctx, planFor(payer)).catch(() => []) : [];
  const [customer, sub] = await Promise.all([
    customerOf(ctx, payer),
    payingSubscription(ctx, payer),
  ]);
  const subscription: SubscriptionView | null = sub
    ? {
        plan: sub.plan,
        interval: sub.interval,
        status: sub.status,
        periodEnd: sub.current_period_end?.toISOString() ?? null,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
      }
    : null;
  return {
    enabled: enabled && offered.length > 0,
    prices: offered,
    subscription,
    canManage: enabled && Boolean(customer),
    unavailable: opts.unavailable ?? null,
  };
}

/** The payer's customer in Stripe: made the first time they buy something, then kept. */
async function customerFor(
  ctx: AppContext,
  payer: Payer,
  who: { name: string; email: string | null },
): Promise<string> {
  const held = await customerOf(ctx, payer);
  if (held) return held.id;
  const s = stripe(ctx);
  if (!s) throw unavailable(planFor(payer));
  const made = await s.post<{ id: string }>(
    '/v1/customers',
    {
      name: who.name,
      email: who.email ?? undefined,
      metadata:
        'userId' in payer ? { caishy_user_id: payer.userId } : { caishy_org_id: payer.orgId },
    },
    // Asked twice at once (two taps), Stripe makes one customer.
    `caishy-customer-${payerKey(payer)}`,
  );
  await ctx.db
    .insertInto('billing_customers')
    .values({
      id: made.id,
      user_id: 'userId' in payer ? payer.userId : null,
      org_id: 'orgId' in payer ? payer.orgId : null,
    })
    .onConflict((oc) => oc.doNothing())
    .execute();
  return (await customerOf(ctx, payer))?.id ?? made.id;
}

const unavailable = (plan: BilledPlan) =>
  new AppError(503, 'billing_unavailable', `${PLAN_NAMES[plan]} can’t be bought right now.`);

/** Checkout for the payer's plan: the page on Stripe to pay on, and back here after. */
export async function startCheckout(
  ctx: AppContext,
  payer: Payer,
  who: { name: string; email: string | null },
  interval: BillingInterval,
  returnPath: string,
): Promise<string> {
  const plan = planFor(payer);
  const s = stripe(ctx);
  if (!s || !billingEnabled(ctx)) throw unavailable(plan);
  const price = (await stripePrices(ctx).catch(() => new Map<string, StripePrice>())).get(
    priceLookupKey(plan, interval),
  );
  if (!price) throw unavailable(plan);
  // Paying already: it's changed in the portal, never bought twice.
  if (await payingSubscription(ctx, payer))
    throw new AppError(
      409,
      'already_subscribed',
      `${PLAN_NAMES[plan]} is on already: change it from Manage billing.`,
    );
  const customer = await customerFor(ctx, payer, who);
  const back = `${ctx.config.PUBLIC_URL}${returnPath}`;
  const session = await s.post<{ id: string; url: string }>('/v1/checkout/sessions', {
    mode: 'subscription',
    customer,
    line_items: [{ price: price.id, quantity: 1 }],
    success_url: `${back}?billing=done`,
    cancel_url: `${back}?billing=cancelled`,
    client_reference_id: 'userId' in payer ? payer.userId : payer.orgId,
    subscription_data: { metadata: { caishy_payer: payerKey(payer) } },
    allow_promotion_codes: true,
  });
  return session.url;
}

/** Stripe's portal for the payer: their card, invoices, and cancelling. */
export async function openPortal(ctx: AppContext, payer: Payer, returnPath: string) {
  const s = stripe(ctx);
  if (!s || !billingEnabled(ctx)) throw unavailable(planFor(payer));
  const customer = await customerOf(ctx, payer);
  if (!customer) throw new AppError(404, 'not_found', 'There’s nothing paid for here yet.');
  const session = await s.post<{ url: string }>('/v1/billing_portal/sessions', {
    customer: customer.id,
    return_url: `${ctx.config.PUBLIC_URL}${returnPath}`,
    configuration: ctx.config.STRIPE_PORTAL_CONFIGURATION,
  });
  return session.url;
}

/**
 * Where a subscription stands now, as Stripe says: kept, and the plan of whoever it's for set to
 * follow. A subscription to a price that isn't Caishy's, or for a customer Caishy didn't make,
 * changes nothing.
 */
export async function applySubscription(ctx: AppContext, sub: StripeSubscription): Promise<void> {
  const what = fromLookupKey(sub.items?.data?.[0]?.price?.lookup_key);
  if (!what) return;
  const customer = await ctx.db
    .selectFrom('billing_customers')
    .selectAll()
    .where('id', '=', sub.customer)
    .executeTakeFirst();
  if (!customer) return;
  const row = {
    customer_id: customer.id,
    plan: what.plan,
    interval: what.interval,
    status: sub.status,
    current_period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000) : null,
    cancel_at_period_end: Boolean(sub.cancel_at_period_end),
    updated_at: ctx.now(),
  };
  await ctx.db
    .insertInto('billing_subscriptions')
    .values({ id: sub.id, ...row })
    .onConflict((oc) => oc.column('id').doUpdateSet(row))
    .execute();
  await settlePlan(ctx, customer);
}

/** The plan follows what's paid for: on while a subscription pays for it, off when none does. */
async function settlePlan(
  ctx: AppContext,
  customer: { id: string; user_id: string | null; org_id: string | null },
) {
  const subs = await ctx.db
    .selectFrom('billing_subscriptions')
    .select(['plan', 'status'])
    .where('customer_id', '=', customer.id)
    .execute();
  if (customer.user_id) {
    const paid = subs.some((s) => s.plan === 'pro' && isPaying(s.status));
    const user = await ctx.db
      .selectFrom('users')
      .select('plan')
      .where('id', '=', customer.user_id)
      .executeTakeFirst();
    if (!user) return;
    // Pro on over Personal only, and off only from Pro: an operator's plan stays.
    const to =
      paid && user.plan === 'personal' ? 'pro' : !paid && user.plan === 'pro' ? 'personal' : null;
    if (!to) return;
    await ctx.db
      .updateTable('users')
      .set({ plan: to, updated_at: ctx.now() })
      .where('id', '=', customer.user_id)
      .execute();
    await audit(ctx.db, {
      actorId: null,
      action: 'plan.changed',
      target: customer.user_id,
      metadata: { of: 'person', from: user.plan, to, via: 'billing' },
    });
    await ctx.bus.publish([customer.user_id], {
      type: 'me.updated',
      data: { id: customer.user_id },
    });
  } else if (customer.org_id) {
    const paid = subs.some((s) => s.plan === 'business' && isPaying(s.status));
    const org = await ctx.db
      .selectFrom('organizations')
      .select('plan')
      .where('id', '=', customer.org_id)
      .executeTakeFirst();
    if (!org) return;
    const to =
      paid && org.plan === 'free' ? 'business' : !paid && org.plan === 'business' ? 'free' : null;
    if (!to) return;
    await ctx.db
      .updateTable('organizations')
      .set({ plan: to, updated_at: ctx.now() })
      .where('id', '=', customer.org_id)
      .execute();
    await audit(ctx.db, {
      actorId: null,
      action: 'plan.changed',
      target: customer.org_id,
      metadata: { of: 'organization', from: org.plan, to, via: 'billing' },
    });
  }
}

interface StripeEvent {
  id: string;
  type: string;
  data: { object: { id?: string; mode?: string; subscription?: string | null } };
}

/**
 * One of Stripe's events, once. Whatever it says about a subscription, what's kept is what Stripe
 * says of it now: events can come late, or out of order.
 */
export async function handleStripeEvent(ctx: AppContext, event: StripeEvent): Promise<void> {
  const seen = await ctx.db
    .selectFrom('billing_events')
    .select('id')
    .where('id', '=', event.id)
    .executeTakeFirst();
  if (seen) return;
  const o = event.data?.object ?? {};
  const subscriptionId =
    event.type === 'checkout.session.completed'
      ? o.mode === 'subscription'
        ? o.subscription
        : null
      : event.type.startsWith('customer.subscription.')
        ? o.id
        : null;
  if (subscriptionId) {
    const s = stripe(ctx);
    if (!s) return;
    await applySubscription(
      ctx,
      await s.get<StripeSubscription>(`/v1/subscriptions/${subscriptionId}`),
    );
  }
  // Only once it's handled: one that failed is sent again, and handled then.
  await ctx.db
    .insertInto('billing_events')
    .values({ id: event.id, type: event.type })
    .onConflict((oc) => oc.column('id').doNothing())
    .execute();
}

/** An account being deleted stops paying: its subscriptions end now. */
export async function endSubscriptionsOf(ctx: AppContext, payer: Payer): Promise<void> {
  const customer = await customerOf(ctx, payer);
  if (!customer) return;
  const s = stripe(ctx);
  const subs = await ctx.db
    .selectFrom('billing_subscriptions')
    .select(['id', 'status'])
    .where('customer_id', '=', customer.id)
    .execute();
  const paying = subs.filter((x) => isPaying(x.status));
  if (!paying.length) return;
  if (!s) throw unavailable(planFor(payer));
  for (const sub of paying) {
    const ended = await s.del<StripeSubscription>(`/v1/subscriptions/${sub.id}`);
    await applySubscription(ctx, ended);
  }
}
