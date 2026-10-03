import { tr, trn } from '@caime/core/i18n';
import { router } from 'expo-router';
import { View } from 'react-native';
import { useBusinessSummary } from '@/api/hooks';
import { OrgMark } from '@/features/orgs/kinds';
import { useTheme } from '@/theme/theme';
import { Badge } from '@/ui/Badge';
import { ChevronRight } from '@/ui/icons';
import { Pressable } from '@/ui/Pressable';
import { Text } from '@/ui/Text';

/**
 * At the top of Chats for anyone on an organization's team: its inbox, and how many customers
 * are waiting on someone who could be you (R7). The customers' conversations live there, not
 * among your own.
 */
export function TeamInboxes() {
  const t = useTheme();
  const q = useBusinessSummary();
  const orgs = q.data?.orgs ?? [];
  if (orgs.length === 0) return null;
  return (
    <View style={{ marginHorizontal: 6, marginBottom: 4 }}>
      {orgs.map(({ org, waiting, mine }) => (
        <Pressable
          key={org.id}
          accessibilityRole="button"
          accessibilityLabel={tr('{name} inbox, {waiting} waiting', { name: org.name, waiting })}
          onPress={() =>
            router.navigate({ pathname: '/o/[handle]/inbox', params: { handle: org.handle } })
          }
          testID={`team-inbox-${org.handle}`}
          style={({ hovered, pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingHorizontal: 12,
            paddingVertical: 10,
            borderRadius: 14,
            backgroundColor: pressed
              ? t.c.surfacePressed
              : hovered
                ? t.c.surfaceHover
                : 'transparent',
          })}
        >
          <OrgMark kind={org.kind} url={org.avatarUrl} size={46} />
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text variant="bodyStrong" numberOfLines={1} auto>
              {tr('{name} inbox', { name: org.name })}
            </Text>
            <Text
              variant="caption"
              color={waiting ? 'warning' : 'textSecondary'}
              weight={waiting ? 600 : 500}
              numberOfLines={1}
            >
              {waiting
                ? trn(waiting, '{n} customer waiting', '{n} customers waiting')
                : tr('Nobody is waiting')}
              {mine ? tr(' · {mine} yours', { mine }) : ''}
            </Text>
          </View>
          <Badge count={waiting} />
          <ChevronRight size={18} color={t.c.textTertiary} />
        </Pressable>
      ))}
    </View>
  );
}
