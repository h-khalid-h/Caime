import { avatarColors } from '@caime/brand/tokens';
import type { PresenceState } from '@caime/core/api';
import { initials } from '@caime/core/format';
import { Image } from 'expo-image';
import { memo } from 'react';
import { View } from 'react-native';
import { mediaHeaders, mediaUrl } from '@/api/client';
import { useTheme } from '@/theme/theme';
import { Text } from './Text';

export interface AvatarProps {
  id: string;
  name: string;
  url?: string | null;
  size?: number;
  presence?: PresenceState | null;
  /** A ring in the relationship's colour. */
  ring?: string | null;
}

export const Avatar = memo(function Avatar({
  id,
  name,
  url,
  size = 44,
  presence,
  ring,
}: AvatarProps) {
  const t = useTheme();
  const colors = avatarColors(id);
  const src = mediaUrl(url);
  const dot = Math.max(10, Math.round(size * 0.28));
  const presenceColor =
    presence === 'online'
      ? t.c.success
      : presence === 'busy'
        ? t.c.danger
        : presence === 'away'
          ? t.c.warning
          : null;
  return (
    <View accessibilityRole="image" accessibilityLabel={name} style={{ width: size, height: size }}>
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          overflow: 'hidden',
          backgroundColor: t.scheme === 'dark' ? t.c.surfaceMuted : colors.bg,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: ring ? 2 : 0,
          borderColor: ring ?? 'transparent',
        }}
      >
        {src ? (
          <Image
            source={{ uri: src, headers: mediaHeaders() }}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
            transition={120}
            cachePolicy="memory-disk"
            recyclingKey={src}
            accessible={false}
          />
        ) : (
          <Text
            variant={size >= 64 ? 'title' : 'label'}
            color={t.scheme === 'dark' ? t.c.ink : colors.fg}
            style={{ fontSize: Math.round(size * 0.38), lineHeight: Math.round(size * 0.46) }}
            maxFontSizeMultiplier={1}
          >
            {initials(name)}
          </Text>
        )}
      </View>
      {presenceColor ? (
        <View
          accessibilityLabel={presence ?? undefined}
          style={{
            position: 'absolute',
            right: 0,
            bottom: 0,
            width: dot,
            height: dot,
            borderRadius: dot / 2,
            backgroundColor: presenceColor,
            borderWidth: 2,
            borderColor: t.c.surface,
          }}
        />
      ) : null}
    </View>
  );
});
