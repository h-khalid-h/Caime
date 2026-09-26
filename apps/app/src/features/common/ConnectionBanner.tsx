import { View } from 'react-native';
import { useLive } from '@/state/live';
import { useOutbox } from '@/state/outbox';
import { useTheme } from '@/theme/theme';
import { WifiOff } from '@/ui/icons';
import { Text } from '@/ui/Text';

/** Says so when the device is offline or reconnecting, and how many messages are waiting. */
export function ConnectionBanner() {
  const t = useTheme();
  const connection = useLive((s) => s.connection);
  const queued = useOutbox((s) => s.items.filter((i) => i.status !== 'failed').length);
  if (connection === 'open' || connection === 'idle') return null;
  const offline = connection === 'offline';
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginHorizontal: 16,
        marginBottom: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 12,
        backgroundColor: offline ? t.c.warningSoft : t.c.surfaceMuted,
      }}
    >
      <WifiOff size={16} color={offline ? t.c.warning : t.c.textSecondary} />
      <Text variant="caption" color={offline ? 'warning' : 'textSecondary'} style={{ flex: 1 }}>
        {offline
          ? queued
            ? `Offline. ${queued} message${queued === 1 ? '' : 's'} will send when you’re back.`
            : 'Offline. Showing what’s on this device.'
          : 'Connecting…'}
      </Text>
    </View>
  );
}
