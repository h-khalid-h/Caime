import type { SpaceSummaryView } from '@caishy/core/api';
import { formatListTime } from '@caishy/core/format';
import { SPACE_KIND_DEFS } from '@caishy/core/spaces';
import { router, usePathname } from 'expo-router';
import { FlatList, RefreshControl, ScrollView, View } from 'react-native';
import { useSpaces } from '@/api/hooks';
import { useNow, useUserClock } from '@/lib/time';
import { useTheme } from '@/theme/theme';
import { Badge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
import { EmptyState } from '@/ui/EmptyState';
import { IconButton } from '@/ui/IconButton';
import { LayoutGrid, Plus } from '@/ui/icons';
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
        SPACE_KIND_DEFS[s.kind].label,
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
              {SPACE_KIND_DEFS[s.kind].label} · {people}
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
  const pathname = usePathname();
  const selectedId = pathname.startsWith('/s/') ? pathname.slice(3) : null;
  const q = useSpaces();
  const spaces = q.data?.spaces ?? [];
  const header = (
    <PageHeader
      title="Spaces"
      subtitle={spaces.length ? `${spaces.length} space${spaces.length === 1 ? '' : 's'}` : null}
      right={
        <IconButton
          icon={Plus}
          label="Start a space"
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
          title="Keep a group together"
          body="A space holds a family, a team, a project or a club: its people, and conversations everyone can find."
          action={
            <Button label="Start a space" icon={Plus} onPress={() => router.push('/new-space')} />
          }
        />
      </ScrollView>
    ) : (
      <FlatList
        data={spaces}
        keyExtractor={(s) => s.id}
        ListHeaderComponent={header}
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
