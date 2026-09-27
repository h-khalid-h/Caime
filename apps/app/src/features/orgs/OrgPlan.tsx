import type { OrgPlanView } from '@caishy/core/api';
import { nextOrgPlan, ORG_ALLOWANCES, PLAN_NAMES } from '@caishy/core/plans';
import { View } from 'react-native';
import { useOrgBilling } from '@/api/hooks';
import { qk } from '@/api/keys';
import { BillingCard, useBackFromCheckout } from '@/features/billing';
import { openLink } from '@/lib/links';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Gauge } from '@/ui/icons';
import { Meter } from '@/ui/Meter';
import { Text } from '@/ui/Text';

const apps = (n: number) => (n === 1 ? 'one app' : `${n} apps`);
const count = (used: number, of: number, what: string) =>
  `${used} of ${of} ${what}${of === 1 ? '' : 's'}`;

/** What the next plan up adds, in a sentence; null at the top. */
export function nextOrgPlanLine(plan: OrgPlanView): string | null {
  const next = nextOrgPlan(plan.plan);
  if (!next) return null;
  const a = ORG_ALLOWANCES[next];
  const insights = a.insights && !plan.allowance.insights;
  return `${PLAN_NAMES[next]} has room for ${a.teamSize} people and ${apps(a.apps)}${insights ? ', with insights into how fast the team answers' : ''}.`;
}

/** An organization's plan, for its owner and admins: what it includes and what's in use. */
export function OrgPlan({
  plan,
  orgId,
  handle,
}: {
  plan: OrgPlanView;
  orgId: string;
  handle: string;
}) {
  const t = useTheme();
  const next = nextOrgPlan(plan.plan);
  const line = nextOrgPlanLine(plan);
  const billing = useOrgBilling(orgId).data;
  const back = useBackFromCheckout([qk.org(handle), qk.orgBilling(orgId)]);
  // Business is bought here once Stripe is set up; one paid for is managed here too.
  const billed =
    billing &&
    (billing.subscription ||
      billing.canManage ||
      (plan.plan === 'free' && (billing.enabled || billing.unavailable)));
  return (
    <Card>
      <View style={{ gap: 12 }} testID="org-plan">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Gauge size={20} color={t.c.textSecondary} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="label">{`${PLAN_NAMES[plan.plan]} plan`}</Text>
            <Text variant="caption" color="textSecondary">
              {`${plan.used.teamSize} of ${plan.allowance.teamSize} people · ${count(plan.used.apps, plan.allowance.apps, 'app')}`}
            </Text>
          </View>
        </View>
        <Meter
          used={plan.used.teamSize}
          of={plan.allowance.teamSize}
          label={`People on the team: ${plan.used.teamSize} of ${plan.allowance.teamSize}`}
        />
        <Text variant="caption" color="textSecondary">
          {`${plan.used.startsToday} of ${plan.allowance.startsPerDay.toLocaleString('en-US')} conversations started by the team today. Customers writing first are never counted.`}
        </Text>
        <Text variant="caption" color="textSecondary" testID="org-plan-agent">
          {`${plan.used.agentRepliesToday} of ${plan.allowance.agentRepliesPerDay.toLocaleString('en-US')} AI agent answers in the last 24 hours. Past that, your team answers as usual.`}
        </Text>
        {billed && billing ? (
          <>
            {plan.plan === 'free' && line ? (
              <Text variant="caption" color="textSecondary">
                {line}
              </Text>
            ) : null}
            <BillingCard billing={billing} plan="business" orgId={orgId} back={back} />
          </>
        ) : line ? (
          <Text variant="caption" color="textSecondary">
            {plan.upgradeUrl ? line : `${line} It can’t be bought here yet.`}
          </Text>
        ) : null}
        {!billed && next && plan.upgradeUrl ? (
          <Button
            label={`See ${PLAN_NAMES[next]}`}
            variant="secondary"
            size="sm"
            onPress={() => openLink(plan.upgradeUrl ?? '')}
            testID="org-plan-upgrade"
          />
        ) : null}
      </View>
    </Card>
  );
}
