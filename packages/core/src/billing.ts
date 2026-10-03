import { tr } from './i18n';
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

/** Which plan and interval a lookup key is for, or null for a price that isn't Caime's. */
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
  /** What it's charged, in the currency's smallest unit: its own price, kept when prices change. */
  amount: number | null;
  currency: string | null;
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

/** Stripe's currencies with no smaller unit (amounts are whole yen, won, …). */
const ZERO_DECIMAL = new Set(
  'bif clp djf gnf jpy kmf krw mga pyg rwf ugx vnd vuv xaf xof xpf'.split(' '),
);
/** And its currencies counted in thousandths. */
const THREE_DECIMAL = new Set('bhd jod kwd omr tnd'.split(' '));

/**
 * How many digits a currency's smallest unit is below its whole one, as Stripe counts amounts: 0
 * for yen, 3 for Bahrain's dinar, and 2 for everything else (the forint and the króna too, which
 * Stripe counts in hundredths though nobody pays in them).
 */
export function minorDigits(currency: string): number {
  const c = currency.toLowerCase();
  return ZERO_DECIMAL.has(c) ? 0 : THREE_DECIMAL.has(c) ? 3 : 2;
}

/** "€6" or "€6.50", "¥980": whole amounts without cents. Amounts are in the smallest unit. */
export function priceAmount(p: Pick<PriceView, 'amount' | 'currency'>, locale = 'en-US'): string {
  const digits = minorDigits(p.currency);
  const scale = 10 ** digits;
  const whole = p.amount % scale === 0;
  const shown = whole ? 0 : digits;
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: p.currency.toUpperCase(),
      minimumFractionDigits: shown,
      maximumFractionDigits: shown,
    }).format(p.amount / scale);
  } catch {
    return `${(p.amount / scale).toFixed(shown)} ${p.currency.toUpperCase()}`;
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
    return tr(
      'A payment didn’t go through: Stripe is trying again. Update your card in Manage billing.',
    );
  if (s.cancelAtPeriodEnd)
    return when ? tr('Ends on {when}.', { when }) : tr('Ends at the end of this period.');
  if (s.status === 'trialing')
    return when ? tr('Free until {when}.', { when }) : tr('In a free trial.');
  return when ? tr('Renews on {when}.', { when }) : tr('Renews automatically.');
}
