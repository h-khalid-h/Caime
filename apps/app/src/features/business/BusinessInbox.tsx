import type { BusinessThreadView } from '@caime/core/api';
import {
  BUSINESS_VIEW_LABELS,
  BUSINESS_VIEWS,
  type BusinessView,
  waitedFor,
} from '@caime/core/business';
import { formatListTime } from '@caime/core/format';
import { msg, tr } from '@caime/core/i18n';
import { router, usePathname } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, ScrollView, View } from 'react-native';
import { useBusinessSummary, useOrg, useOrgInbox } from '@/api/hooks';
import { OrgMark } from '@/features/orgs/kinds';
import { DetailPlaceholder } from '@/features/shell/DetailPlaceholder';
import { useNow, useUserClock } from '@/lib/time';
import { useBusiness } from '@/state/business';
import { useTheme } from '@/theme/theme';
import { Avatar } from '@/ui/Avatar';
import { Badge } from '@/ui/Badge';
import { Chip } from '@/ui/Chip';
import { EmptyState } from '@/ui/EmptyState';
import { IconButton } from '@/ui/IconButton';
import { ArrowLeft, Inbox, SquarePen } from '@/ui/icons';
import { lazyPart } from '@/ui/Lazy';
import { useLayout } from '@/ui/layout';
import { Pressable } from '@/ui/Pressable';
import { Screen, TopBar } from '@/ui/Screen';
import { SkeletonRows } from '@/ui/Skeleton';
import { Text } from '@/ui/Text';
import { StateChip } from './states';
import { WriteFirstSheet } from './WriteFirstSheet';

/** The organization's bookings (R51), loaded when first shown. */
const OrgBookings = lazyPart(() => import('./OrgBookings').then((m) => m.OrgBookings));

const EMPTY: Record<BusinessView, { title: string; body: string }> = {
  customer_waiting: {
    title: msg('Nobody is waiting'),
    body: msg('When a customer writes, their conversation comes here until someone answers.'),
  },
  new: {
    title: msg('Nothing new'),
    body: msg('Conversations nobody has answered yet show up here.'),
  },
  mine: {
    title: msg('Nothing is yours right now'),
    body: msg('Answer a conversation, or take one, and it’s yours.'),
  },
  waiting: {
    title: msg('No one to hear back from'),
    body: msg('Answered conversations wait here.'),
  },
  escalated: {
    title: msg('Nothing escalated'),
    body: msg('Conversations that need an owner or admin.'),
  },
  resolved: { title: msg('Nothing resolved yet'), body: msg('Resolved conversations stay here.') },
};

function ThreadRow({
  thread,
  active,
  onPress,
}: {
  thread: BusinessThreadView;
  active: boolean;
  onPress: () => void;
}) {
  const t = useTheme();
  const now = useNow();
  const { timeZone, locale } = useUserClock();
  const name = thread.customer?.displayName ?? tr('Deleted account');
  const last = thread.lastMessage;
  const preview = last
    ? last.fromCustomer
      ? last.preview
      : `${last.senderName ?? 'Your team'}: ${last.preview}`
    : '';
  const unread = thread.unreadCount > 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${thread.state.replace('_', ' ')}`}
      onPress={onPress}
      testID={`thread-row-${thread.customer?.handle ?? thread.conversationId}`}
      style={({ hovered, pressed }) => ({
        flexDirection: 'row',
        gap: 12,
        paddingHorizontal: 12,
        paddingVertical: 10,
        marginHorizontal: 6,
        borderRadius: 14,
        backgroundColor:
          active || pressed ? t.c.surfacePressed : hovered ? t.c.surfaceHover : 'transparent',
      })}
    >
      <Avatar
        id={thread.customer?.id ?? thread.conversationId}
        name={name}
        url={thread.customer?.avatarUrl ?? null}
        size={46}
      />
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text
            variant={unread ? 'label' : 'bodyStrong'}
            numberOfLines={1}
            style={{ flex: 1 }}
            auto
          >
            {name}
          </Text>
          <Text
            variant="caption"
            color={thread.waitingSince ? 'warning' : 'textTertiary'}
            weight={thread.waitingSince ? 600 : 500}
          >
            {thread.waitingSince
              ? waitedFor(thread.waitingSince, now)
              : formatListTime(thread.lastActivityAt, now, timeZone, locale)}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text
            variant="body"
            color={unread ? 'text' : 'textSecondary'}
            numberOfLines={1}
            style={{ flex: 1 }}
            auto
          >
            {preview}
          </Text>
          <Badge count={thread.unreadCount} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <StateChip
            state={thread.state}
            closed={thread.closed}
            request={thread.awaitingAcceptance}
          />
          <Text variant="caption" color="textTertiary" numberOfLines={1} style={{ flexShrink: 1 }}>
            {[
              // What its AI agent did first (PRD §75): a person still owes the customer an answer.
              thread.agentHandedOverAt && !thread.resolvedAt
                ? tr('Handed over by AI')
                : last?.fromAgent
                  ? tr('Answered by AI')
                  : null,
              thread.assignee ? thread.assignee.displayName : tr('Nobody has it'),
              thread.customerUnder18 ? tr('Under 18') : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

/**
 * An organization's Business inbox (PRD §38): its customers' conversations by what they need,
 * longest wait first. On desktop it's the shell's list pane (`pane`), and a conversation opens
 * beside it through its own route, as Chats does; on phones it's a screen of its own.
 */
export function BusinessInbox({ handle, pane }: { handle: string; pane?: boolean }) {
  const { desktop } = useLayout();
  const pathname = usePathname();
  const open = pathname.startsWith('/c/') ? pathname.slice(3) : null;
  const org = useOrg(handle);
  const summary = org.data?.org;
  const [view, setView] = useState<BusinessView | 'bookings'>('customer_waiting');
  const [writing, setWriting] = useState(false);
  const inbox = useOrgInbox(
    summary?.myRole ? summary.id : undefined,
    view === 'bookings' ? 'customer_waiting' : view,
  );
  const threads = inbox.data?.threads ?? [];
  const counts = inbox.data?.counts;
  // On several teams: each is a step away, and the rail comes back to this one.
  const teams = useBusinessSummary().data?.orgs ?? [];
  const opened = useBusiness((s) => s.opened);
  useEffect(() => {
    if (summary?.myRole) opened(handle);
  }, [handle, summary?.myRole, opened]);

  // On desktop the list is the shell's pane; the route itself is the empty detail beside it.
  if (desktop && !pane)
    return (
      <DetailPlaceholder
        character="pico"
        icon={Inbox}
        title={tr('Pick a conversation')}
        body={tr('Customers waiting longest are at the top.')}
      />
    );

  if (org.isError || (summary && !summary.myRole))
    return (
      <Screen edges={desktop ? [] : ['top', 'bottom']}>
        <TopBar title={tr('Inbox')} />
        <EmptyState
          title={tr('This inbox isn’t yours')}
          body={tr('Only an organization’s team sees its conversations.')}
        />
      </Screen>
    );

  const list = (
    <View style={{ flex: 1 }}>
      {teams.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0 }}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, gap: 8 }}
          accessibilityRole="tablist"
          accessibilityLabel={tr('Teams')}
          testID="inbox-teams"
        >
          {teams.map(({ org: team, waiting }) => (
            <Chip
              key={team.id}
              label={waiting && team.handle !== handle ? `${team.name} · ${waiting}` : team.name}
              selected={team.handle === handle}
              role="radio"
              tone={waiting && team.handle !== handle ? 'warning' : 'neutral'}
              accessibilityLabel={
                waiting
                  ? tr('{name}, {waiting} waiting', { name: team.name, waiting })
                  : tr('{name}, nobody waiting', { name: team.name })
              }
              onPress={() =>
                team.handle === handle
                  ? undefined
                  : router.replace({
                      pathname: '/o/[handle]/inbox',
                      params: { handle: team.handle },
                    })
              }
              testID={`inbox-team-${team.handle}`}
            />
          ))}
        </ScrollView>
      ) : null}
      <View style={{ paddingVertical: 8 }}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
        >
          {BUSINESS_VIEWS.map((v) => {
            const n = counts?.[v] ?? 0;
            return (
              <Chip
                key={v}
                label={
                  n && v !== 'resolved'
                    ? `${tr(BUSINESS_VIEW_LABELS[v])} · ${n}`
                    : tr(BUSINESS_VIEW_LABELS[v])
                }
                selected={view === v}
                tone={
                  v === 'customer_waiting' && n
                    ? 'warning'
                    : v === 'escalated' && n
                      ? 'danger'
                      : 'neutral'
                }
                onPress={() => setView(v)}
                testID={`inbox-view-${v}`}
              />
            );
          })}
          <Chip
            label={tr('Bookings')}
            selected={view === 'bookings'}
            onPress={() => setView('bookings')}
            testID="business-view-bookings"
          />
        </ScrollView>
      </View>
      {view === 'bookings' ? (
        <OrgBookings
          orgId={summary?.id}
          open={(conversationId) =>
            desktop
              ? router.navigate({
                  pathname: '/c/[id]',
                  params: { id: conversationId, inbox: handle },
                })
              : router.push({ pathname: '/c/[id]', params: { id: conversationId } })
          }
        />
      ) : inbox.isPending && !inbox.data ? (
        <SkeletonRows />
      ) : (
        <FlatList
          data={threads}
          keyExtractor={(x) => x.conversationId}
          renderItem={({ item }) => (
            <ThreadRow
              thread={item}
              active={desktop && open === item.conversationId}
              onPress={() =>
                desktop
                  ? // The inbox stays beside it: the shell reads `inbox` (features/shell/sections).
                    router.navigate({
                      pathname: '/c/[id]',
                      params: { id: item.conversationId, inbox: handle },
                    })
                  : router.push({ pathname: '/c/[id]', params: { id: item.conversationId } })
              }
            />
          )}
          ListEmptyComponent={
            <EmptyState
              compact
              icon={Inbox}
              character="pico"
              expression="happy"
              title={tr(EMPTY[view as BusinessView].title)}
              body={tr(EMPTY[view as BusinessView].body)}
            />
          }
          contentContainerStyle={{ paddingBottom: 24 }}
        />
      )}
    </View>
  );

  const header = (
    <TopBar
      right={
        summary?.myRole ? (
          <IconButton
            icon={SquarePen}
            label={tr('Write to someone')}
            onPress={() => setWriting(true)}
            testID="business-write-first"
          />
        ) : undefined
      }
      left={
        desktop ? undefined : (
          <IconButton
            icon={ArrowLeft}
            label={tr('Back')}
            onPress={() =>
              router.canGoBack()
                ? router.back()
                : router.replace({ pathname: '/o/[handle]', params: { handle } })
            }
          />
        )
      }
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={tr('{name}, profile', { name: summary?.name ?? '' })}
        onPress={() => router.push({ pathname: '/o/[handle]', params: { handle } })}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
      >
        {summary ? <OrgMark kind={summary.kind} url={summary.avatarUrl} size={34} /> : null}
        <View>
          <Text variant="label" numberOfLines={1}>
            {tr('Inbox')}
          </Text>
          <Text variant="caption" color="textSecondary" numberOfLines={1}>
            {summary?.name ?? ''}
          </Text>
        </View>
      </Pressable>
    </TopBar>
  );

  const write = summary ? (
    <WriteFirstSheet org={summary} open={writing} onClose={() => setWriting(false)} />
  ) : null;
  if (pane)
    return (
      <View style={{ flex: 1 }}>
        {header}
        {list}
        {write}
      </View>
    );
  return (
    <Screen edges={['top', 'bottom']}>
      {header}
      {list}
      {write}
    </Screen>
  );
}
