import { tr } from '@caime/core/i18n';
import { router } from 'expo-router';
import Building from 'lucide-react-native/icons/building';
import { View } from 'react-native';
import { useFollowing } from '@/api/hooks';
import { useTheme } from '@/theme/theme';
import { Badge } from '@/ui/Badge';
import { Chevron } from '@/ui/directional';
import { Pressable } from '@/ui/Pressable';
import { Text } from '@/ui/Text';

/**
 * At the top of Chats for anyone who follows an organization: its updates are one row here,
 * never among their conversations (PRD §59), and never something that needs them.
 */
export function UpdatesRow() {
  const t = useTheme();
  const following = useFollowing().data?.following ?? [];
  if (following.length === 0) return null;
  const unread = following.reduce((n, f) => n + f.unread, 0);
  const news = following.filter((f) => f.unread);
  const first = news[0];
  // A name alone can be anyone's: one Caime hasn't verified says so (R15).
  const named = first ? `${first.org.name}${first.org.verified ? '' : ' (not verified)'}` : '';
  const line = first
    ? tr('New from {named}{text}', {
        named,
        text: news.length > 1 ? ` and ${news.length - 1} more` : '',
      })
    : tr('From {following} you follow', {
        following:
          following.length === 1 ? following[0]?.org.name : `${following.length} organizations`,
      });
  return (
    <View style={{ marginHorizontal: 6, marginBottom: 4 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={tr('Updates, {text}', {
          text: unread ? `${unread} new. ${line}` : `nothing new. ${line}`,
        })}
        onPress={() => router.navigate('/updates')}
        testID="updates-row"
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
        <View
          style={{
            width: 46,
            height: 46,
            borderRadius: 14,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: t.c.accentSoft,
          }}
        >
          <Building size={22} color={t.c.accentStrong} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text variant="bodyStrong">{tr('Updates')}</Text>
          <Text variant="caption" color="textSecondary" numberOfLines={1}>
            {line}
          </Text>
        </View>
        {unread ? <Badge count={unread} muted /> : null}
        <Chevron size={18} color={t.c.textTertiary} />
      </Pressable>
    </View>
  );
}
