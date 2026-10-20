/**
 * The calendar (R51): what's ahead for this person, day by day, from their conversations and
 * actions: meetings and appointments (agreed, or only asked), and actions with a due date. Each
 * line says whom it's with and what they are to you, and opens where it was agreed. Caime stays
 * the record: nothing here changes a date; that's done in the conversation or on the action.
 */
import type { CalendarItemView } from '@caime/core/api';
import { formatAmount, formatClock, formatDayHeading } from '@caime/core/format';
import { listed, tr } from '@caime/core/i18n';
import { calendarAction, meetingLink } from '@caime/core/meetings';
import { REPEAT_CHOICES } from '@caime/core/repeat';
import { router } from 'expo-router';
import CalendarCheck from 'lucide-react-native/icons/calendar-check';
import CalendarClock from 'lucide-react-native/icons/calendar-clock';
import CalendarDays from 'lucide-react-native/icons/calendar-days';
import { useMemo } from 'react';
import { RefreshControl, SectionList, View } from 'react-native';
import { useBusinessSummary, useCalendar } from '@/api/hooks';
import { OrgMark } from '@/features/orgs/kinds';
import { openLink } from '@/lib/links';
import { useNow, useUserClock } from '@/lib/time';
import { useTheme } from '@/theme/theme';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { EmptyState } from '@/ui/EmptyState';
import { ListRow } from '@/ui/ListRow';
import { Pressable } from '@/ui/Pressable';
import { SkeletonRows } from '@/ui/Skeleton';
import { Text } from '@/ui/Text';

const DAY_MS = 86_400_000;
/** How far ahead the calendar looks: two months, from the start of today. */
const AHEAD_DAYS = 62;

/** How far back Meetings looks (R83): the last month, for what's been. */
const BACK_DAYS = 31;

/**
 * The window asked for: from the start of this hour (a month before it, for Meetings), so the
 * key stays the same for an hour.
 */
function windowNow(now: Date, back: number): { from: string; to: string } {
  const start = new Date(now);
  start.setMinutes(0, 0, 0);
  return {
    from: new Date(start.getTime() - back * DAY_MS).toISOString(),
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

/** What's owed by a day (M14): a Pay card or an invoice, due that day rather than at a time. */
const owed = (item: CalendarItemView) => item.kind === 'payment_request' || item.kind === 'invoice';

function Row({
  item,
  timeZone,
  locale,
  now,
}: {
  item: CalendarItemView;
  timeZone: string;
  locale: string;
  now: Date;
}) {
  const t = useTheme();
  // A meeting or an appointment (R83, M16 F6): Join while one held here can be joined (its
  // conversation opens at the card and checks it before calling), Open for one on another
  // service.
  // A time of a repeating meeting still to be posted (R58) has no card to join or open yet.
  const held = item.projected ? null : calendarAction(item, now);
  const action =
    held === 'join' && item.conversationId && item.seq !== null
      ? {
          label: tr('Join'),
          testID: `calendar-join-${item.id}`,
          onPress: () =>
            router.navigate({
              pathname: '/c/[id]',
              params: { id: item.conversationId!, seq: String(item.seq), join: item.id },
            }),
        }
      : held === 'open' && item.place
        ? {
            label: tr('Open'),
            testID: `calendar-open-${item.id}`,
            onPress: () => openLink(meetingLink(item.place!)),
          }
        : null;
  const who = item.with?.displayName ?? item.org?.name ?? item.conversationTitle ?? null;
  const amount = item.amount ? formatAmount(item.amount.value, item.amount.currency, locale) : null;
  const repeat = REPEAT_CHOICES.find((c) => c.value === item.repeat);
  const line = [who, item.relationship?.label, item.place, amount, repeat ? tr(repeat.label) : null]
    .filter(Boolean)
    .join(' · ');
  const when = item.hasTime
    ? `${formatClock(item.at, timeZone, locale)}${item.endAt ? `–${formatClock(item.endAt, timeZone, locale)}` : ''}`
    : owed(item)
      ? tr('Due')
      : tr('All day');
  const state = STATE_LABEL[item.state];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingEnd: action ? 16 : 0 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={listed([item.title, when, line, state])}
        onPress={() =>
          item.conversationId
            ? router.navigate({ pathname: '/c/[id]', params: { id: item.conversationId } })
            : undefined
        }
        focusRadius={12}
        testID={`calendar-item-${item.id}`}
        style={({ hovered, pressed }) => ({
          flex: 1,
          minWidth: 0,
          flexDirection: 'row',
          gap: 12,
          paddingHorizontal: 16,
          paddingVertical: 10,
          marginHorizontal: 6,
          borderRadius: t.radii.md,
          backgroundColor: pressed
            ? t.c.surfacePressed
            : hovered
              ? t.c.surfaceHover
              : 'transparent',
        })}
      >
        <Text variant="mono" color="textTertiary" style={{ width: 112, paddingTop: 3 }}>
          {when}
        </Text>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text
              variant="bodyStrong"
              color={item.projected ? 'textSecondary' : undefined}
              numberOfLines={1}
              auto
              style={{ flexShrink: 1 }}
            >
              {item.title}
            </Text>
            {state ? (
              <Chip
                label={state}
                size="sm"
                tone={item.state === 'overdue' ? 'danger' : 'neutral'}
              />
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
      {action ? (
        <Button
          label={action.label}
          size="sm"
          variant="primary"
          onPress={action.onPress}
          testID={action.testID}
        />
      ) : null}
    </View>
  );
}

/**
 * The calendar, or with `meetings` (R83) Meetings: only the meetings and appointments (bookings
 * included, M16 F6), the last month's as well as what's ahead, each with its Join or its Open;
 * the bridges below are the calendar's alone.
 */
export function CalendarList({ meetings = false }: { meetings?: boolean } = {}) {
  const t = useTheme();
  const now = useNow();
  const { timeZone, locale } = useUserClock();
  // The window moves once an hour, so the query's key (and its cache) holds for an hour.
  const hour = Math.floor(now.getTime() / 3_600_000);
  const window = useMemo(
    () => windowNow(new Date(hour * 3_600_000), meetings ? BACK_DAYS : 0),
    [hour, meetings],
  );
  const q = useCalendar(window.from, window.to);
  // The other calendars (M17): each team's bookings, and the feed that puts this one in a
  // calendar app; one list, so none is a dead end.
  const teams = useBusinessSummary().data?.orgs ?? [];
  const sections = useMemo(() => {
    const byDay = new Map<string, CalendarItemView[]>();
    for (const item of q.data?.items ?? []) {
      // Meetings lists the meetings and appointments that are cards, bookings among them (M16
      // F6); the calendar looks further ahead (R58).
      if (meetings && ((item.kind !== 'meeting' && item.kind !== 'appointment') || item.projected))
        continue;
      const day = formatDayHeading(item.at, now, timeZone, locale);
      byDay.set(day, [...(byDay.get(day) ?? []), item]);
    }
    return [...byDay].map(([title, data]) => ({ title, data }));
  }, [q.data, now, timeZone, locale, meetings]);
  if (q.isPending && !q.data) return <SkeletonRows count={5} />;
  return (
    <SectionList
      sections={sections}
      keyExtractor={(x) => `${x.kind}-${x.id}`}
      renderItem={({ item }) => <Row item={item} timeZone={timeZone} locale={locale} now={now} />}
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
        meetings ? (
          <EmptyState
            character="lumi"
            expression="happy"
            icon={CalendarClock}
            title={tr('No meetings yet')}
            body={tr(
              'Meetings and appointments agreed in your conversations show here, with Join when it’s time.',
            )}
          />
        ) : (
          <EmptyState
            character="lumi"
            expression="happy"
            icon={CalendarClock}
            title={tr('Nothing coming up')}
            body={tr(
              'Meetings and appointments agreed in your conversations, and actions with a due date, show here by day.',
            )}
          />
        )
      }
      ListFooterComponent={
        meetings ? null : (
          <View style={{ paddingTop: sections.length ? 16 : 0, gap: 2 }} testID="calendar-bridges">
            {teams.map(({ org }) => (
              <ListRow
                key={org.id}
                icon={CalendarCheck}
                title={tr('{name} bookings', { name: org.name })}
                subtitle={tr('The appointments its customers asked for or confirmed')}
                chevron
                onPress={() =>
                  router.navigate({
                    pathname: '/o/[handle]/inbox',
                    params: { handle: org.handle, view: 'bookings' },
                  })
                }
                testID={`calendar-bookings-${org.handle}`}
              />
            ))}
            <ListRow
              icon={CalendarClock}
              title={tr('Meetings')}
              chevron
              onPress={() => router.navigate('/meetings')}
              testID="calendar-meetings-row"
            />
            <ListRow
              icon={CalendarDays}
              title={tr('In your calendar app')}
              subtitle={tr('A feed of this calendar, from Settings · Apps')}
              chevron
              onPress={() => router.navigate('/settings/apps')}
              testID="calendar-feed-row"
            />
          </View>
        )
      }
      contentContainerStyle={{
        paddingBottom: 32,
        backgroundColor: sections.length ? t.c.surface : undefined,
      }}
      testID={meetings ? 'meetings-list' : 'calendar-list'}
    />
  );
}

/** Meetings' list (R83): the calendar with only the meetings. */
export function MeetingsList() {
  return <CalendarList meetings />;
}
