/**
 * An item's photo (R63): the host's image of it, fetched as any of Caime's images is (with the
 * session's headers on a phone). Nothing drawn without one.
 */
import { Image } from 'expo-image';
import { mediaHeaders, mediaUrl } from '@/api/client';
import { useTheme } from '@/theme/theme';

export function ItemPhoto({
  path,
  size,
  wide = false,
  label,
}: {
  /** From core `itemPhotoPath`, or a just-uploaded file's own address. */
  path: string | null | undefined;
  size: number;
  /** As wide as its place, `size` tall: the sheet's picture; else a square. */
  wide?: boolean;
  /** What it shows, for a screen reader; left out where the name is right beside it. */
  label?: string;
}) {
  const t = useTheme();
  const src = mediaUrl(path);
  if (!src) return null;
  return (
    <Image
      source={{ uri: src, headers: mediaHeaders() }}
      accessibilityLabel={label}
      accessible={Boolean(label)}
      contentFit="cover"
      style={{
        width: wide ? '100%' : size,
        height: size,
        borderRadius: wide ? 16 : 10,
        backgroundColor: t.c.surfaceMuted,
      }}
    />
  );
}
