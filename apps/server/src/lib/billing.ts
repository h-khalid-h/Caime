/**
 * Billing (PRD §84, R25): Pro for a person, Business for an organization, bought with Stripe
 * Checkout and managed in Stripe's customer portal (the card, invoices, cancelling). Stripe's
 * webhook says where each subscription stands, and the plan follows it: on while it's paid (or a
 * failed payment is being tried again), off once it ends. A lower plan never takes anything away
 * (lib/plans.ts): it only stops new additions. Billing changes only a plan it set (or the one
 * everyone starts on): an operator's plan stays, whatever Stripe says.
 *
 * What's kept is always what Stripe says now, one subscription at a time: events can come late,
 * out of order, twice, or two at once. Someone deleted, or an organization that closes, stops
 * paying at once, whether or not Caime has heard of every subscription yet.
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
} from '@caime/core';
import { tr } from '@caime/core/i18n';
import { type Kysely, sql, type Transaction } from 'kysely';
import type { AppContext } from '../context';
import type { Database } from '../db/schema';
import { audit } from './audit';
import { AppError } from './errors';
import { enqueue, registerJob, registerPeriodic } from './jobs';
import { liveKey, missingAtStripe, StripeError, stripe } from './stripe';

type Q = Kysely<Database> | Transaction<Database>;

/** Who pays: a person for themselves, or an organization. */
export type Payer = { userId: string } | { orgId: string };
const payerKey = (p: Payer) => ('userId' in p ? `user:${p.userId}` : `org:${p.orgId}`);
/** What each kind of payer can buy: Pro for a person, Business for an organization. */
export const planFor = (p: Payer): BilledPlan => ('userId' in p ? 'pro' : 'business');
/** The plan everyone starts on, and goes back to once nothing pays for more. */
const basePlan = (p: Payer) => ('userId' in p ? 'personal' : 'free');

/** Plans can be bought here: Stripe is set up, and its webhook can reach this server. */
export const billingEnabled = (ctx: AppContext) =>
  Boolean(ctx.config.STRIPE_SECRET_KEY && ctx.config.STRIPE_WEBHOOK_SECRET);

/** Test or live, as the key in use is: it sees only customers of its own kind. */
const livemode = (ctx: AppContext) => liveKey(ctx.config.STRIPE_SECRET_KEY);

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
  metadata?: Record<string, string>;
  items: {
    data: Array<{
      price: {
        id?: string;
        lookup_key: string | null;
        unit_amount?: number | null;
        currency?: string;
        recurring?: { interval: string } | null;
      };
    }>;
  };
}

const PRICES_FOR_MS = 10 * 60_000;
const prices = new WeakMap<AppContext, { at: number; byKey: Map<string, StripePrice> }>();

/** Caime's prices in Stripe, by lookup key, asked again every ten minutes. */
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

/**
 * The prices the public site shows (Pro's and Business's, by month and by year), or null where
 * billing isn't connected or Stripe is away: the page then sends people to the app for them.
 */
export async function publicPrices(ctx: AppContext): Promise<PriceView[] | null> {
  try {
    const views = (await Promise.all(BILLED_PLANS.map((p) => priceViews(ctx, p)))).flat();
    return views.length ? views : null;
  } catch {
    return null;
  }
}

function customerOf(ctx: AppContext, payer: Payer, db: Q = ctx.db) {
  return db
    .selectFrom('billing_customers')
    .selectAll()
    .where('livemode', '=', livemode(ctx))
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

/** Whether the payer pays for its plan through Stripe now. */
export async function paysThroughBilling(ctx: AppContext, payer: Payer): Promise<boolean> {
  return Boolean(await payingSubscription(ctx, payer));
}

/** The payer's plan now, and where it came from. */
function planNow(payer: Payer, db: Q) {
  return 'userId' in payer
    ? db
        .selectFrom('users')
        .select(['plan', 'plan_source'])
        .where('id', '=', payer.userId)
        .executeTakeFirst()
    : db
        .selectFrom('organizations')
        .select(['plan', 'plan_source'])
        .where('id', '=', payer.orgId)
        .executeTakeFirst();
}

/** An operator's plan: nothing billing sells can be bought over it. */
const operatorsPlan = (p: Payer, now: { plan: string; plan_source: string } | undefined) =>
  Boolean(now && now.plan !== basePlan(p) && now.plan_source === 'operator');

/** What the payer sees of billing: what can be bought, and what they pay for now. */
export async function billingView(
  ctx: AppContext,
  payer: Payer,
  opts: { unavailable?: string | null } = {},
): Promise<BillingView> {
  const enabled = billingEnabled(ctx);
  // Stripe unreachable for a moment: nothing to buy, never an error on the plan page.
  const offered = enabled ? await priceViews(ctx, planFor(payer)).catch(() => []) : [];
  const [customer, sub, now] = await Promise.all([
    customerOf(ctx, payer),
    payingSubscription(ctx, payer),
    planNow(payer, ctx.db),
  ]);
  const subscription: SubscriptionView | null = sub
    ? {
        plan: sub.plan,
        interval: sub.interval,
        status: sub.status,
        periodEnd: sub.current_period_end?.toISOString() ?? null,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        amount: sub.amount,
        currency: sub.currency,
      }
    : null;
  // On more than the plan everyone starts on, whoever put them there: nothing to buy over it.
  const included =
    !sub && now && now.plan !== basePlan(payer)
      ? 'userId' in payer
        ? `You’re on ${PLAN_NAMES[now.plan as keyof typeof PLAN_NAMES]} already.`
        : `It’s on ${PLAN_NAMES[now.plan as keyof typeof PLAN_NAMES]} already.`
      : null;
  return {
    enabled: enabled && offered.length > 0,
    prices: offered,
    subscription,
    canManage: enabled && Boolean(customer),
    unavailable: opts.unavailable ?? included,
  };
}

/** Who a payer is to Stripe: their name, and the email its receipts and notices go to. */
export interface PayerContact {
  name: string;
  email: string | null;
}

/**
 * The payer's customer in Stripe: made the first time they buy something, then kept. `after` is
 * the one Stripe no longer has, when a new one replaces it.
 */
async function customerFor(
  ctx: AppContext,
  payer: Payer,
  who: PayerContact,
  after?: string,
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
    // Asked twice at once (two taps), Stripe makes one customer; a new one once it's gone.
    `caime-customer-${livemode(ctx) ? 'live' : 'test'}-${payerKey(payer)}${after ? `-after-${after}` : ''}`,
  );
  await ctx.db
    .insertInto('billing_customers')
    .values({
      id: made.id,
      livemode: livemode(ctx),
      user_id: 'userId' in payer ? payer.userId : null,
      org_id: 'orgId' in payer ? payer.orgId : null,
    })
    .onConflict((oc) => oc.doNothing())
    .execute();
  return (await customerOf(ctx, payer))?.id ?? made.id;
}

/**
 * The customer to use now: Stripe's still (one deleted in its dashboard is forgotten here, and a
 * new one made), with the name and email it should have today.
 */
async function currentCustomer(ctx: AppContext, payer: Payer, who: PayerContact) {
  const s = stripe(ctx);
  if (!s) throw unavailable(planFor(payer));
  const id = await customerFor(ctx, payer, who);
  try {
    await s.post(`/v1/customers/${id}`, { name: who.name, email: who.email ?? '' });
    return id;
  } catch (e) {
    if (!missingAtStripe(e)) throw e;
    await ctx.db.deleteFrom('billing_customers').where('id', '=', id).execute();
    await settlePayer(ctx, payer);
    return customerFor(ctx, payer, who, id);
  }
}

const unavailable = (plan: BilledPlan) =>
  new AppError(
    503,
    'billing_unavailable',
    tr('{plan} can’t be bought right now.', { plan: PLAN_NAMES[plan] }),
  );

/**
 * What Stripe refused, said to whoever asked (the person buying, or the organization's owner or
 * admin: theirs to sort out, or to tell the operator), and logged with Stripe's own words for
 * the operator. Anything that isn't Stripe's refusal is what it was.
 */
export function refusedByStripe(
  log: { error: (obj: object, msg: string) => void },
  e: unknown,
  lead: string,
): unknown {
  if (!(e instanceof StripeError)) return e;
  log.error(
    { stripe: { status: e.status, type: e.type, code: e.code, message: e.message } },
    'stripe refused',
  );
  return new AppError(
    503,
    'billing_unavailable',
    tr('{lead}: Stripe said “{message}”.', { lead, message: e.message }),
  );
}

/** Checkout for the payer's plan: the page on Stripe to pay on, and back here after. */
export async function startCheckout(
  ctx: AppContext,
  payer: Payer,
  who: PayerContact,
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
  if (operatorsPlan(payer, await planNow(payer, ctx.db)))
    throw new AppError(
      409,
      'plan_included',
      tr('{plan} is part of this plan already.', { plan: PLAN_NAMES[plan] }),
    );
  const customer = await currentCustomer(ctx, payer, who);
  // Paying already, perhaps before Stripe's word of it has come: never bought twice. What Stripe
  // says of the customer's subscriptions is taken now.
  const theirs = await s.get<{ data: StripeSubscription[] }>('/v1/subscriptions', {
    customer,
    status: 'all',
    limit: 20,
  });
  for (const sub of theirs.data) await syncSubscription(ctx, sub.id, sub);
  if (await payingSubscription(ctx, payer))
    throw new AppError(
      409,
      'already_subscribed',
      tr('{plan} is on already: change it from Manage billing.', { plan: PLAN_NAMES[plan] }),
    );
  // Nothing paying for it, yet more than the plan everyone starts on (whoever set it): nothing
  // is sold over it.
  await settlePayer(ctx, payer);
  const now = await planNow(payer, ctx.db);
  if (now && now.plan !== basePlan(payer))
    throw new AppError(
      409,
      'plan_included',
      tr('{plan} is part of this plan already.', { plan: PLAN_NAMES[plan] }),
    );
  const back = `${ctx.config.PUBLIC_URL}${returnPath}`;
  // Only the newest Checkout can be paid: any other still open for them closes first. One
  // payer's are made one at a time, so two taps at once leave one open, never two.
  return ctx.db.transaction().execute(async (trx) => {
    await sql`select pg_advisory_xact_lock(hashtext(${`billing-payer:${payerKey(payer)}`}))`.execute(
      trx,
    );
    const open = await s
      .get<{ data: Array<{ id: string }> }>('/v1/checkout/sessions', {
        customer,
        status: 'open',
        limit: 20,
      })
      .catch(() => ({ data: [] }));
    for (const cs of open.data)
      await s.post(`/v1/checkout/sessions/${cs.id}/expire`).catch(() => {});
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
  });
}

/** Stripe's portal for the payer: their card, invoices, and cancelling. */
export async function openPortal(
  ctx: AppContext,
  payer: Payer,
  who: PayerContact,
  returnPath: string,
) {
  const s = stripe(ctx);
  if (!s || !billingEnabled(ctx)) throw unavailable(planFor(payer));
  if (!(await customerOf(ctx, payer)))
    throw new AppError(404, 'not_found', tr('There’s nothing paid for here yet.'));
  const customer = await currentCustomer(ctx, payer, who);
  const session = await s.post<{ url: string }>('/v1/billing_portal/sessions', {
    customer,
    return_url: `${ctx.config.PUBLIC_URL}${returnPath}`,
    configuration: ctx.config.STRIPE_PORTAL_CONFIGURATION,
  });
  return session.url;
}

/**
 * Which of Caime's plans a subscription is, and how often it's paid: from its price's lookup
 * key; or, once the key has moved to a new price (people already paying keep theirs), from what
 * Caime already knew of it or put on it at Checkout. Anything else Stripe sells isn't Caime's.
 */
function planOfSubscription(
  sub: StripeSubscription,
  held: { plan: BilledPlan; interval: BillingInterval } | undefined,
): { plan: BilledPlan; interval: BillingInterval } | null {
  const price = sub.items?.data?.[0]?.price;
  const byKey = fromLookupKey(price?.lookup_key);
  if (byKey) return byKey;
  const every = price?.recurring?.interval;
  const interval: BillingInterval | undefined =
    every === 'month' || every === 'year' ? every : held?.interval;
  if (!interval) return null;
  if (held) return { plan: held.plan, interval };
  const payer = sub.metadata?.caishy_payer ?? '';
  if (payer.startsWith('user:')) return { plan: 'pro', interval };
  if (payer.startsWith('org:')) return { plan: 'business', interval };
  return null;
}

const CLOSE = 'billing.close';

/**
 * Where a subscription stands now, as Stripe says: kept, and the plan of whoever it's for set to
 * follow. One for a customer Caime didn't make changes nothing; one for someone who's gone ends.
 * Returns who to tell their plan changed, once it's committed.
 */
async function applySubscription(
  ctx: AppContext,
  sub: StripeSubscription,
  db: Q,
): Promise<string[]> {
  const customer = await db
    .selectFrom('billing_customers')
    .selectAll()
    .where('id', '=', sub.customer)
    .executeTakeFirst();
  if (!customer) return [];
  // An organization that has closed is gone as much as a deleted account (none reopens).
  const closedOrg = customer.org_id
    ? Boolean(
        (
          await db
            .selectFrom('organizations')
            .select('archived_at')
            .where('id', '=', customer.org_id)
            .executeTakeFirst()
        )?.archived_at,
      )
    : false;
  const held = await db
    .selectFrom('billing_subscriptions')
    .select(['plan', 'interval'])
    .where('id', '=', sub.id)
    .executeTakeFirst();
  const what = planOfSubscription(sub, held);
  if (!what) return [];
  const price = sub.items?.data?.[0]?.price;
  const row = {
    customer_id: customer.id,
    plan: what.plan,
    interval: what.interval,
    status: sub.status,
    amount: price?.unit_amount ?? null,
    currency: price?.currency ?? null,
    current_period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000) : null,
    cancel_at_period_end: Boolean(sub.cancel_at_period_end),
    updated_at: ctx.now(),
  };
  await db
    .insertInto('billing_subscriptions')
    .values({ id: sub.id, ...row })
    .onConflict((oc) => oc.column('id').doUpdateSet(row))
    .execute();
  // For someone deleted, or an organization closed: it stops now (a job, in case Stripe is away).
  if ((!customer.user_id && !customer.org_id) || closedOrg) {
    if (isPaying(sub.status))
      await enqueue(
        ctx,
        CLOSE,
        { customerId: customer.id },
        { dedupeKey: `${CLOSE}:${customer.id}`, maxAttempts: 20 },
      );
    return [];
  }
  return settlePlan(
    ctx,
    db,
    customer.user_id ? { userId: customer.user_id } : { orgId: customer.org_id as string },
  );
}

/** A subscription that has ended stays ended: what Stripe said of it once is still true. */
const ENDED = new Set(['canceled', 'incomplete_expired']);

/**
 * What Stripe says of one subscription now, applied one at a time for each: it's asked while no
 * other delivery for it is being applied, so two at once never write the older state last.
 * `listed` is what a listing of Stripe's said of it a moment ago: taken as it is only once it
 * has ended (nothing about it changes after that); otherwise asked again, in turn.
 */
export async function syncSubscription(
  ctx: AppContext,
  id: string,
  listed?: StripeSubscription,
): Promise<void> {
  const s = stripe(ctx);
  if (!s) return;
  const told = await ctx.db.transaction().execute(async (trx) => {
    await sql`select pg_advisory_xact_lock(hashtext(${`billing-sub:${id}`}))`.execute(trx);
    let sub: StripeSubscription;
    try {
      sub =
        listed && ENDED.has(listed.status)
          ? listed
          : await s.get<StripeSubscription>(`/v1/subscriptions/${id}`);
    } catch (e) {
      // Stripe hasn't got it (deleted there, or of the other mode): it pays for nothing.
      if (!missingAtStripe(e)) throw e;
      const gone = await trx
        .updateTable('billing_subscriptions')
        .set({ status: 'canceled', updated_at: ctx.now() })
        .where('id', '=', id)
        .returning('customer_id')
        .executeTakeFirst();
      const customer = gone
        ? await trx
            .selectFrom('billing_customers')
            .selectAll()
            .where('id', '=', gone.customer_id)
            .executeTakeFirst()
        : undefined;
      if (!customer || (!customer.user_id && !customer.org_id)) return [];
      return settlePlan(
        ctx,
        trx,
        customer.user_id ? { userId: customer.user_id } : { orgId: customer.org_id as string },
      );
    }
    return applySubscription(ctx, sub, trx);
  });
  for (const userId of told)
    await ctx.bus.publish([userId], { type: 'me.updated', data: { id: userId } });
}

/**
 * The plan follows what's paid for: on over the one everyone starts on while a subscription of
 * this mode pays for it, back to that once none does, and only if billing turned it on. An
 * operator's plan stays (it's never the one everyone starts on: setting that hands it back).
 * Returns who to tell (a person whose plan changed).
 */
async function settlePlan(ctx: AppContext, db: Q, payer: Payer): Promise<string[]> {
  const subs = await db
    .selectFrom('billing_subscriptions as s')
    .innerJoin('billing_customers as c', 'c.id', 's.customer_id')
    .select(['s.plan', 's.status'])
    .where('c.livemode', '=', livemode(ctx))
    .$if('userId' in payer, (q) => q.where('c.user_id', '=', (payer as { userId: string }).userId))
    .$if('orgId' in payer, (q) => q.where('c.org_id', '=', (payer as { orgId: string }).orgId))
    .execute();
  const sells = planFor(payer);
  const paid = subs.some((s) => s.plan === sells && isPaying(s.status));
  const now = await planNow(payer, db);
  if (!now) return [];
  const base = basePlan(payer);
  const to =
    paid && now.plan === base
      ? ({ plan: sells, plan_source: 'billing' } as const)
      : !paid && now.plan_source === 'billing'
        ? ({ plan: base, plan_source: 'default' } as const)
        : null;
  if (!to) return [];
  if ('userId' in payer)
    await db
      .updateTable('users')
      .set({
        plan: to.plan as 'pro' | 'personal',
        plan_source: to.plan_source,
        updated_at: ctx.now(),
      })
      .where('id', '=', payer.userId)
      .execute();
  else
    await db
      .updateTable('organizations')
      .set({
        plan: to.plan as 'business' | 'free',
        plan_source: to.plan_source,
        updated_at: ctx.now(),
      })
      .where('id', '=', payer.orgId)
      .execute();
  await audit(db as Kysely<Database>, {
    actorId: null,
    action: 'plan.changed',
    target: 'userId' in payer ? payer.userId : payer.orgId,
    metadata: {
      of: 'userId' in payer ? 'person' : 'organization',
      from: now.plan,
      to: to.plan,
      via: 'billing',
    },
  });
  return 'userId' in payer ? [payer.userId] : [];
}

/** The plan settled again, from what's kept (a customer forgotten, say). */
async function settlePayer(ctx: AppContext, payer: Payer): Promise<void> {
  const told = await settlePlan(ctx, ctx.db, payer);
  for (const userId of told)
    await ctx.bus.publish([userId], { type: 'me.updated', data: { id: userId } });
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
    if (!stripe(ctx)) return;
    await syncSubscription(ctx, subscriptionId);
  }
  // Only once it's handled: one that failed is sent again, and handled then.
  await ctx.db
    .insertInto('billing_events')
    .values({ id: event.id, type: event.type })
    .onConflict((oc) => oc.column('id').doNothing())
    .execute();
}

/**
 * A customer ends: deleted at Stripe, which ends every subscription it has at once and removes the
 * card, whether or not Caime had heard of them.
 */
async function closeCustomer(ctx: AppContext, customerId: string): Promise<void> {
  const s = stripe(ctx);
  if (!s) throw new Error('Stripe isn’t set up to end this customer yet.');
  try {
    await s.del(`/v1/customers/${customerId}`);
  } catch (e) {
    if (!missingAtStripe(e)) throw e;
  }
  await ctx.db
    .updateTable('billing_subscriptions')
    .set({ status: 'canceled', updated_at: ctx.now() })
    .where('customer_id', '=', customerId)
    .where('status', 'not in', [...ENDED])
    .execute();
  await ctx.db
    .updateTable('billing_customers')
    .set({ closed_at: ctx.now() })
    .where('id', '=', customerId)
    .execute();
}

/**
 * Nothing is paid any more by an account being deleted, or an organization that closes. Tried at
 * once; if Stripe can't be reached, a job keeps trying, so deleting an account never waits on it.
 */
export async function endBillingOf(ctx: AppContext, payer: Payer): Promise<void> {
  const rows = await ctx.db
    .selectFrom('billing_customers')
    .select('id')
    .where('livemode', '=', livemode(ctx))
    .where('closed_at', 'is', null)
    .$if('userId' in payer, (q) => q.where('user_id', '=', (payer as { userId: string }).userId))
    .$if('orgId' in payer, (q) => q.where('org_id', '=', (payer as { orgId: string }).orgId))
    .execute();
  for (const { id } of rows)
    try {
      await closeCustomer(ctx, id);
    } catch {
      await enqueue(
        ctx,
        CLOSE,
        { customerId: id },
        { dedupeKey: `${CLOSE}:${id}`, maxAttempts: 20 },
      );
    }
}

const PAGE = 200;

/**
 * Every so often, every customer is checked against Stripe, and every plan billing set is settled
 * again: a webhook that never came can't leave a plan off that's paid for, or on that isn't, and
 * a key changed from test to live turns off what only the other mode paid for.
 */
export async function reconcileBilling(ctx: AppContext): Promise<void> {
  const s = stripe(ctx);
  if (!s) return;
  for (let after = ''; ; ) {
    const customers = await ctx.db
      .selectFrom('billing_customers as c')
      .leftJoin('organizations as o', 'o.id', 'c.org_id')
      .select(['c.id', 'c.user_id', 'c.org_id', 'o.archived_at'])
      .where('c.livemode', '=', livemode(ctx))
      .where('c.closed_at', 'is', null)
      .where('c.id', '>', after)
      .orderBy('c.id')
      .limit(PAGE)
      .execute();
    for (const { id, user_id, org_id, archived_at } of customers) {
      // Whoever it was for is gone, and it wasn't ended yet (Stripe was away): now, or next time.
      if ((!user_id && !org_id) || archived_at) {
        await closeCustomer(ctx, id).catch(() => {});
        continue;
      }
      const theirs = await s
        .get<{ data: StripeSubscription[] }>('/v1/subscriptions', {
          customer: id,
          status: 'all',
          limit: 100,
        })
        .catch((e) => (missingAtStripe(e) ? { data: [] } : null));
      // Stripe away for a moment: the next round.
      if (!theirs) continue;
      for (const sub of theirs.data) await syncSubscription(ctx, sub.id, sub).catch(() => {});
      // Any kept that Stripe didn't list (deleted there): asked for on its own, and ended.
      const listed = new Set(theirs.data.map((x) => x.id));
      const kept = await ctx.db
        .selectFrom('billing_subscriptions')
        .select('id')
        .where('customer_id', '=', id)
        .where('status', 'not in', [...ENDED])
        .execute();
      for (const k of kept)
        if (!listed.has(k.id)) await syncSubscription(ctx, k.id).catch(() => {});
    }
    if (customers.length < PAGE) break;
    after = customers.at(-1)?.id ?? after;
  }
  for (const table of ['users', 'organizations'] as const)
    for (let after = '00000000-0000-0000-0000-000000000000'; ; ) {
      const rows = await ctx.db
        .selectFrom(table)
        .select('id')
        .where('plan_source', '=', 'billing')
        .where('id', '>', after)
        .orderBy('id')
        .limit(PAGE)
        .execute();
      for (const { id } of rows)
        await settlePayer(ctx, table === 'users' ? { userId: id } : { orgId: id });
      if (rows.length < PAGE) break;
      after = rows.at(-1)?.id ?? after;
    }
}

/** Billing's background work: ending customers that couldn't be ended at once, and reconciling. */
export function registerBillingJobs(): void {
  registerJob(CLOSE, async (ctx, p) => closeCustomer(ctx, String(p.customerId)));
  registerPeriodic({ name: 'billing.reconcile', everyMs: 6 * 3_600_000, run: reconcileBilling });
}
