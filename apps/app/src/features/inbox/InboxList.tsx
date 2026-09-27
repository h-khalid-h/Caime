import type { InboxItemView, InboxSectionView } from '@caishy/core/api';
import { router, usePathname } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, SectionList, View } from 'react-native';
import { useInbox, useInboxAll } from '@/api/hooks';
import { Character } from '@/brand/Character';
import { TeamInboxes } from '@/features/business/TeamInboxes';
import { ConnectionBanner } from '@/features/common/ConnectionBanner';
import { WaitingDevices } from '@/features/e2ee/parts';
import { privateSupported } from '@/features/e2ee/support';
import { PushPrompt } from '@/features/push/PushPrompt';
import { useBadges } from '@/features/shell/useBadges';
import { UpdatesRow } from '@/features/updates/UpdatesRow';
import { useNow, useUserClock } from '@/lib/time';
import { usePrefs } from '@/theme/prefs';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { EmptyState } from '@/ui/EmptyState';
import { IconButton } from '@/ui/IconButton';
import { Bell, ChevronDown, ChevronRight, Search, SquarePen, UserPlus } from '@/ui/icons';
import { useLayout } from '@/ui/layout';
import { Pressable } from '@/ui/Pressable';
import { PageHeader, Screen } from '@/ui/Screen';
import { Segmented } from '@/ui/Segmented';
import { SkeletonRows } from '@/ui/Skeleton';
import { Text } from '@/ui/Text';
import { ConversationRow } from './ConversationRow';
import { NewChatSheet } from './NewChatSheet';
import { RowActions } from './RowActions';

type View_ = 'attention' | 'all';
/** Sections that stay folded until opened: they never compete for attention (R14). */
const FOLDED = new Set(['requests', 'archived']);

export function InboxList({ pane }: { pane?: boolean }) {
  const t = useTheme();
  const { desktop } = useLayout();
  const pathname = usePathname();
  const selectedId = pathname.startsWith('/c/') ? pathname.slice(3) : null;
  const [view, setView] = useState<View_>('attention');
  const attention = useInbox();
  const all = useInboxAll();
  const q = view === 'attention' ? attention : all;
  const now = useNow();
  const { timeZone, locale } = useUserClock();
  const badges = useBadges();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [actionsFor, setActionsFor] = useState<InboxItemView | null>(null);
  const [newChat, setNewChat] = useState(false);
  const playful = usePrefs((p) => p.personality === 'playful');

  const sections = useMemo(() => {
    if (view === 'all') {
      const items = all.data?.conversations ?? [];
      return items.length ? [{ section: 'recent', label: '', items, data: items }] : [];
    }
    return (attention.data?.sections ?? []).map((s: InboxSectionView) => ({
      ...s,
      data: FOLDED.has(s.section) && !open[s.section] ? [] : s.items,
    }));
  }, [view, all.data, attention.data, open]);

  const onPress = useCallback((item: InboxItemView) => {
    router.navigate({ pathname: '/c/[id]', params: { id: item.id } });
  }, []);

  const headline = attention.data?.headline;
  const total = (attention.data?.sections ?? []).reduce((n, s) => n + s.items.length, 0);
  const empty = !q.isPending && total === 0;
  const caughtUp =
    !empty &&
    view === 'attention' &&
    !attention.data?.counts.needs_you &&
    !attention.data?.counts.important;

  const header = (
    <View>
      <PageHeader
        title="Chats"
        subtitle={caughtUp ? null : headline}
        right={
          <>
            {!desktop ? (
              <IconButton icon={Search} label="Search" onPress={() => router.push('/search')} />
            ) : null}
            {!desktop ? (
              <IconButton
                icon={Bell}
                label="Notifications"
                badge={badges.notifications > 0}
                onPress={() => router.push('/notifications')}
              />
            ) : null}
            <IconButton
              icon={SquarePen}
              label="New conversation"
              onPress={() => setNewChat(true)}
              testID="new-chat"
            />
          </>
        }
      />
      <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
        <Segmented
          label="Inbox view"
          value={view}
          onChange={setView}
          options={[
            { value: 'attention', label: 'Attention', count: attention.data?.counts.needs_you },
            { value: 'all', label: 'All' },
          ]}
        />
      </View>
      <ConnectionBanner />
      {privateSupported ? (
        <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          <WaitingDevices on />
        </View>
      ) : null}
      <PushPrompt />
      <TeamInboxes />
      <UpdatesRow />
      {caughtUp ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            marginHorizontal: 16,
            marginBottom: 4,
            paddingHorizontal: 12,
            paddingVertical: playful ? 6 : 10,
            borderRadius: 16,
            backgroundColor: t.c.successSoft,
          }}
        >
          {playful ? <Character name="momo" expression="happy" size={40} accents={false} /> : null}
          <Text variant="bodyStrong" color="success" style={{ flex: 1 }}>
            Nothing needs you right now. Enjoy it.
          </Text>
        </View>
      ) : null}
    </View>
  );

  const body =
    q.isPending && !q.data ? (
      <>
        {header}
        <SkeletonRows />
      </>
    ) : empty ? (
      <>
        {header}
        <EmptyState
          character="niko"
          expression="excited"
          title="Say hello to someone"
          body="Connect with the people you talk to. Caishy keeps family, friends and work each in the right place."
          icon={UserPlus}
          action={
            <Button label="Find people" icon={UserPlus} onPress={() => router.push('/connect')} />
          }
        />
      </>
    ) : (
      <SectionList
        sections={sections}
        keyExtractor={(i) => i.id}
        ListHeaderComponent={header}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshControl={
          <RefreshControl
            refreshing={q.isRefetching}
            onRefresh={() => void q.refetch()}
            tintColor={t.c.textSecondary}
          />
        }
        renderSectionHeader={({ section }) => {
          if (!section.label) return null;
          const folded = FOLDED.has(section.section);
          const count = 'items' in section ? section.items.length : 0;
          if (folded) {
            const isOpen = Boolean(open[section.section]);
            const Icon = isOpen ? ChevronDown : ChevronRight;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: isOpen }}
                onPress={() => setOpen((o) => ({ ...o, [section.section]: !o[section.section] }))}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingHorizontal: 22,
                  paddingTop: 16,
                  paddingBottom: 6,
                }}
              >
                <Icon size={16} color={t.c.textTertiary} />
                <Text variant="overline" color="textTertiary">
                  {section.section === 'requests'
                    ? `Message requests · ${count}`
                    : `${section.label} · ${count}`}
                </Text>
              </Pressable>
            );
          }
          return (
            <View style={{ paddingHorizontal: 22, paddingTop: 16, paddingBottom: 6 }}>
              <Text
                variant="overline"
                color={section.section === 'needs_you' ? 'accentStrong' : 'textTertiary'}
                accessibilityRole="header"
              >
                {section.label}
              </Text>
            </View>
          );
        }}
        renderItem={({ item }) => (
          <ConversationRow
            item={item}
            now={now}
            timeZone={timeZone}
            locale={locale}
            selected={pane && item.id === selectedId}
            onPress={onPress}
            onLongPress={setActionsFor}
          />
        )}
      />
    );

  const content = (
    <>
      {body}
      <RowActions item={actionsFor} onClose={() => setActionsFor(null)} />
      <NewChatSheet open={newChat} onClose={() => setNewChat(false)} />
    </>
  );
  if (pane) return <View style={{ flex: 1 }}>{content}</View>;
  return <Screen>{content}</Screen>;
}
