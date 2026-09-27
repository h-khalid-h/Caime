/**
 * Billing on the plan pages (R25). The card loads when a plan page shows it, never with the app:
 * what it needs (prices, Stripe's pages) is for the few who open those pages.
 */
import { lazy, Suspense } from 'react';
import type { BillingCard as Card } from './BillingCard';

export { useBackFromCheckout } from './back';

const Lazy = lazy(() => import('./BillingCard'));

export function BillingCard(props: Parameters<typeof Card>[0]) {
  return (
    <Suspense fallback={null}>
      <Lazy {...props} />
    </Suspense>
  );
}
