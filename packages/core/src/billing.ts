/**
 * Billing (PRD §84, R25): Pro for a person and Business for an organization, bought through
 * Stripe Checkout and managed in Stripe's customer portal. What each plan includes is in
 * ./plans; this is what can be bought, and how it's shown. Prices live in Stripe, found by their
 * lookup keys, so changing one there changes it here.
 */

export const BILLING_INTERVALS = ['month', 'year'] as const;
export type BillingInterval = (typeof BILLING_INTERVALS)[number];

/** What can be bought: Pro for a person, Business for an organization. */
export const BILLED_PLANS = ['pro', 'business'] as const;
export type BilledPlan = (typeof BILLED_PLANS)[number];

/** A price's lookup key in Stripe: prices are found by these, never by id. */
export const priceLookupKey = (plan: BilledPlan, interval: BillingInterval) =>
  `caishy_${plan}_${interval}`;

/** Which plan and interval a lookup key is for, or null for a price that isn't Caishy's. */
export function fromLookupKey(
  key: string | null | undefined,
): { plan: BilledPlan; interval: BillingInterval } | null {
  const m = /^caishy_(pro|business)_(month|year)$/.exec(key ?? '');
  return m ? { plan: m[1] as BilledPlan, interval: m[2] as BillingInterval } : null;
}

/**
 * Stripe's subscription statuses that keep the plan on: paid, in a trial, or a payment that
 * failed and is being tried again. Anything else (cancelled, unpaid, never completed) doesn't.
 */
export const PAYING_STATUSES = ['active', 'trialing', 'past_due'] as const;
export const isPaying = (status: string) => (PAYING_STATUSES as readonly string[]).includes(status);

/** A price as the app shows it: its amount in the currency's smallest unit. */
export interface PriceView {
  plan: BilledPlan;
  interval: BillingInterval;
  amount: number;
  currency: string;
}

/** Where a person's or an organization's subscription stands. */
export interface SubscriptionView {
  plan: BilledPlan;
  interval: BillingInterval;
  /** Stripe's status: active, trialing, past_due, canceled, … */
  status: string;
  /** When it renews, or ends if it's set to end then. */
  periodEnd: string | null;
  /** Set to end at the end of the period it's paid for. */
  cancelAtPeriodEnd: boolean;
}

/** What a person (or an organization's owner or admin) sees of billing. */
export interface BillingView {
  /** Plans can be bought here: Stripe is set up. */
  enabled: boolean;
  /** What can be bought for them (Pro for a person, Business for an organization). */
  prices: PriceView[];
  /** The subscription on now, if any. */
  subscription: SubscriptionView | null;
  /** They have a billing account to manage (invoices, card, cancelling) in Stripe's portal. */
  canManage: boolean;
  /** Why they can't buy it here, when they can't (someone under 18, say). */
  unavailable: string | null;
}

/** "€6" or "€6.50": whole amounts without cents. */
export function priceAmount(p: Pick<PriceView, 'amount' | 'currency'>, locale = 'en-US'): string {
  const whole = p.amount % 100 === 0;
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: p.currency.toUpperCase(),
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: whole ? 0 : 2,
    }).format(p.amount / 100);
  } catch {
    return `${(p.amount / 100).toFixed(whole ? 0 : 2)} ${p.currency.toUpperCase()}`;
  }
}

/** "€6 a month", "€60 a year". */
export const priceText = (p: PriceView, locale?: string) =>
  `${priceAmount(p, locale)} a ${p.interval}`;

/** When a subscription renews or ends: "October 23, 2026". */
export function billingDate(iso: string, timeZone: string, locale = 'en-US'): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      timeZone,
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

/** Where a subscription stands, in a sentence for the plan page. */
export function subscriptionLine(s: SubscriptionView, timeZone: string, locale?: string): string {
  const when = s.periodEnd ? billingDate(s.periodEnd, timeZone, locale) : null;
  if (s.status === 'past_due')
    return 'A payment didn’t go through: Stripe is trying again. Update your card in Manage billing.';
  if (s.cancelAtPeriodEnd) return when ? `Ends on ${when}.` : 'Ends at the end of this period.';
  if (s.status === 'trialing') return when ? `Free until ${when}.` : 'In a free trial.';
  return when ? `Renews on ${when}.` : 'Renews automatically.';
}
