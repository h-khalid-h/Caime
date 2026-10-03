import type { SpaceSummaryView } from '@caime/core/api';
import { formatListTime } from '@caime/core/format';
import { tr, trn } from '@caime/core/i18n';
import { SPACE_KIND_DEFS } from '@caime/core/spaces';
import { router, usePathname } from 'expo-router';
import { useState } from 'react';
import { FlatList, RefreshControl, ScrollView, View } from 'react-native';
import { useSpaces } from '@/api/hooks';
import { YouButton } from '@/features/shell/YouButton';
import { useNow, useUserClock } from '@/lib/time';
import { useTheme } from '@/theme/theme';
import { Badge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { EmptyState } from '@/ui/EmptyState';
import { IconButton } from '@/ui/IconButton';
import { LayoutGrid, Plus } from '@/ui/icons';
import { useLayout } from '@/ui/layout';
import { Pressable } from '@/ui/Pressable';
import { PageHeader, Screen } from '@/ui/Screen';
import { SkeletonRows } from '@/ui/Skeleton';
import { Text } from '@/ui/Text';
import { SPACE_ICONS } from './kinds';

function SpaceRow({ s, selected }: { s: SpaceSummaryView; selected: boolean }) {
  const t = useTheme();
  const now = useNow();
  const { timeZone, locale } = useUserClock();
  const Icon = SPACE_ICONS[s.kind];
  const people = `${s.memberCount} ${s.memberCount === 1 ? 'person' : 'people'}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[
        s.name,
        tr(SPACE_KIND_DEFS[s.kind].label),
        s.org?.name ?? '',
        people,
        s.unreadCount ? `${s.unreadCount} unread` : '',
      ]
        .filter(Boolean)
        .join(', ')}
      onPress={() => router.navigate({ pathname: '/s/[id]', params: { id: s.id } })}
      focusRadius={12}
      testID={`space-row-${s.name}`}
    >
      {({ hovered, pressed }) => (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingHorizontal: 16,
            paddingVertical: 10,
            marginHorizontal: 6,
            borderRadius: 14,
            backgroundColor:
              selected || pressed ? t.c.surfacePressed : hovered ? t.c.surfaceHover : 'transparent',
          }}
        >
          <View
            style={{
              width: 46,
              height: 46,
              borderRadius: 14,
              backgroundColor: t.c.accentSoft,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon size={22} color={t.c.accentStrong} />
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text variant="bodyStrong" numberOfLines={1} auto>
              {s.name}
            </Text>
            <Text variant="caption" color="textSecondary" numberOfLines={1}>
              {[tr(SPACE_KIND_DEFS[s.kind].label), s.org?.name, people].filter(Boolean).join(' · ')}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 4 }}>
            <Text variant="caption" color="textTertiary">
              {formatListTime(s.lastActivityAt, now, timeZone, locale)}
            </Text>
            <Badge count={s.unreadCount} />
          </View>
        </View>
      )}
    </Pressable>
  );
}

/** Your spaces (PRD §40): families, teams, projects and communities, busiest first. */
export function SpacesList({ pane }: { pane?: boolean }) {
  const { desktop } = useLayout();
  const pathname = usePathname();
  const selectedId = pathname.startsWith('/s/') ? pathname.slice(3) : null;
  const q = useSpaces();
  const spaces = q.data?.spaces ?? [];
  // Whose they are: yours, and each organization's (R43). Offered only once they span owners,
  // from the list itself, so someone on several teams sees one team's at a time.
  const [owner, setOwner] = useState<'all' | 'me' | string>('all');
  const orgs = [...new Map(spaces.flatMap((s) => (s.org ? [[s.org.id, s.org]] : []))).values()];
  const mine = spaces.some((s) => !s.org);
  const owners = orgs.length ? [...(mine ? (['me'] as const) : []), ...orgs.map((o) => o.id)] : [];
  const chosen = owner === 'all' || owners.includes(owner) ? owner : 'all';
  const shown =
    chosen === 'all'
      ? spaces
      : spaces.filter((s) => (chosen === 'me' ? !s.org : s.org?.id === chosen));
  const ownerRow = owners.length ? (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ flexGrow: 0 }}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8, gap: 8 }}
      accessibilityRole="tablist"
      accessibilityLabel={tr('Whose spaces')}
      testID="spaces-owner"
    >
      <Chip
        label={tr('All')}
        selected={chosen === 'all'}
        role="radio"
        onPress={() => setOwner('all')}
        testID="spaces-owner-all"
      />
      {mine ? (
        <Chip
          label={tr('Mine')}
          selected={chosen === 'me'}
          role="radio"
          onPress={() => setOwner('me')}
          testID="spaces-owner-me"
        />
      ) : null}
      {orgs.map((o) => (
        <Chip
          key={o.id}
          label={o.name}
          selected={chosen === o.id}
          role="radio"
          onPress={() => setOwner(o.id)}
          testID={`spaces-owner-${o.handle}`}
        />
      ))}
    </ScrollView>
  ) : null;
  const header = (
    <PageHeader
      title={tr('Spaces')}
      subtitle={spaces.length ? trn(spaces.length, '{n} space', '{n} spaces') : null}
      left={desktop ? undefined : <YouButton />}
      right={
        <IconButton
          icon={Plus}
          label={tr('Start a space')}
          tone="primary"
          size={20}
          onPress={() => router.push('/new-space')}
          testID="spaces-new"
        />
      }
    />
  );
  const content =
    q.isPending && !q.data ? (
      <>
        {header}
        <SkeletonRows />
      </>
    ) : spaces.length === 0 ? (
      <ScrollView>
        {header}
        <EmptyState
          character="lumi"
          expression="happy"
          icon={LayoutGrid}
          title={tr('Keep a group together')}
          body={tr(
            'A space holds a family, a team, a project or a club: its people, and conversations everyone can find.',
          )}
          action={
            <Button
              label={tr('Start a space')}
              icon={Plus}
              onPress={() => router.push('/new-space')}
            />
          }
        />
      </ScrollView>
    ) : (
      <FlatList
        data={shown}
        keyExtractor={(s) => s.id}
        ListHeaderComponent={
          <>
            {header}
            {ownerRow}
          </>
        }
        renderItem={({ item }) => (
          <SpaceRow s={item} selected={Boolean(pane && selectedId === item.id)} />
        )}
        refreshControl={
          <RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />
        }
        contentContainerStyle={{ paddingBottom: 24 }}
      />
    );
  if (pane) return <View style={{ flex: 1 }}>{content}</View>;
  return <Screen>{content}</Screen>;
}
