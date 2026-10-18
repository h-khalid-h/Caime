import { tr } from '@caime/core/i18n';
import { View } from 'react-native';
import { useTheme } from '@/theme/theme';
import { Text } from './Text';

/** Unread count. Muted conversations get a quiet grey badge instead of the accent. */
export function Badge({
  count,
  muted,
  mention,
  dot,
}: {
  count: number;
  muted?: boolean;
  mention?: boolean;
  /** Marked unread with nothing new (M16 E3b): a dot where the count would be. */
  dot?: boolean;
}) {
  const t = useTheme();
  if (count <= 0 && !mention && dot)
    return (
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={tr('Marked unread')}
        style={{
          width: 12,
          height: 12,
          borderRadius: 6,
          marginHorizontal: 5,
          backgroundColor: muted ? t.c.textTertiary : t.c.accentStrong,
        }}
        testID="badge-dot"
      />
    );
  if (count <= 0 && !mention) return null;
  const label = mention && count <= 0 ? '@' : count > 99 ? '99+' : String(count);
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={tr('{count} unread', { count })}
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
