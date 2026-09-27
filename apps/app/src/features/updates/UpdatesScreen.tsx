/**
 * Updates (PRD §59): the organizations this person follows, the latest first, apart from their
 * conversations. Each opens the organization's page, where its updates are.
 */
import type { FollowingView } from '@caishy/core/api';
import { formatListTime } from '@caishy/core/format';
import { router } from 'expo-router';
import { FlatList, RefreshControl, View } from 'react-native';
import { useFollowing } from '@/api/hooks';
import { OrgMark } from '@/features/orgs/kinds';
import { useNow, useUserClock } from '@/lib/time';
import { useTheme } from '@/theme/theme';
import { Badge } from '@/ui/Badge';
import { EmptyState } from '@/ui/EmptyState';
import { IconButton } from '@/ui/IconButton';
import { ArrowLeft, Building } from '@/ui/icons';
import { Pressable } from '@/ui/Pressable';
import { Screen, TopBar } from '@/ui/Screen';
import { SkeletonRows } from '@/ui/Skeleton';
import { Text } from '@/ui/Text';

function Row({ f }: { f: FollowingView }) {
  const t = useTheme();
  const now = useNow(60_000);
  const { timeZone, locale } = useUserClock();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[f.org.name, f.unread ? `${f.unread} new` : null]
        .filter(Boolean)
        .join(', ')}
      onPress={() => router.push({ pathname: '/o/[handle]', params: { handle: f.org.handle } })}
      focusRadius={12}
      testID="following-row"
    >
      {({ hovered, pressed }) => (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingHorizontal: 16,
            paddingVertical: 12,
            marginHorizontal: 6,
            borderRadius: 14,
            backgroundColor: pressed
              ? t.c.surfacePressed
              : hovered
                ? t.c.surfaceHover
                : 'transparent',
          }}
        >
          <OrgMark kind={f.org.kind} size={44} />
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text variant="bodyStrong" numberOfLines={1} style={{ flex: 1 }} auto>
                {f.org.name}
              </Text>
              {f.latest ? (
                <Text variant="caption" color="textTertiary">
                  {formatListTime(f.latest.createdAt, now, timeZone, locale)}
                </Text>
              ) : null}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text
                variant="caption"
                color={f.unread ? 'text' : 'textSecondary'}
                numberOfLines={2}
                style={{ flex: 1 }}
                auto
              >
                {f.latest?.body ?? 'Nothing posted yet.'}
              </Text>
              {f.unread ? <Badge count={f.unread} muted /> : null}
            </View>
          </View>
        </View>
      )}
    </Pressable>
  );
}

export function UpdatesScreen() {
  const q = useFollowing();
  const following = q.data?.following ?? [];
  return (
    <Screen>
      <TopBar
        left={
          <IconButton
            icon={ArrowLeft}
            label="Back"
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          />
        }
        title="Updates"
      />
      {q.isPending && !q.data ? (
        <SkeletonRows />
      ) : (
        <FlatList
          data={following}
          keyExtractor={(f) => f.org.id}
          renderItem={({ item }) => <Row f={item} />}
          refreshControl={
            <RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />
          }
          contentContainerStyle={{ paddingVertical: 8 }}
          ListEmptyComponent={
            <EmptyState
              icon={Building}
              title="Updates from organizations you follow"
              body="Follow an organization from its page, and what it posts shows here, apart from your conversations. Nobody sees who follows."
            />
          }
        />
      )}
    </Screen>
  );
}
