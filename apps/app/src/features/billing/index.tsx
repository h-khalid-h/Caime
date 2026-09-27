/**
 * Billing on the plan pages (R25). The card loads when a plan page shows it, never with the app:
 * what it needs (prices, Stripe's pages) is for the few who open those pages.
 */
import { lazyPart } from '@/ui/Lazy';

export { useBackFromCheckout } from './back';

export const BillingCard = lazyPart(() => import('./BillingCard').then((m) => m.BillingCard));
