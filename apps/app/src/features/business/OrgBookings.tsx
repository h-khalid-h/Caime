/**
 * An organization's bookings (R51): the appointments its team agreed, or was asked, with
 * customers, day by day, for the team. Each opens the conversation, where the card is
 * confirmed, moved or cancelled: the booking lives there, never here.
 */
import type { OrgBookingView } from '@caime/core/api';
import { formatClock, formatDayHeading } from '@caime/core/format';
import { useMemo } from 'react';
import { RefreshControl, SectionList, View } from 'react-native';
import { useOrgCalendar } from '@/api/hooks';
import { useNow, useUserClock } from '@/lib/time';
import { useTheme } from '@/theme/theme';
import { Avatar } from '@/ui/Avatar';
import { Chip } from '@/ui/Chip';
import { EmptyState } from '@/ui/EmptyState';
import { CalendarCheck } from '@/ui/icons';
import { Pressable } from '@/ui/Pressable';
import { SkeletonRows } from '@/ui/Skeleton';
import { Text } from '@/ui/Text';

const DAY_MS = 86_400_000;
const AHEAD_DAYS = 62;

function windowNow(now: Date): { from: string; to: string } {
  const start = new Date(now);
  start.setMinutes(0, 0, 0);
  return {
    from: start.toISOString(),
    to: new Date(start.getTime() + AHEAD_DAYS * DAY_MS).toISOString(),
  };
}

export function OrgBookings({
  orgId,
  open,
}: {
  orgId: string | undefined;
  open: (conversationId: string) => void;
}) {
  const t = useTheme();
  const now = useNow();
  const { timeZone, locale } = useUserClock();
  // The window moves once an hour, so the query's key (and its cache) holds for an hour.
  const hour = Math.floor(now.getTime() / 3_600_000);
  const window = useMemo(() => windowNow(new Date(hour * 3_600_000)), [hour]);
  const q = useOrgCalendar(orgId, window.from, window.to);
  const sections = useMemo(() => {
    const byDay = new Map<string, OrgBookingView[]>();
    for (const item of q.data?.items ?? []) {
      const day = formatDayHeading(item.at, now, timeZone, locale);
      byDay.set(day, [...(byDay.get(day) ?? []), item]);
    }
    return [...byDay].map(([title, data]) => ({ title, data }));
  }, [q.data, now, timeZone, locale]);
  if (q.isPending && !q.data) return <SkeletonRows count={4} />;
  return (
    <SectionList
      sections={sections}
      keyExtractor={(x) => x.messageId}
      renderItem={({ item }) => {
        const name = item.customer?.displayName ?? 'Deleted account';
        const when = item.hasTime ? formatClock(item.at, timeZone, locale) : 'All day';
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${name}, ${item.title}, ${when}, ${item.state}`}
            onPress={() => open(item.conversationId)}
            focusRadius={12}
            testID={`booking-${item.messageId}`}
            style={({ hovered, pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              paddingHorizontal: 16,
              paddingVertical: 10,
              marginHorizontal: 6,
              borderRadius: 14,
              backgroundColor: pressed
                ? t.c.surfacePressed
                : hovered
                  ? t.c.surfaceHover
                  : 'transparent',
            })}
          >
            <Text variant="mono" color="textTertiary" style={{ width: 72 }}>
              {when}
            </Text>
            {item.customer ? (
              <Avatar id={item.customer.id} name={item.customer.displayName} url={null} size={32} />
            ) : null}
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text variant="bodyStrong" numberOfLines={1} auto>
                {name}
              </Text>
              <Text variant="caption" color="textSecondary" numberOfLines={1} auto>
                {[item.title, item.place].filter(Boolean).join(' · ')}
              </Text>
            </View>
            <Chip
              label={item.state === 'confirmed' ? 'Confirmed' : 'Asked'}
              size="sm"
              tone={item.state === 'confirmed' ? 'success' : 'warning'}
            />
          </Pressable>
        );
      }}
      renderSectionHeader={({ section }) => (
        <View style={{ paddingHorizontal: 22, paddingTop: 14, paddingBottom: 6 }}>
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
          compact
          icon={CalendarCheck}
          character="pico"
          expression="happy"
          title="No bookings ahead"
          body="Appointments asked for or confirmed in your customer conversations show here by day."
        />
      }
      contentContainerStyle={{ paddingBottom: 24 }}
      testID="org-bookings"
    />
  );
}
