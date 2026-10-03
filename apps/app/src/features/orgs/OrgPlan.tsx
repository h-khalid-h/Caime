import type { OrgPlanView } from '@caime/core/api';
import { tr } from '@caime/core/i18n';
import { nextOrgPlan, ORG_ALLOWANCES, PLAN_NAMES } from '@caime/core/plans';
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
  return tr('{PLAN_NAMES} has room for {teamSize} people and {apps}{with}.', {
    PLAN_NAMES: PLAN_NAMES[next],
    teamSize: a.teamSize,
    apps: apps(a.apps),
    with: insights ? tr(', with insights into how fast the team answers') : '',
  });
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
            <Text variant="label">
              {tr('{PLAN_NAMES} plan', { PLAN_NAMES: PLAN_NAMES[plan.plan] })}
            </Text>
            <Text variant="caption" color="textSecondary">
              {tr('{teamSize} of {teamSize2} people · {count}', {
                teamSize: plan.used.teamSize,
                teamSize2: plan.allowance.teamSize,
                count: count(plan.used.apps, plan.allowance.apps, 'app'),
              })}
            </Text>
          </View>
        </View>
        <Meter
          used={plan.used.teamSize}
          of={plan.allowance.teamSize}
          label={tr('People on the team: {teamSize} of {teamSize2}', {
            teamSize: plan.used.teamSize,
            teamSize2: plan.allowance.teamSize,
          })}
        />
        <Text variant="caption" color="textSecondary">
          {tr(
            '{startsToday} of {toLocaleString} conversations started by the team today. Customers writing first are never counted.',
            {
              startsToday: plan.used.startsToday,
              toLocaleString: plan.allowance.startsPerDay.toLocaleString('en-US'),
            },
          )}
        </Text>
        <Text variant="caption" color="textSecondary" testID="org-plan-agent">
          {tr(
            '{agentRepliesToday} of {toLocaleString} AI agent answers in the last 24 hours. Past that, your team answers as usual.',
            {
              agentRepliesToday: plan.used.agentRepliesToday,
              toLocaleString: plan.allowance.agentRepliesPerDay.toLocaleString('en-US'),
            },
          )}
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
            {plan.upgradeUrl ? line : tr('{line} It can’t be bought here yet.', { line })}
          </Text>
        ) : null}
        {!billed && next && plan.upgradeUrl ? (
          <Button
            label={tr('See {PLAN_NAMES}', { PLAN_NAMES: PLAN_NAMES[next] })}
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
