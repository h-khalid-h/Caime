import { View } from 'react-native';
import { useTheme } from '@/theme/theme';
import { Text } from './Text';

/** Unread count. Muted conversations get a quiet grey badge instead of the accent. */
export function Badge({
  count,
  muted,
  mention,
}: {
  count: number;
  muted?: boolean;
  mention?: boolean;
}) {
  const t = useTheme();
  if (count <= 0 && !mention) return null;
  const label = mention && count <= 0 ? '@' : count > 99 ? '99+' : String(count);
  return (
    <View
      accessibilityLabel={`${count} unread`}
      style={{
        minWidth: 22,
        height: 22,
        paddingHorizontal: 6,
        borderRadius: 11,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: muted ? t.c.surfaceMuted : t.c.accentStrong,
      }}
    >
      <Text
        variant="captionStrong"
        color={muted ? t.c.textSecondary : t.c.onAccentStrong}
        maxFontSizeMultiplier={1.2}
      >
        {label}
      </Text>
    </View>
  );
}
