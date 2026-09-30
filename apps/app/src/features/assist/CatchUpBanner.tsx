import { View } from 'react-native';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { IconButton } from '@/ui/IconButton';
import { Sparkles, X } from '@/ui/icons';
import { Text } from '@/ui/Text';

/** Opened a conversation with a lot unread: offer to catch up instead of scrolling. */
export const CATCH_UP_AFTER = 10;

export function CatchUpBanner({
  count,
  onCatchUp,
  onDismiss,
}: {
  count: number;
  onCatchUp: () => void;
  onDismiss: () => void;
}) {
  const t = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingStart: 16,
        paddingEnd: 6,
        paddingVertical: 6,
        backgroundColor: t.c.accentSoft,
      }}
    >
      <Sparkles size={16} color={t.c.accentStrong} />
      <Text variant="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>
        {count} new messages
      </Text>
      <Button
        label="Catch me up"
        size="sm"
        variant="secondary"
        onPress={onCatchUp}
        testID="catch-up-banner"
      />
      <IconButton icon={X} label="Not now" onPress={onDismiss} size={18} />
    </View>
  );
}
