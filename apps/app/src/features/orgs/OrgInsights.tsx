import { replyTimeText } from '@caime/core/business';
import { tr } from '@caime/core/i18n';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { useTheme } from '@/theme/theme';
import { Card } from '@/ui/Card';
import { ChartBar } from '@/ui/icons';
import { Segmented } from '@/ui/Segmented';
import { Text } from '@/ui/Text';

/** Against the period before, in words read at a glance: "Up from 3", "Same as before". */
function versus(now: number, before: number): string | null {
  if (now === before) return before ? tr('Same as before') : null;
  return tr('{Up} from {before}', { Up: now > before ? tr('Up') : tr('Down'), before });
}

function Stat({
  label,
  value,
  detail,
  testID,
}: {
  label: string;
  value: string;
  detail?: string | null;
  testID: string;
}) {
  const t = useTheme();
  return (
    <View
      style={{
        flexGrow: 1,
        flexBasis: 140,
        padding: 12,
        gap: 2,
        borderRadius: t.radii.md,
        backgroundColor: t.c.surfaceMuted,
      }}
      testID={testID}
    >
      <Text variant="caption" color="textSecondary">
        {label}
      </Text>
      <Text variant="headline">{value}</Text>
      {detail ? (
        <Text variant="caption" color="textTertiary">
          {detail}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * How the inbox is doing (PRD §71), for owners and admins on Business: how many customers wrote,
 * how fast the team answered, who's waiting, what's resolved. The team as a whole, never a person.
 */
export function OrgInsights({ orgId }: { orgId: string }) {
  const t = useTheme();
  const [days, setDays] = useState<'7' | '30'>('7');
  const q = useQuery({
    queryKey: qk.orgInsights(orgId, Number(days)),
    queryFn: () => endpoints.orgInsights(orgId, days === '7' ? 7 : 30),
  });
  const i = q.data?.insights;
  return (
    <Card>
      <View style={{ gap: 14 }} testID="org-insights">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <ChartBar size={20} color={t.c.textSecondary} />
          <Text variant="label" style={{ flex: 1 }}>
            {tr('Insights')}
          </Text>
          <View style={{ flexShrink: 0, width: 180 }}>
            <Segmented
              value={days}
              onChange={setDays}
              label={tr('Period')}
              options={[
                { value: '7', label: '7 days' },
                { value: '30', label: '30 days' },
              ]}
            />
          </View>
        </View>
        {i ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            <Stat
              label={tr('Customers')}
              value={String(i.conversations)}
              detail={versus(i.conversations, i.previous.conversations)}
              testID="insight-conversations"
            />
            <Stat
              label={tr('First answer')}
              value={i.reply.medianMinutes === null ? '—' : replyTimeText(i.reply.medianMinutes)}
              detail={
                i.reply.answered
                  ? tr('{withinHour} of {answered} within an hour', {
                      withinHour: i.reply.withinHour,
                      answered: i.reply.answered,
                    })
                  : tr('Nothing answered yet')
              }
              testID="insight-reply"
            />
            <Stat
              label={tr('Waiting now')}
              value={String(i.waitingNow)}
              detail={i.waitingNow ? tr('For someone on the team') : tr('Nobody')}
              testID="insight-waiting"
            />
            <Stat
              label={tr('Resolved')}
              value={String(i.resolved)}
              detail={versus(i.resolved, i.previous.resolved)}
              testID="insight-resolved"
            />
          </View>
        ) : (
          <Text variant="caption" color="textTertiary">
            {q.isError ? tr('Insights didn’t load. Try again in a moment.') : tr('Loading…')}
          </Text>
        )}
        <Text variant="caption" color="textTertiary">
          {tr(
            'The whole team’s numbers, never one person’s. Answers from an app’s bot don’t count.',
          )}
        </Text>
      </View>
    </Card>
  );
}
