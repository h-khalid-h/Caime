/**
 * Updates (PRD §59): the organizations this person follows, the latest first, apart from their
 * conversations. Each opens the organization's page, where its updates are.
 */
import type { FollowingView } from '@caime/core/api';
import { formatListTime } from '@caime/core/format';
import { router } from 'expo-router';
import { FlatList, RefreshControl, View } from 'react-native';
import { useFollowing } from '@/api/hooks';
import { OrgMark, VerifiedLine } from '@/features/orgs/kinds';
import { useNow, useUserClock } from '@/lib/time';
import { useTheme } from '@/theme/theme';
import { Badge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
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
  const when = f.latest ? formatListTime(f.latest.createdAt, now, timeZone, locale) : null;
  return (
    <Pressable
      accessibilityRole="button"
      // What the row shows, said: a button's label is all a screen reader reads of it.
      accessibilityLabel={[
        f.org.name,
        f.org.verified ? `verified, ${f.org.verifiedDomain}` : 'not verified yet',
        f.unread ? `${f.unread} new` : null,
        f.latest ? `${when}, ${f.latest.body.slice(0, 200)}` : 'Nothing posted yet',
      ]
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
          <OrgMark kind={f.org.kind} url={f.org.avatarUrl} size={44} />
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text variant="bodyStrong" numberOfLines={1} style={{ flex: 1 }} auto>
                {f.org.name}
              </Text>
              {when ? (
                <Text variant="caption" color="textTertiary">
                  {when}
                </Text>
              ) : null}
            </View>
            {/* Who it is, as everywhere an organization is shown (R15): a name alone can be anyone's. */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text variant="caption" color="textTertiary" numberOfLines={1}>
                @{f.org.handle}
              </Text>
              <VerifiedLine org={f.org} />
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
      ) : q.isError && !q.data ? (
        <EmptyState
          icon={Building}
          title="Updates didn’t load"
          body="Check your connection, then try again."
          action={<Button label="Try again" variant="secondary" onPress={() => void q.refetch()} />}
        />
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
