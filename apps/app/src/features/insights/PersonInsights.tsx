import type { InsightPersonRef, PersonInsightsView, ReplyTimesView } from '@caime/core/api';
import { formatWhen } from '@caime/core/format';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { ApiError } from '@/api/client';
import { useMyInsights } from '@/api/hooks';
import { Group } from '@/features/settings/SettingsPage';
import { useNow, useUserClock } from '@/lib/time';
import { useTheme } from '@/theme/theme';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { Divider } from '@/ui/Card';
import { EmptyState } from '@/ui/EmptyState';
import { ChartBar } from '@/ui/icons';
import { Pressable } from '@/ui/Pressable';
import { Segmented } from '@/ui/Segmented';
import { SkeletonRows } from '@/ui/Skeleton';
import { Text } from '@/ui/Text';

type Days = 30 | 90 | 365;
/** The hours of a day, for the bars. */
const HOURS = Array.from({ length: 24 }, (_, h) => h);

/**
 * How your relationships are going (R47, Pro): worked out on the server from your own
 * one-to-ones, for you only. On Personal it says what it would show, and where Pro is.
 */
export function PersonInsights() {
  const [days, setDays] = useState<Days>(90);
  const q = useMyInsights(days);
  const locked = q.error instanceof ApiError && q.error.code === 'plan_limit';
  return (
    <>
      <Segmented
        label="How far back"
        value={String(days)}
        onChange={(v) => setDays(Number(v) as Days)}
        options={[
          { value: '30', label: '30 days' },
          { value: '90', label: 'A quarter' },
          { value: '365', label: 'A year' },
        ]}
      />
      {q.isPending ? (
        <SkeletonRows count={6} />
      ) : locked ? (
        <View testID="insights-locked">
          <EmptyState
            icon={ChartBar}
            title="Comes with Pro"
            body={(q.error as Error).message}
            action={
              <Button
                label="See Pro"
                onPress={() => router.navigate('/settings/plan')}
                testID="insights-see-pro"
              />
            }
          />
        </View>
      ) : q.isError ? (
        <EmptyState
          icon={ChartBar}
          title="Insights couldn’t load"
          body={(q.error as Error).message}
          action={<Button label="Try again" variant="secondary" onPress={() => void q.refetch()} />}
        />
      ) : (
        <Insights i={q.data.insights} />
      )}
    </>
  );
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function minutes(m: number | null): string {
  if (m == null) return 'no answers yet';
  if (m < 60) return `${Math.max(1, Math.round(m))} min`;
  if (m < 60 * 24) return `${Math.round((m / 60) * 10) / 10} h`;
  return `${Math.round((m / (60 * 24)) * 10) / 10} days`;
}

function replyLine(who: 'You answer' | 'You’re answered', r: ReplyTimesView): string {
  const waiting =
    r.unanswered === 0
      ? ''
      : who === 'You answer'
        ? ` · ${r.unanswered} waiting on you`
        : ` · ${r.unanswered} waiting on them`;
  return `${who} in about ${minutes(r.medianMinutes)} · ${r.withinHour} of ${r.answered} within the hour${waiting}`;
}

function Insights({ i }: { i: PersonInsightsView }) {
  const t = useTheme();
  const now = useNow();
  const { timeZone, locale } = useUserClock();
  const change = (a: number, b: number) =>
    a === b ? 'the same as' : a > b ? 'up from' : 'down from';
  const spheres = i.connections.bySphere.map((s) => `${s.count} ${s.sphere}`).join(' · ');
  const most = Math.max(1, ...i.hours);
  const open = (p: InsightPersonRef) =>
    p.conversationId
      ? router.navigate({ pathname: '/c/[id]', params: { id: p.conversationId } })
      : router.navigate({ pathname: '/p/[id]', params: { id: p.userId } });
  return (
    <>
      <Group title="Your people">
        <View style={{ padding: 16, gap: 6 }}>
          <Text variant="label" testID="insights-connections">
            {i.connections.total === 1 ? '1 connection' : `${i.connections.total} connections`}
          </Text>
          {spheres ? (
            <Text variant="caption" color="textSecondary">
              {spheres}
            </Text>
          ) : null}
          <Text variant="body" color="textSecondary" testID="insights-active">
            {`You wrote with ${i.active.count} of them in this time, ${change(i.active.count, i.active.previous)} ${i.active.previous} the time before.`}
          </Text>
          <Text variant="body" color="textSecondary" testID="insights-messages">
            {`${i.messages.sent} messages from you, ${i.messages.received} to you (${i.messages.previous.sent} and ${i.messages.previous.received} before).`}
          </Text>
        </View>
      </Group>

      <Group title="Replies">
        <View style={{ padding: 16, gap: 6 }}>
          <Text variant="body" testID="insights-reply-yours">
            {replyLine('You answer', i.reply.yours)}
          </Text>
          <Text variant="body" color="textSecondary" testID="insights-reply-theirs">
            {replyLine('You’re answered', i.reply.theirs)}
          </Text>
          <Text variant="caption" color="textTertiary">
            {`You started ${i.started.byYou} ${i.started.byYou === 1 ? 'exchange' : 'exchanges'} after a quiet day or more; they started ${i.started.byThem}.`}
          </Text>
        </View>
      </Group>

      <Group title="Closest">
        {i.closest.length ? (
          i.closest.map((p, n) => (
            <View key={p.userId}>
              {n ? <Divider /> : null}
              <Pressable
                accessibilityRole="link"
                onPress={() => open(p)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 }}
                testID={`insights-closest-${p.displayName}`}
              >
                <Avatar id={p.userId} name={p.displayName} url={p.avatarUrl} size={40} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="label" numberOfLines={1}>
                    {p.displayName}
                  </Text>
                  <Text variant="caption" color="textSecondary">
                    {`${p.messages} messages · you wrote ${pct(p.yourShare)}`}
                  </Text>
                </View>
              </Pressable>
            </View>
          ))
        ) : (
          <Text variant="body" color="textSecondary" style={{ padding: 16 }}>
            Nothing said one to one in this time.
          </Text>
        )}
      </Group>

      <Group
        title="Gone quiet"
        footer="Connections you’d written with before this time, and not since. Whether to write is yours: Caime only shows it."
      >
        {i.quiet.length ? (
          i.quiet.map((p, n) => (
            <View key={p.userId}>
              {n ? <Divider /> : null}
              <View
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 }}
                testID={`insights-quiet-${p.displayName}`}
              >
                <Avatar id={p.userId} name={p.displayName} url={p.avatarUrl} size={40} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="label" numberOfLines={1}>
                    {p.displayName}
                  </Text>
                  <Text variant="caption" color="textSecondary">
                    {`Last ${formatWhen(p.lastAt, now, timeZone, locale)}`}
                  </Text>
                </View>
                <Button label="Say hello" size="sm" variant="secondary" onPress={() => open(p)} />
              </View>
            </View>
          ))
        ) : (
          <Text
            variant="body"
            color="textSecondary"
            style={{ padding: 16 }}
            testID="insights-quiet-none"
          >
            Nobody’s gone quiet.
          </Text>
        )}
      </Group>

      <Group title="When you write" footer="Your messages by the hour of your day.">
        <View style={{ padding: 16, gap: 6 }}>
          <View
            style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 64 }}
            accessibilityRole="image"
            accessibilityLabel={`Messages by hour: ${
              i.hours
                .map((n, h) => (n ? `${h}h ${n}` : ''))
                .filter(Boolean)
                .join(', ') || 'none'
            }`}
            testID="insights-hours"
          >
            {HOURS.map((h) => {
              const n = i.hours[h] ?? 0;
              return (
                <View
                  key={h}
                  style={{
                    flex: 1,
                    height: Math.max(2, Math.round((n / most) * 64)),
                    borderRadius: 2,
                    backgroundColor: n ? t.c.primary : t.c.border,
                  }}
                />
              );
            })}
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            {['0', '6', '12', '18', '24'].map((l) => (
              <Text key={l} variant="caption" color="textTertiary">
                {l}
              </Text>
            ))}
          </View>
        </View>
      </Group>
      <Text variant="caption" color="textTertiary" style={{ paddingHorizontal: 4 }}>
        Worked out from your own one-to-ones, for you only. Nobody else sees this, and nothing
        anyone said is read for it.
      </Text>
    </>
  );
}
