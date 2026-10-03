import type { InboxItemView, InboxSectionView } from '@caime/core/api';
import { tr } from '@caime/core/i18n';
import { SPHERE_DEFS, SPHERES, type Sphere } from '@caime/core/taxonomy';
import { router, usePathname } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, SectionList, View } from 'react-native';
import { useInbox, useInboxAll } from '@/api/hooks';
import { Character } from '@/brand/Character';
import { TeamInboxes } from '@/features/business/TeamInboxes';
import { ConnectionBanner } from '@/features/common/ConnectionBanner';
import { useMyDevices } from '@/features/e2ee/codes';
import { WaitingDevices } from '@/features/e2ee/parts';
import { privateSupported } from '@/features/e2ee/support';
import { PushPrompt } from '@/features/push/PushPrompt';
import { useBadges } from '@/features/shell/useBadges';
import { YouButton } from '@/features/shell/YouButton';
import { UpdatesRow } from '@/features/updates/UpdatesRow';
import { useNow, useUserClock } from '@/lib/time';
import { usePrefs } from '@/theme/prefs';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { ChoiceChips } from '@/ui/Chip';
import { EmptyState } from '@/ui/EmptyState';
import { IconButton } from '@/ui/IconButton';
import { Bell, ChevronDown, ChevronRight, SquarePen, UserPlus } from '@/ui/icons';
import { lazyPart, useOpened } from '@/ui/Lazy';
import { useLayout } from '@/ui/layout';
import { Pressable } from '@/ui/Pressable';
import { PageHeader, Screen } from '@/ui/Screen';
import { SkeletonRows } from '@/ui/Skeleton';
import { sphereIcon } from '@/ui/SphereIcon';
import { Text } from '@/ui/Text';
import { ConversationRow } from './ConversationRow';
import { RowActions } from './RowActions';

/** What Chats shows: what needs you first, everything, or one kind of relationship. */
type Show = 'attention' | 'all' | Sphere;
/** Starting a chat, loaded the first time it's asked for. */
const NewChatSheet = lazyPart(() => import('./NewChatSheet').then((m) => m.NewChatSheet));

/** Sections that stay folded until opened: they never compete for attention (R14). */
const FOLDED = new Set(['requests', 'archived']);

export function InboxList({ pane }: { pane?: boolean }) {
  const t = useTheme();
  const { desktop } = useLayout();
  const pathname = usePathname();
  const selectedId = pathname.startsWith('/c/') ? pathname.slice(3) : null;
  const [chosen, setShow] = useState<Show>('attention');
  const attention = useInbox();
  const all = useInboxAll();
  // A device of mine waiting to be approved is rare: its card (and the code it's in) loads only
  // when there is one, from the listing the launch's device check already made.
  const devices = useMyDevices(privateSupported);
  const waiting = Boolean(devices?.some((d) => !d.approved && !d.current));
  // A chip for each kind of relationship these conversations have, in the usual order.
  const spheres = useMemo(() => {
    const here = new Set((all.data?.conversations ?? []).map((c) => c.relationship?.sphere));
    return SPHERES.filter((s) => here.has(s));
  }, [all.data]);
  // One whose last conversation went shows everything again, and stays so: a conversation of
  // that kind coming back later doesn't take the list from under them.
  const gone = chosen !== 'attention' && chosen !== 'all' && !spheres.includes(chosen);
  useEffect(() => {
    if (gone && all.data) setShow('all');
  }, [gone, all.data]);
  const show: Show = gone ? 'all' : chosen;
  const view = show === 'attention' ? 'attention' : 'all';
  const sphere = show === 'attention' || show === 'all' ? null : show;
  const q = view === 'attention' ? attention : all;
  const now = useNow();
  const { timeZone, locale } = useUserClock();
  const badges = useBadges();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [actionsFor, setActionsFor] = useState<InboxItemView | null>(null);
  const [newChat, setNewChat] = useState(false);
  const chatOpened = useOpened(newChat);
  const playful = usePrefs((p) => p.personality === 'playful');

  const sections = useMemo(() => {
    if (view === 'all') {
      const items = (all.data?.conversations ?? []).filter(
        (c) => !sphere || c.relationship?.sphere === sphere,
      );
      return items.length ? [{ section: 'recent', label: '', items, data: items }] : [];
    }
    return (attention.data?.sections ?? []).map((s: InboxSectionView) => ({
      ...s,
      data: FOLDED.has(s.section) && !open[s.section] ? [] : s.items,
    }));
  }, [view, sphere, all.data, attention.data, open]);

  const onPress = useCallback((item: InboxItemView) => {
    router.navigate({ pathname: '/c/[id]', params: { id: item.id } });
  }, []);

  const headline = attention.data?.headline;
  const needsYou = attention.data?.counts.needs_you ?? 0;
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
        title={tr('Chats')}
        subtitle={caughtUp ? null : headline}
        left={desktop ? undefined : <YouButton />}
        right={
          <>
            {!desktop ? (
              <IconButton
                icon={Bell}
                label={tr('Notifications')}
                filled
                badge={badges.notifications > 0}
                onPress={() => router.push('/notifications')}
              />
            ) : null}
            <IconButton
              icon={SquarePen}
              label={tr('New conversation')}
              tone="primary"
              size={20}
              onPress={() => setNewChat(true)}
              testID="new-chat"
            />
          </>
        }
      />
      <ChoiceChips<Show>
        label={tr('Show conversations')}
        value={show}
        onChange={setShow}
        wrap={desktop}
        options={[
          {
            value: 'attention',
            label: needsYou ? tr('Attention · {needsYou}', { needsYou }) : tr('Attention'),
            accessibilityLabel: needsYou
              ? tr('Attention, {needsYou} {needs} you', {
                  needsYou,
                  needs: needsYou === 1 ? 'needs' : 'need',
                })
              : 'Attention',
            testID: 'inbox-attention',
          },
          { value: 'all', label: tr('All'), testID: 'inbox-all' },
          ...spheres.map((s) => ({
            value: s,
            label: tr(SPHERE_DEFS[s].plural),
            icon: sphereIcon(t.sphere(s).icon),
            testID: `inbox-${s}`,
          })),
        ]}
      />
      <ConnectionBanner />
      {waiting ? (
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
            {tr('Nothing needs you right now. Enjoy it.')}
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
          title={tr('Say hello to someone')}
          body={tr(
            'Connect with the people you talk to. Caime keeps family, friends and work each in the right place.',
          )}
          icon={UserPlus}
          action={
            <Button
              label={tr('Find people')}
              icon={UserPlus}
              onPress={() => router.push('/connect')}
            />
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
                    ? tr('Message requests · {count}', { count })
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
      {chatOpened ? <NewChatSheet open={newChat} onClose={() => setNewChat(false)} /> : null}
    </>
  );
  if (pane) return <View style={{ flex: 1 }}>{content}</View>;
  return <Screen>{content}</Screen>;
}
