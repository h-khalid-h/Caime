import {
  type BilledPlan,
  type BillingInterval,
  type BillingView,
  priceText,
  subscriptionLine,
} from '@caime/core/billing';
import { tr } from '@caime/core/i18n';
import { PLAN_NAMES } from '@caime/core/plans';
import { useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { leaveFor } from '@/lib/links';
import { useUserClock } from '@/lib/time';
import { Button } from '@/ui/Button';
import { Segmented } from '@/ui/Segmented';
import { Text } from '@/ui/Text';
import { toast } from '@/ui/Toast';

/**
 * What can be bought for a person (Pro) or an organization (Business), and what's paid for:
 * Checkout on Stripe to buy it, Stripe's portal to manage it.
 */
export function BillingCard({
  billing,
  plan,
  orgId,
  back,
}: {
  billing: BillingView;
  plan: BilledPlan;
  orgId?: string;
  /** Just back from paying: it switches on as soon as Stripe says. */
  back: 'done' | null;
}) {
  const { timeZone, locale } = useUserClock();
  const [period, setPeriod] = useState<BillingInterval>('month');
  const [busy, setBusy] = useState(false);
  const name = PLAN_NAMES[plan];
  const sub = billing.subscription;
  const price = billing.prices.find((p) => p.interval === period) ?? billing.prices[0];
  const run = (f: () => Promise<{ url: string }>) => {
    setBusy(true);
    void f()
      .then(({ url }) => leaveFor(url))
      .catch((e) => {
        setBusy(false);
        toast((e as Error).message, { tone: 'danger' });
      });
  };
  const manage = billing.canManage ? (
    <Button
      label={tr('Manage billing')}
      variant="secondary"
      size="sm"
      disabled={busy}
      onPress={() => run(() => endpoints.billingPortal(orgId))}
      testID="billing-manage"
    />
  ) : null;

  if (sub) {
    // What it's charged: its own price, even after the list price changed.
    const paid =
      sub.amount != null && sub.currency
        ? { plan, interval: sub.interval, amount: sub.amount, currency: sub.currency }
        : billing.prices.find((p) => p.interval === sub.interval);
    return (
      <View style={{ gap: 10 }} testID="billing-subscription">
        <Text variant="bodyStrong">{paid ? `${name} · ${priceText(paid, locale)}` : name}</Text>
        <Text variant="caption" color={sub.status === 'past_due' ? 'warning' : 'textSecondary'}>
          {subscriptionLine(sub, timeZone, locale)}
        </Text>
        {manage}
      </View>
    );
  }
  if (back === 'done')
    return (
      <View style={{ gap: 6 }} testID="billing-thanks">
        <Text variant="bodyStrong">{tr('Thank you.')}</Text>
        <Text variant="caption" color="textSecondary">
          {tr(
            '{name} switches on as soon as Stripe confirms the payment, usually in a few seconds.',
            { name },
          )}
        </Text>
      </View>
    );
  // On it already (an operator's plan, say), or not theirs to buy: said, and what they paid
  // before can still be managed.
  if (billing.unavailable)
    return (
      <View style={{ gap: 10 }}>
        <Text variant="caption" color="textSecondary" testID="billing-unavailable">
          {billing.unavailable}
        </Text>
        {manage}
      </View>
    );
  if (!billing.enabled || !price) return manage;
  return (
    <View style={{ gap: 12 }} testID="billing-buy">
      {billing.prices.length > 1 ? (
        <Segmented
          label={tr('Billing period')}
          value={period}
          onChange={setPeriod}
          options={billing.prices.map((p) => ({
            value: p.interval,
            label: p.interval === 'month' ? tr('Monthly') : tr('Yearly'),
          }))}
        />
      ) : null}
      <Text variant="bodyStrong" testID="billing-price">
        {priceText(price, locale)}
      </Text>
      <Text variant="caption" color="textSecondary">
        {tr(
          'Paid through Stripe. Cancel whenever you like: it stays on until the end of what you’ve paid for, and nothing you use today goes away after.',
        )}
      </Text>
      <Button
        label={tr('Get {name}', { name })}
        disabled={busy}
        onPress={() => run(() => endpoints.checkout({ plan, interval: price.interval, orgId }))}
        testID="billing-checkout"
      />
      {manage}
    </View>
  );
}

export default BillingCard;
