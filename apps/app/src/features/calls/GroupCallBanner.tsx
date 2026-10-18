import { joinNames } from '@caime/core/format';
import { tr } from '@caime/core/i18n';
import Phone from 'lucide-react-native/icons/phone';
import Video from 'lucide-react-native/icons/video';
import { useEffect } from 'react';
import { View } from 'react-native';
import { useGroupCall } from '@/state/groupCall';
import { useMe } from '@/state/session';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { Text } from '@/ui/Text';
import { checkGroupCallIn, groupCallsSupported, joinGroupCall } from './calls';

/**
 * While a call is on in a group, its conversation says so and offers to join it: who's in it,
 * and Join (or Join here, when this person is in it on another device).
 */
export function GroupCallBanner({ conversationId }: { conversationId: string }) {
  const t = useTheme();
  const me = useMe();
  const on = useGroupCall((s) => s.on[conversationId]);
  const held = useGroupCall((s) => (s.phase && s.phase !== 'ended' ? s.call?.id : null));
  useEffect(() => {
    if (groupCallsSupported) void checkGroupCallIn(conversationId);
  }, [conversationId]);
  if (!groupCallsSupported || !on || on.state === 'ended' || held === on.id) return null;
  const joined = on.members.filter((m) => m.state === 'joined');
  if (!joined.length) return null;
  const elsewhere = joined.some((m) => m.person.id === me?.id);
  const names = joined
    .filter((m) => m.person.id !== me?.id)
    .map((m) => m.person.displayName.split(' ')[0] ?? m.person.displayName);
  const Icon = on.kind === 'video' ? Video : Phone;
  return (
    <View
      testID="group-call-banner"
      accessibilityLiveRegion="polite"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginHorizontal: 16,
        marginBottom: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: t.radii.sm,
        backgroundColor: t.c.successSoft,
      }}
    >
      <Icon size={16} color={t.c.success} />
      <Text variant="caption" style={{ flex: 1 }} numberOfLines={2}>
        {elsewhere
          ? tr('You’re in this call on another device.')
          : on.kind === 'video'
            ? tr('Video call on · {names}', { names: joinNames(names) })
            : tr('Voice call on · {names}', { names: joinNames(names) })}
      </Text>
      <Button
        label={elsewhere ? tr('Join here') : tr('Join')}
        size="sm"
        onPress={() => void joinGroupCall(on)}
        testID="group-call-banner-join"
      />
    </View>
  );
}
