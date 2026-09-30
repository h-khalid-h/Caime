import type { Plan, PlanUsageView } from '@caime/core/api';
import { formatBytes, formatSoon } from '@caime/core/format';
import { nextPersonPlan, PERSON_ALLOWANCES, PLAN_NAMES } from '@caime/core/plans';
import { router } from 'expo-router';
import { View } from 'react-native';
import { useBilling, useMyPlan } from '@/api/hooks';
import { qk } from '@/api/keys';
import { BillingCard, useBackFromCheckout } from '@/features/billing';
import { Group, SettingsPage } from '@/features/settings/SettingsPage';
import { openLink } from '@/lib/links';
import { useSession } from '@/state/session';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { Divider } from '@/ui/Card';
import { ChartBar, ChevronRight, HardDrive, Sparkles, Zap } from '@/ui/icons';
import { Meter } from '@/ui/Meter';
import { Pressable } from '@/ui/Pressable';
import { SkeletonRows } from '@/ui/Skeleton';
import { Text } from '@/ui/Text';

function Usage({
  icon: Icon,
  title,
  detail,
  used,
  of,
  testID,
}: {
  icon: typeof Sparkles;
  title: string;
  detail: string;
  used: number;
  of: number;
  testID: string;
}) {
  const t = useTheme();
  return (
    <View style={{ padding: 16, gap: 10 }} testID={testID}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Icon size={20} color={t.c.textSecondary} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="label">{title}</Text>
          <Text variant="caption" color="textSecondary">
            {detail}
          </Text>
        </View>
      </View>
      <Meter used={used} of={of} label={`${title}: ${detail}`} />
    </View>
  );
}

/** What a paid plan adds (R47): the depth of the wedge, never the wedge. */
function proIncludes(plan: Plan = 'pro'): string {
  const a = PERSON_ALLOWANCES[plan];
  return `Relationship insights, ${a.automations} automations, ${a.aiPerDay} AI assists a day and ${formatBytes(a.storageBytes)} for files.`;
}

function aiDetail(p: PlanUsageView, timeZone: string, locale: string): string {
  const base = `${p.used.aiToday} of ${p.allowance.aiPerDay} in the last 24 hours`;
  if (!p.aiNextAt) return base;
  return `${base}. The next one is ready ${formatSoon(p.aiNextAt, new Date(), timeZone, locale)}`;
}

export default function PlanSettings() {
  const t = useTheme();
  const q = useMyPlan();
  const billing = useBilling().data;
  const back = useBackFromCheckout([qk.plan, qk.billing]);
  const user = useSession((s) => s.user);
  const p = q.data;
  if (!p || !user)
    return (
      <SettingsPage title="Plan">
        <SkeletonRows />
      </SettingsPage>
    );
  const next = nextPersonPlan(p.plan);
  const free = p.plan === 'personal';
  // Pro is bought here once Stripe is set up; one paid for is managed here too.
  const billed =
    billing &&
    (billing.subscription ||
      billing.canManage ||
      (free && (billing.enabled || billing.unavailable)));
  return (
    <SettingsPage title="Plan">
      <View style={{ gap: 6, paddingHorizontal: 4 }}>
        <Text variant="title" testID="plan-name">
          {PLAN_NAMES[p.plan]}
        </Text>
        <Text variant="body" color="textSecondary">
          {free
            ? 'Free forever: your connections, what needs you, what you’re waiting for, search and sync. No plan ever limits those.'
            : 'Everything in Personal, with relationship insights, more automations, more AI assist and more room for files.'}
        </Text>
      </View>

      <Group title="What you’re using">
        <Usage
          icon={Sparkles}
          title="AI assist"
          detail={aiDetail(p, user.timeZone, user.locale)}
          used={p.used.aiToday}
          of={p.allowance.aiPerDay}
          testID="plan-ai"
        />
        <Divider />
        <Usage
          icon={HardDrive}
          title="Files"
          detail={`${p.used.storageBytes ? formatBytes(p.used.storageBytes) : '0'} of ${formatBytes(p.allowance.storageBytes)}`}
          used={p.used.storageBytes}
          of={p.allowance.storageBytes}
          testID="plan-files"
        />
        <Divider />
        <Usage
          icon={Zap}
          title="Automations"
          detail={`${p.used.automations} of ${p.allowance.automations}`}
          used={p.used.automations}
          of={p.allowance.automations}
          testID="plan-automations"
        />
      </Group>
      <Group title="Relationship insights">
        <Pressable
          accessibilityRole="link"
          onPress={() => router.navigate('/settings/insights')}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 }}
          testID="plan-insights"
        >
          <ChartBar size={20} color={p.allowance.insights ? t.c.accentStrong : t.c.textTertiary} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="label">
              {p.allowance.insights ? 'Included in your plan' : `Comes with ${PLAN_NAMES.pro}`}
            </Text>
            <Text variant="caption" color="textSecondary">
              Who you write with most, who’s gone quiet, how fast you answer and are answered, and
              when you write. Yours alone.
            </Text>
          </View>
          <ChevronRight size={18} color={t.c.textTertiary} />
        </Pressable>
      </Group>

      {billed && billing ? (
        <Group title={PLAN_NAMES.pro}>
          <View style={{ padding: 16, gap: 12 }}>
            {free && !billing.subscription ? (
              <Text variant="body" testID="plan-pro-includes">
                {proIncludes()}
              </Text>
            ) : null}
            <BillingCard billing={billing} plan="pro" back={back} />
          </View>
        </Group>
      ) : next ? (
        <Group
          title={PLAN_NAMES[next]}
          footer={
            p.upgradeUrl
              ? undefined
              : `${PLAN_NAMES[next]} can’t be bought here yet. Nothing you use today will change when it can.`
          }
        >
          <View style={{ padding: 16, gap: 12 }}>
            <Text variant="body">{proIncludes(next)}</Text>
            {p.upgradeUrl ? (
              <Button
                label={`See ${PLAN_NAMES[next]}`}
                onPress={() => openLink(p.upgradeUrl ?? '')}
                testID="plan-upgrade"
              />
            ) : null}
          </View>
        </Group>
      ) : null}
    </SettingsPage>
  );
}
