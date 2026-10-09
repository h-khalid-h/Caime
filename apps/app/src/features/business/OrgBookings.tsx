/**
 * An organization's bookings (R51): the appointments its team agreed, or was asked, with
 * customers, day by day, for the team. Each opens the conversation, where the card is
 * confirmed, moved or cancelled: the booking lives there, never here.
 */
import type { OrgBookingView, OrgView } from '@caime/core/api';
import { formatAmount, formatClock, formatDayHeading } from '@caime/core/format';
import { tr, trn } from '@caime/core/i18n';
import { useQueryClient } from '@tanstack/react-query';
import CalendarCheck from 'lucide-react-native/icons/calendar-check';
import { useMemo, useState } from 'react';
import { RefreshControl, SectionList, View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { useOrgCalendar } from '@/api/hooks';
import { qk } from '@/api/keys';
import { useNow, useUserClock } from '@/lib/time';
import { useTheme } from '@/theme/theme';
import { Avatar } from '@/ui/Avatar';
import { Chip } from '@/ui/Chip';
import { EmptyState } from '@/ui/EmptyState';
import { ListRow } from '@/ui/ListRow';
import { Pressable } from '@/ui/Pressable';
import { Sheet } from '@/ui/Sheet';
import { SkeletonRows } from '@/ui/Skeleton';
import { Text } from '@/ui/Text';
import { toast } from '@/ui/Toast';

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
  org,
  open,
}: {
  orgId: string | undefined;
  /** The organization, for its team (who does a booking is chosen from it, R58). */
  org?: OrgView | null;
  open: (conversationId: string) => void;
}) {
  const t = useTheme();
  const qc = useQueryClient();
  const now = useNow();
  // Who does a booking (R58): decided when confirmed, changed here in a tap.
  const [assigning, setAssigning] = useState<OrgBookingView | null>(null);
  const [saving, setSaving] = useState(false);
  const assign = async (userId: string | null) => {
    if (!assigning) return;
    setSaving(true);
    try {
      await endpoints.setBookingProvider(assigning.messageId, userId);
      void qc.invalidateQueries({ queryKey: qk.allOrgCalendars });
      setAssigning(null);
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setSaving(false);
    }
  };
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
        const name = item.customer?.displayName ?? tr('Deleted account');
        const when = item.hasTime ? formatClock(item.at, timeZone, locale) : tr('All day');
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
                {[
                  item.title,
                  item.booking && item.booking.name !== item.title ? item.booking.name : null,
                  item.booking && item.booking.quantity > 1
                    ? item.booking.unit === 'days'
                      ? trn(item.booking.quantity, '{n} day', '{n} days')
                      : tr('For {n}', { n: item.booking.quantity })
                    : null,
                  item.booking?.price
                    ? formatAmount(item.booking.price.value, item.booking.price.currency, locale)
                    : null,
                  item.place,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
              {item.booking ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={tr('Who does it')}
                  onPress={() => setAssigning(item)}
                  focusRadius={8}
                  style={{ alignSelf: 'flex-start' }}
                  testID={`booking-who-${item.messageId}`}
                >
                  <Text
                    variant="caption"
                    color={item.booking.providerName ? 'textSecondary' : 'warning'}
                    auto
                  >
                    {item.booking.providerName
                      ? tr('With {name}', { name: item.booking.providerName })
                      : tr('Nobody yet')}
                  </Text>
                </Pressable>
              ) : null}
            </View>
            <Chip
              label={item.state === 'confirmed' ? tr('Confirmed') : tr('Asked')}
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
          title={tr('No bookings ahead')}
          body={tr(
            'Appointments asked for or confirmed in your customer conversations show here by day.',
          )}
        />
      }
      contentContainerStyle={{ paddingBottom: 24 }}
      testID="org-bookings"
      ListFooterComponent={
        <Sheet
          open={assigning !== null}
          onClose={() => setAssigning(null)}
          title={tr('Who does it')}
          subtitle={
            assigning
              ? `${assigning.title} · ${formatClock(assigning.at, timeZone, locale)}`
              : undefined
          }
        >
          <View style={{ gap: 2 }}>
            <ListRow
              title={tr('Nobody yet')}
              radio
              checked={!assigning?.booking?.providerId}
              onPress={() => void assign(null)}
              testID="booking-who-nobody"
            />
            {(org?.members ?? [])
              .filter((m) => m.person.kind === 'human')
              .map((m) => (
                <ListRow
                  key={m.userId}
                  title={m.person.displayName}
                  subtitle={m.title ?? undefined}
                  radio
                  checked={assigning?.booking?.providerId === m.userId}
                  onPress={() => void assign(m.userId)}
                  testID={`booking-who-${m.userId}`}
                />
              ))}
            {saving ? <SkeletonRows count={1} /> : null}
          </View>
        </Sheet>
      }
    />
  );
}
