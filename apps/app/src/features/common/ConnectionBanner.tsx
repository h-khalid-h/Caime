import { tr, trn } from '@caime/core/i18n';
import { View } from 'react-native';
import { useLive } from '@/state/live';
import { useOutbox } from '@/state/outbox';
import { useTaskOutbox } from '@/state/taskOutbox';
import { useTheme } from '@/theme/theme';
import { WifiOff } from '@/ui/icons';
import { Text } from '@/ui/Text';

/** "2 messages and 1 action": what's waiting to go. */
export function waitingText(messages: number, actions: number): string {
  return [
    messages ? trn(messages, '{n} message', '{n} messages') : null,
    actions ? trn(actions, '{n} action', '{n} actions') : null,
  ]
    .filter(Boolean)
    .join(' and ');
}

/** Says so when the device is offline or reconnecting, and what's waiting to go. */
export function ConnectionBanner() {
  const t = useTheme();
  const connection = useLive((s) => s.connection);
  const queued = useOutbox((s) => s.items.filter((i) => i.status !== 'failed').length);
  const actions = useTaskOutbox((s) => s.ops.filter((o) => o.state !== 'failed').length);
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
          ? queued || actions
            ? tr('Offline. {waitingText} will go when you’re back.', {
                waitingText: waitingText(queued, actions),
              })
            : tr('Offline. Showing what’s on this device.')
          : tr('Connecting…')}
      </Text>
    </View>
  );
}
