/**
 * An app's mark (R74): its icon as the developer uploaded it, drawn at the size it's shown
 * (R70: the server sends the rendition for it), else the mark of what it is: Caime's calendar,
 * or a developer's app.
 */
import { Image } from 'expo-image';
import CalendarDays from 'lucide-react-native/icons/calendar-days';
import LayoutGrid from 'lucide-react-native/icons/layout-grid';
import { View } from 'react-native';
import { mediaHeaders, mediaUrl } from '@/api/client';
import { useTheme } from '@/theme/theme';

export function AppIcon({
  url,
  appId,
  name,
  size = 40,
}: {
  url: string | null;
  /** A built-in's name picks its mark (`calendar`); anything else is an app. */
  appId: string;
  name: string;
  size?: number;
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
  const Mark = appId === 'calendar' ? CalendarDays : LayoutGrid;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={name}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor: appId === 'calendar' ? t.c.accentSoft : t.c.surfaceMuted,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Mark
        size={Math.round(size * 0.5)}
        color={appId === 'calendar' ? t.c.accentStrong : t.c.textSecondary}
      />
    </View>
  );
}
