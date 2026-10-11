/**
 * An app's mark (R74): its icon as the developer uploaded it, drawn at the size it's shown
 * (R70: the server sends the rendition for it), else the mark of what it is: Caime's calendar,
 * a bridge, or a developer's app.
 */
import { Image } from 'expo-image';
import CalendarDays from 'lucide-react-native/icons/calendar-days';
import KeyRound from 'lucide-react-native/icons/key-round';
import LayoutGrid from 'lucide-react-native/icons/layout-grid';
import type { ComponentType } from 'react';
import { View } from 'react-native';
import { mediaHeaders, mediaUrl } from '@/api/client';
import { useTheme } from '@/theme/theme';

export function AppIcon({
  url,
  appId,
  name,
  size = 40,
  mark,
}: {
  url: string | null;
  /** A built-in's name picks its mark (`calendar`), `token` a personal token's; anything else is an app. */
  appId: string;
  name: string;
  size?: number;
  /**
   * A mark of the caller's, drawn as Caime's own (a bridge's, R79: the Apps screens pass the
   * icon, so it isn't in the chunk every screen with an app icon shares).
   */
  mark?: ComponentType<{ size: number; color: string }>;
}) {
  const t = useTheme();
  const src = mediaUrl(url);
  const radius = Math.round(size * 0.28);
  if (src)
    return (
      <Image
        source={{ uri: src, headers: mediaHeaders() }}
        accessibilityLabel={name}
        accessible
        contentFit="cover"
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor: t.c.surfaceMuted,
        }}
      />
    );
  const own = appId === 'calendar' || mark !== undefined;
  const Mark =
    mark ?? (appId === 'calendar' ? CalendarDays : appId === 'token' ? KeyRound : LayoutGrid);
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={name}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor: own ? t.c.accentSoft : t.c.surfaceMuted,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Mark size={Math.round(size * 0.5)} color={own ? t.c.accentStrong : t.c.textSecondary} />
    </View>
  );
}
