import type { InsightPersonRef, PersonInsightsView, ReplyTimesView } from '@caime/core/api';
import { formatWhen } from '@caime/core/format';
import { tr, trn } from '@caime/core/i18n';
import { SPHERE_DEFS, type Sphere } from '@caime/core/taxonomy';
import { router } from 'expo-router';
import ChartBar from 'lucide-react-native/icons/chart-no-axes-column';
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
        label={tr('How far back')}
        value={String(days)}
        onChange={(v) => setDays(Number(v) as Days)}
        options={[
          { value: '30', label: '30 days' },
          { value: '90', label: tr('A quarter') },
          { value: '365', label: tr('A year') },
        ]}
      />
      {q.isPending ? (
        <SkeletonRows count={6} />
      ) : locked ? (
        <View testID="insights-locked">
          <EmptyState
            icon={ChartBar}
            title={tr('Comes with Pro')}
            body={(q.error as Error).message}
            action={
              <Button
                label={tr('See Pro')}
                onPress={() => router.navigate('/settings/plan')}
                testID="insights-see-pro"
              />
            }
          />
        </View>
      ) : q.isError ? (
        <EmptyState
          icon={ChartBar}
          title={tr('Insights couldn’t load')}
          body={(q.error as Error).message}
          action={
            <Button label={tr('Try again')} variant="secondary" onPress={() => void q.refetch()} />
          }
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
  return tr('{n} days', { n: Math.round((m / (60 * 24)) * 10) / 10 });
}

function replyLine(who: 'mine' | 'theirs', r: ReplyTimesView): string {
  const waiting =
    r.unanswered === 0
      ? ''
      : who === 'mine'
        ? tr(' · {unanswered} waiting on you', { unanswered: r.unanswered })
        : tr(' · {unanswered} waiting on them', { unanswered: r.unanswered });
  const vars = {
    minutes: minutes(r.medianMinutes),
    withinHour: r.withinHour,
    answered: r.answered,
    waiting,
  };
  // Whole sentences: who answers is part of each, never an English word put into another.
  return who === 'mine'
    ? tr(
        'You answer in about {minutes} · {withinHour} of {answered} within the hour{waiting}',
        vars,
      )
    : tr(
        'You’re answered in about {minutes} · {withinHour} of {answered} within the hour{waiting}',
        vars,
      );
}

function Insights({ i }: { i: PersonInsightsView }) {
  const t = useTheme();
  const now = useNow();
  const { timeZone, locale } = useUserClock();
  const active = { count: i.active.count, previous: i.active.previous };
  const spheres = i.connections.bySphere
    .map((s) => `${s.count} ${tr(SPHERE_DEFS[s.sphere as Sphere]?.label ?? s.sphere)}`)
    .join(' · ');
  const most = Math.max(1, ...i.hours);
  const open = (p: InsightPersonRef) =>
    p.conversationId
      ? router.navigate({ pathname: '/c/[id]', params: { id: p.conversationId } })
      : router.navigate({ pathname: '/p/[id]', params: { id: p.userId } });
  return (
    <>
      <Group title={tr('Your people')}>
        <View style={{ padding: 16, gap: 6 }}>
          <Text variant="label" testID="insights-connections">
            {trn(i.connections.total, '{n} connection', '{n} connections')}
          </Text>
          {spheres ? (
            <Text variant="caption" color="textSecondary">
              {spheres}
            </Text>
          ) : null}
          <Text variant="body" color="textSecondary" testID="insights-active">
            {active.count === active.previous
              ? tr(
                  'You wrote with {count} of them in this time, as many as the time before.',
                  active,
                )
              : active.count > active.previous
                ? tr(
                    'You wrote with {count} of them in this time, up from {previous} the time before.',
                    active,
                  )
                : tr(
                    'You wrote with {count} of them in this time, down from {previous} the time before.',
                    active,
                  )}
          </Text>
          <Text variant="body" color="textSecondary" testID="insights-messages">
            {tr('{sent} messages from you, {received} to you ({sent2} and {received2} before).', {
              sent: i.messages.sent,
              received: i.messages.received,
              sent2: i.messages.previous.sent,
              received2: i.messages.previous.received,
            })}
          </Text>
        </View>
      </Group>

      <Group title={tr('Replies')}>
        <View style={{ padding: 16, gap: 6 }}>
          <Text variant="body" testID="insights-reply-yours">
            {replyLine('mine', i.reply.yours)}
          </Text>
          <Text variant="body" color="textSecondary" testID="insights-reply-theirs">
            {replyLine('theirs', i.reply.theirs)}
          </Text>
          <Text variant="caption" color="textTertiary">
            {trn(
              i.started.byYou,
              'You started {n} exchange after a quiet day or more; they started {byThem}.',
              'You started {n} exchanges after a quiet day or more; they started {byThem}.',
              { byThem: i.started.byThem },
            )}
          </Text>
        </View>
      </Group>

      <Group title={tr('Closest')}>
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
                    {tr('{messages} messages · you wrote {pct}', {
                      messages: p.messages,
                      pct: pct(p.yourShare),
                    })}
                  </Text>
                </View>
              </Pressable>
            </View>
          ))
        ) : (
          <Text variant="body" color="textSecondary" style={{ padding: 16 }}>
            {tr('Nothing said one to one in this time.')}
          </Text>
        )}
      </Group>

      <Group
        title={tr('Gone quiet')}
        footer={tr(
          'Connections you’d written with before this time, and not since. Whether to write is yours: Caime only shows it.',
        )}
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
                    {tr('Last {formatWhen}', {
                      formatWhen: formatWhen(p.lastAt, now, timeZone, locale),
                    })}
                  </Text>
                </View>
                <Button
                  label={tr('Say hello')}
                  size="sm"
                  variant="secondary"
                  onPress={() => open(p)}
                />
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
            {tr('Nobody’s gone quiet.')}
          </Text>
        )}
      </Group>

      <Group title={tr('When you write')} footer={tr('Your messages by the hour of your day.')}>
        <View style={{ padding: 16, gap: 6 }}>
          <View
            style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 64 }}
            accessibilityRole="image"
            accessibilityLabel={tr('Messages by hour: {join}', {
              join:
                i.hours
                  .map((n, h) => (n ? `${h}h ${n}` : 'tr('))
                  .filter(Boolean)
                  .join('), ') || 'none',
            })}
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
        {tr(
          'Worked out from your own one-to-ones, for you only. Nobody else sees this, and nothing anyone said is read for it.',
        )}
      </Text>
    </>
  );
}
