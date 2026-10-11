/**
 * An organization's orders (R60): the Order cards in its customer conversations, newest first,
 * so the team sees what's placed, ready or shipped in one list. Each opens the conversation,
 * where the card is moved on: the order lives there, never here.
 */
import type { OrgOrderView } from '@caime/core/api';
import { formatAmount, formatWhen } from '@caime/core/format';
import { tr } from '@caime/core/i18n';
import { kitStateLabel, kitStateTone } from '@caime/core/kit-states';
import { useQuery } from '@tanstack/react-query';
import ShoppingBag from 'lucide-react-native/icons/shopping-bag';
import { FlatList, RefreshControl, View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { useNow, useUserClock } from '@/lib/time';
import { useTheme } from '@/theme/theme';
import { Avatar } from '@/ui/Avatar';
import { Chip } from '@/ui/Chip';
import { EmptyState } from '@/ui/EmptyState';
import { Pressable } from '@/ui/Pressable';
import { SkeletonRows } from '@/ui/Skeleton';
import { Text } from '@/ui/Text';

const TONES = { positive: 'success', negative: 'danger', neutral: 'neutral' } as const;

export function OrgOrders({
  orgId,
  open,
}: {
  orgId: string | undefined;
  open: (conversationId: string) => void;
}) {
  const t = useTheme();
  const now = useNow();
  const { timeZone, locale } = useUserClock();
  const q = useQuery({
    queryKey: qk.orgOrders(orgId ?? ''),
    queryFn: () => endpoints.orgOrders(orgId ?? ''),
    enabled: Boolean(orgId),
  });
  if (q.isPending && !q.data) return <SkeletonRows count={4} />;
  return (
    <FlatList
      data={q.data?.orders ?? []}
      keyExtractor={(x) => x.messageId}
      renderItem={({ item }: { item: OrgOrderView }) => {
        const name = item.customer?.displayName ?? tr('Deleted account');
        const state = tr(kitStateLabel(item.state));
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${name}, ${item.reference ?? item.summary ?? ''}, ${state}`}
            onPress={() => open(item.conversationId)}
            focusRadius={12}
            testID={`order-${item.messageId}`}
            style={({ hovered, pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
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
            {item.customer ? (
              <Avatar id={item.customer.id} name={item.customer.displayName} url={null} size={32} />
            ) : null}
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text variant="bodyStrong" numberOfLines={1} auto>
                {name}
              </Text>
              <Text variant="caption" color="textSecondary" numberOfLines={1} auto>
                {[
                  item.reference,
                  item.summary,
                  item.amount
                    ? formatAmount(item.amount.value, item.amount.currency, locale)
                    : null,
                  formatWhen(item.createdAt, now, timeZone, locale),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </View>
            <Chip label={state} size="sm" tone={TONES[kitStateTone(item.state)]} />
          </Pressable>
        );
      }}
      refreshControl={
        <RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />
      }
      ListEmptyComponent={
        <EmptyState
          compact
          icon={ShoppingBag}
          title={tr('No orders yet')}
          body={tr('Orders placed in your customer conversations show here, newest first.')}
        />
      }
      contentContainerStyle={{ paddingBottom: 24 }}
      testID="org-orders"
    />
  );
}
