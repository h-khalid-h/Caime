/**
 * The calendar (R51): what's ahead for this person, day by day, from their conversations and
 * actions: meetings and appointments (agreed, or only asked), and actions with a due date. Each
 * line says whom it's with and what they are to you, and opens where it was agreed. Caime stays
 * the record: nothing here changes a date; that's done in the conversation or on the action.
 */
import type { CalendarItemView } from '@caime/core/api';
import { formatClock, formatDayHeading } from '@caime/core/format';
import { tr } from '@caime/core/i18n';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { RefreshControl, SectionList, View } from 'react-native';
import { useCalendar } from '@/api/hooks';
import { OrgMark } from '@/features/orgs/kinds';
import { useNow, useUserClock } from '@/lib/time';
import { useTheme } from '@/theme/theme';
import { Avatar } from '@/ui/Avatar';
import { Chip } from '@/ui/Chip';
import { EmptyState } from '@/ui/EmptyState';
import { CalendarClock } from '@/ui/icons';
import { Pressable } from '@/ui/Pressable';
import { SkeletonRows } from '@/ui/Skeleton';
import { Text } from '@/ui/Text';

const DAY_MS = 86_400_000;
/** How far ahead the calendar looks: two months, from the start of today. */
const AHEAD_DAYS = 62;

/** The window asked for: from the start of this hour, so the key stays the same for an hour. */
function windowNow(now: Date): { from: string; to: string } {
  const start = new Date(now);
  start.setMinutes(0, 0, 0);
  return {
    from: start.toISOString(),
    to: new Date(start.getTime() + AHEAD_DAYS * DAY_MS).toISOString(),
  };
}

const STATE_LABEL: Record<CalendarItemView['state'], string | null> = {
  agreed: null,
  asked: 'asked',
  open: null,
  waiting: 'waiting',
  overdue: 'overdue',
};

function Row({
  item,
  timeZone,
  locale,
}: {
  item: CalendarItemView;
  timeZone: string;
  locale: string;
}) {
  const t = useTheme();
  const who = item.with?.displayName ?? item.org?.name ?? item.conversationTitle ?? null;
  const line = [who, item.relationship?.label, item.place].filter(Boolean).join(' · ');
  const when = item.hasTime
    ? `${formatClock(item.at, timeZone, locale)}${item.endAt ? `–${formatClock(item.endAt, timeZone, locale)}` : ''}`
    : tr('All day');
  const state = STATE_LABEL[item.state];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[item.title, when, line, state].filter(Boolean).join(', ')}
      onPress={() =>
        item.conversationId
          ? router.navigate({ pathname: '/c/[id]', params: { id: item.conversationId } })
          : undefined
      }
      focusRadius={12}
      testID={`calendar-item-${item.id}`}
      style={({ hovered, pressed }) => ({
        flexDirection: 'row',
        gap: 12,
        paddingHorizontal: 16,
        paddingVertical: 10,
        marginHorizontal: 6,
        borderRadius: 14,
        backgroundColor: pressed ? t.c.surfacePressed : hovered ? t.c.surfaceHover : 'transparent',
      })}
    >
      <Text variant="mono" color="textTertiary" style={{ width: 112, paddingTop: 3 }}>
        {when}
      </Text>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text variant="bodyStrong" numberOfLines={1} auto style={{ flexShrink: 1 }}>
            {item.title}
          </Text>
          {state ? (
            <Chip label={state} size="sm" tone={item.state === 'overdue' ? 'danger' : 'neutral'} />
          ) : null}
        </View>
        {line ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {item.with ? (
              <Avatar
                id={item.with.id}
                name={item.with.displayName}
                url={item.with.avatarUrl}
                size={18}
              />
            ) : item.org ? (
              <OrgMark kind={item.org.kind} url={item.org.avatarUrl} size={18} />
            ) : null}
            <Text
              variant="caption"
              color="textSecondary"
              numberOfLines={1}
              auto
              style={{ flex: 1 }}
            >
              {line}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

export function CalendarList() {
  const t = useTheme();
  const now = useNow();
  const { timeZone, locale } = useUserClock();
  // The window moves once an hour, so the query's key (and its cache) holds for an hour.
  const hour = Math.floor(now.getTime() / 3_600_000);
  const window = useMemo(() => windowNow(new Date(hour * 3_600_000)), [hour]);
  const q = useCalendar(window.from, window.to);
  const sections = useMemo(() => {
    const byDay = new Map<string, CalendarItemView[]>();
    for (const item of q.data?.items ?? []) {
      const day = formatDayHeading(item.at, now, timeZone, locale);
      byDay.set(day, [...(byDay.get(day) ?? []), item]);
    }
    return [...byDay].map(([title, data]) => ({ title, data }));
  }, [q.data, now, timeZone, locale]);
  if (q.isPending && !q.data) return <SkeletonRows count={5} />;
  return (
    <SectionList
      sections={sections}
      keyExtractor={(x) => `${x.kind}-${x.id}`}
      renderItem={({ item }) => <Row item={item} timeZone={timeZone} locale={locale} />}
      renderSectionHeader={({ section }) => (
        <View
          style={{
            paddingHorizontal: 22,
            paddingTop: 16,
            paddingBottom: 6,
            backgroundColor: t.c.surface,
          }}
        >
          <Text variant="overline" color="textTertiary" accessibilityRole="header">
            {section.title}
          </Text>
        </View>
      )}
      stickySectionHeadersEnabled={false}
      refreshControl={
        <RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />
      }
      ListEmptyComponent={
        <EmptyState
          character="lumi"
          expression="happy"
          icon={CalendarClock}
          title={tr('Nothing coming up')}
          body={tr(
            'Meetings and appointments agreed in your conversations, and actions with a due date, show here by day.',
          )}
        />
      }
      contentContainerStyle={{
        paddingBottom: 32,
        backgroundColor: sections.length ? t.c.surface : undefined,
      }}
      testID="calendar-list"
    />
  );
}
