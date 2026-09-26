import type { NotificationView } from '@caishy/core/api';
import { formatListTime } from '@caishy/core/format';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { FlatList, View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { useNotifications } from '@/api/hooks';
import { qk } from '@/api/keys';
import { useNow, useUserClock } from '@/lib/time';
import { useTheme } from '@/theme/theme';
import { Divider } from '@/ui/Card';
import { EmptyState } from '@/ui/EmptyState';
import { IconButton } from '@/ui/IconButton';
import { ArrowLeft, Bell, Zap } from '@/ui/icons';
import { useLayout } from '@/ui/layout';
import { Pressable } from '@/ui/Pressable';
import { Screen, TopBar } from '@/ui/Screen';
import { Text } from '@/ui/Text';

export default function Notifications() {
  const t = useTheme();
  const qc = useQueryClient();
  const { desktop } = useLayout();
  const q = useNotifications();
  const now = useNow();
  const { timeZone, locale } = useUserClock();
  const unread = q.data?.unread ?? 0;

  // Seeing the list is reading it.
  useEffect(() => {
    if (!unread) return;
    const timer = setTimeout(() => {
      void endpoints
        .markNotificationsRead({ all: true })
        .then(() => qc.invalidateQueries({ queryKey: qk.notifications }));
    }, 1500);
    return () => clearTimeout(timer);
  }, [unread, qc]);

  const open = (n: NotificationView) => {
    const conversationId = typeof n.data.conversationId === 'string' ? n.data.conversationId : null;
    const userId = typeof n.data.userId === 'string' ? n.data.userId : null;
    if (conversationId) router.navigate({ pathname: '/c/[id]', params: { id: conversationId } });
    else if (n.kind.startsWith('connection') && userId)
      router.navigate({ pathname: '/p/[id]', params: { id: userId } });
    else if (n.kind.includes('task') || n.kind.includes('reminder')) router.navigate('/actions');
  };

  return (
    <Screen edges={desktop ? [] : ['top']}>
      <TopBar
        left={
          !desktop ? (
            <IconButton
              icon={ArrowLeft}
              label="Back"
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
            />
          ) : null
        }
        title="Notifications"
      />
      <FlatList
        data={q.data?.notifications ?? []}
        keyExtractor={(n) => n.id}
        style={{ maxWidth: 760, width: '100%', alignSelf: 'center' }}
        ItemSeparatorComponent={() => <Divider inset={16} />}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            onPress={() => open(item)}
            style={({ hovered }) => ({
              flexDirection: 'row',
              gap: 12,
              padding: 16,
              backgroundColor: hovered ? t.c.surfaceHover : item.read ? 'transparent' : t.c.surface,
            })}
          >
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: item.level === 'urgency' ? t.c.dangerSoft : t.c.surfaceMuted,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {item.level === 'urgency' ? (
                <Zap size={18} color={t.c.danger} />
              ) : (
                <Bell size={18} color={t.c.textSecondary} />
              )}
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant={item.read ? 'body' : 'bodyStrong'}>{item.title}</Text>
              {item.body ? (
                <Text variant="caption" color="textSecondary" numberOfLines={2}>
                  {item.body}
                </Text>
              ) : null}
              {item.reason ? (
                <Text variant="caption" color="textTertiary">
                  Why: {item.reason}
                </Text>
              ) : null}
            </View>
            <Text variant="caption" color="textTertiary">
              {formatListTime(item.updatedAt, now, timeZone, locale)}
            </Text>
          </Pressable>
        )}
        ListEmptyComponent={
          q.isFetched ? (
            <EmptyState
              character="momo"
              expression="happy"
              icon={Bell}
              title="All quiet"
              body="Caishy only interrupts you for what matters, by the rules you set for each relationship."
            />
          ) : null
        }
      />
    </Screen>
  );
}
