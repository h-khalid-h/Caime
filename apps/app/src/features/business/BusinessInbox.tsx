import type { BusinessThreadView } from '@caime/core/api';
import {
  BUSINESS_VIEW_LABELS,
  BUSINESS_VIEWS,
  type BusinessView,
  waitedFor,
} from '@caime/core/business';
import { formatListTime } from '@caime/core/format';
import { msg, tr } from '@caime/core/i18n';
import { useQuery } from '@tanstack/react-query';
import { router, usePathname } from 'expo-router';
import Inbox from 'lucide-react-native/icons/inbox';
import SquarePen from 'lucide-react-native/icons/square-pen';
import { useEffect, useState } from 'react';
import { FlatList, View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { useBusinessSummary, useOrg, useOrgInbox } from '@/api/hooks';
import { qk } from '@/api/keys';
import { OrgMark } from '@/features/orgs/kinds';
import { DetailPlaceholder } from '@/features/shell/DetailPlaceholder';
import { useNow, useUserClock } from '@/lib/time';
import { useBusiness } from '@/state/business';
import { useTheme } from '@/theme/theme';
import { Avatar } from '@/ui/Avatar';
import { Badge } from '@/ui/Badge';
import { ChoiceChips } from '@/ui/Chip';
import { Back } from '@/ui/directional';
import { EmptyState } from '@/ui/EmptyState';
import { IconButton } from '@/ui/IconButton';
import { lazyPart } from '@/ui/Lazy';
import { useLayout } from '@/ui/layout';
import { Pressable } from '@/ui/Pressable';
import { Screen, TopBar } from '@/ui/Screen';
import { SkeletonRows } from '@/ui/Skeleton';
import { Text } from '@/ui/Text';
import { StateChip } from './states';
import { WriteFirstSheet } from './WriteFirstSheet';

/** The organization's bookings (R51) and orders (R60), each loaded when first shown. */
const OrgBookings = lazyPart(() => import('./OrgBookings').then((m) => m.OrgBookings));
const OrgOrders = lazyPart(() => import('./OrgOrders').then((m) => m.OrgOrders));

/** The inbox's own views, and the two lists of cards beside them. */
type InboxView = BusinessView | 'bookings' | 'orders';

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
  const person = thread.customer?.displayName ?? tr('Deleted account');
  // An organization writing through someone (R64) is named first, as the server titles it.
  const name = thread.customerOrg ? `${thread.customerOrg.name} · ${person}` : person;
  const last = thread.lastMessage;
  const preview = last
    ? last.fromCustomer
      ? last.preview
      : `${last.senderName ?? tr('Your team')}: ${last.preview}`
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
        borderRadius: t.radii.md,
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
          {/* The team's own tags on the customer (M16 H3): the first two, then how many more. */}
          {thread.customerTags.slice(0, 2).map((tag) => (
            <View
              key={tag}
              style={{
                paddingHorizontal: 6,
                paddingVertical: 1,
                borderRadius: t.radii.sm,
                backgroundColor: t.c.accentSoft,
                maxWidth: 120,
              }}
              testID="thread-tag"
            >
              <Text variant="captionStrong" color="accentStrong" numberOfLines={1} auto>
                {tag}
              </Text>
            </View>
          ))}
          {thread.customerTags.length > 2 ? (
            <Text variant="captionStrong" color="textTertiary">
              {`+${thread.customerTags.length - 2}`}
            </Text>
          ) : null}
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
export function BusinessInbox({
  handle,
  pane,
  initialView,
}: {
  handle: string;
  pane?: boolean;
  /** The view to open on (`?view=bookings` from someone's own calendar, M17). */
  initialView?: 'bookings' | 'orders';
}) {
  const { desktop } = useLayout();
  const pathname = usePathname();
  const open = pathname.startsWith('/c/') ? pathname.slice(3) : null;
  const org = useOrg(handle);
  const summary = org.data?.org;
  const [view, setView] = useState<InboxView>(initialView ?? 'customer_waiting');
  // A link to a view while the inbox is already open beside a conversation (the desktop's pane).
  useEffect(() => {
    if (initialView) setView(initialView);
  }, [initialView]);
  const [writing, setWriting] = useState(false);
  const cards = view === 'bookings' || view === 'orders';
  // Only customers the team tagged so (M16 H3), from the tags it uses.
  const [tag, setTag] = useState<string | null>(null);
  const tags =
    useQuery({
      queryKey: qk.customerTags(summary?.id ?? ''),
      queryFn: () => endpoints.customerTags(summary?.id ?? ''),
      enabled: Boolean(summary?.myRole) && !cards,
      staleTime: 60_000,
    }).data?.tags ?? [];
  const inbox = useOrgInbox(
    summary?.myRole ? summary.id : undefined,
    cards ? 'customer_waiting' : view,
    cards ? null : tag,
  );
  const openConversation = (conversationId: string) =>
    desktop
      ? router.navigate({ pathname: '/c/[id]', params: { id: conversationId, inbox: handle } })
      : router.push({ pathname: '/c/[id]', params: { id: conversationId } });
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
        <ChoiceChips
          label={tr('Teams')}
          value={handle}
          onChange={(next) =>
            router.replace({ pathname: '/o/[handle]/inbox', params: { handle: next } })
          }
          options={teams.map(({ org: team, waiting }) => ({
            value: team.handle,
            label: team.name,
            count: waiting && team.handle !== handle ? waiting : undefined,
            tone: waiting && team.handle !== handle ? ('warning' as const) : ('neutral' as const),
            accessibilityLabel: waiting
              ? tr('{name}, {waiting} waiting', { name: team.name, waiting })
              : tr('{name}, nobody waiting', { name: team.name }),
            testID: `inbox-team-${team.handle}`,
          }))}
          testID="inbox-teams"
        />
      ) : null}
      {/* The views, one radio each: in lines on a desktop (a wheel doesn't scroll sideways). */}
      <ChoiceChips<InboxView>
        label={tr('Show conversations')}
        value={view}
        onChange={setView}
        wrap={desktop}
        options={[
          ...BUSINESS_VIEWS.map((v) => {
            const n = counts?.[v] ?? 0;
            return {
              value: v,
              label:
                n && v !== 'resolved'
                  ? `${tr(BUSINESS_VIEW_LABELS[v])} · ${n}`
                  : tr(BUSINESS_VIEW_LABELS[v]),
              tone:
                v === 'customer_waiting' && n
                  ? ('warning' as const)
                  : v === 'escalated' && n
                    ? ('danger' as const)
                    : ('neutral' as const),
              testID: `inbox-view-${v}`,
            };
          }),
          { value: 'bookings' as const, label: tr('Bookings'), testID: 'business-view-bookings' },
          { value: 'orders' as const, label: tr('Orders'), testID: 'business-view-orders' },
        ]}
      />
      {!cards && (tags.length || tag) ? (
        <ChoiceChips
          label={tr('Tags')}
          value={tag}
          onChange={setTag}
          onClear={() => setTag(null)}
          size="sm"
          options={[
            ...(tag && !tags.some((x) => x.tag === tag) ? [{ tag, count: 0 }] : []),
            ...tags.slice(0, 12),
          ].map((x) => ({ value: x.tag, label: x.tag, testID: `inbox-tag-${x.tag}` }))}
          testID="inbox-tags"
        />
      ) : null}
      {view === 'bookings' ? (
        <OrgBookings orgId={summary?.id} org={summary} open={openConversation} />
      ) : view === 'orders' ? (
        <OrgOrders orgId={summary?.id} open={openConversation} />
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
            icon={Back}
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
