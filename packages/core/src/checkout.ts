/**
 * An organization's own checkout (R65): a Pay card paid by card through the organization's own
 * payment provider account (Stripe, connected by its owner). Caime takes nothing and holds
 * nothing: the payer pays the organization on the provider's page, and the card records it.
 * Pure, no zod: the app takes it by subpath.
 */
import { minorUnits } from './format';

/**
 * An amount in the provider's smallest unit ("EGP 400.50" is 40050), by the currency's own
 * exponent (`minorUnits`); a three-decimal one (the dinar) is charged to its hundredth, as Stripe
 * asks. Null when it can't be charged: not a positive finite number, or too big for one payment.
 */
export function chargeUnits(value: number, currency: string): number | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  const code = currency.toUpperCase();
  const exponent = minorUnits(code);
  const units = exponent === 3 ? Math.round(value * 100) * 10 : Math.round(value * 10 ** exponent);
  if (units < 1 || units > 99_999_999) return null;
  return units;
}

/** Where a Pay card's checkout stands, as the provider last said. */
export type CheckoutStatus = 'open' | 'paid' | 'expired';

/** What a Pay card keeps of its checkout: never a card number, never the payer's details. */
export interface CardCheckout {
  /** The provider's session, for asking it again. */
  sessionId: string;
  status: CheckoutStatus;
  /** Who opened it: the checkout is theirs to pay. */
  payerId: string;
  at: string;
}
