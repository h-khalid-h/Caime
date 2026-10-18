/**
 * A link's card (M16 E4c): what its page says of itself, read once by the server, drawn under the
 * words in a bubble and above the composer before sending. Its picture is Caime's own copy, from
 * Caime, so drawing the card never asks the site for anything, and the reader's device stays
 * unknown to it.
 */
import type { LinkPreviewView } from '@caime/core/api';
import { listed, tr } from '@caime/core/i18n';
import { Image } from 'expo-image';
import X from 'lucide-react-native/icons/x';
import { View } from 'react-native';
import { mediaHeaders, mediaUrl } from '@/api/client';
import { useTheme } from '@/theme/theme';
import { Pressable } from '@/ui/Pressable';
import { Text } from '@/ui/Text';

/** As wide as a photo alone in a bubble. */
const CARD_W = 240;
const PICTURE_MAX_H = 160;

/** The site a link is on, as its card names it when its page names none. */
function siteOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function LinkCard({
  link,
  mine = false,
  fg,
  onPress,
  onLongPress,
  onRemove,
  testID,
}: {
  link: LinkPreviewView;
  /** In a bubble of one's own: its own colours. */
  mine?: boolean;
  fg?: string;
  onPress?: () => void;
  onLongPress?: () => void;
  /** The composer's: take the card off before sending. */
  onRemove?: () => void;
  testID?: string;
}) {
  const t = useTheme();
  const site = link.siteName ?? siteOf(link.url);
  const ratio = link.imageWidth && link.imageHeight ? link.imageHeight / link.imageWidth : 0.5;
  const pictureH = Math.min(PICTURE_MAX_H, Math.round(CARD_W * ratio));
  return (
    <View
      style={{
        width: CARD_W,
        maxWidth: '100%',
        borderStartWidth: 3,
        borderStartColor: mine ? t.bubble.meta : t.c.accent,
        marginTop: 6,
        marginBottom: 2,
      }}
    >
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={listed([site, link.title ?? '', link.description ?? ''])}
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={300}
        testID={testID}
      >
        {link.imageUrl ? (
          <Image
            source={{ uri: mediaUrl(link.imageUrl) ?? undefined, headers: mediaHeaders() }}
            style={{
              width: '100%',
              height: pictureH,
              backgroundColor: t.c.surfaceMuted,
            }}
            contentFit="cover"
            transition={150}
            accessible={false}
          />
        ) : null}
        <View style={{ paddingStart: 8, paddingTop: link.imageUrl ? 6 : 0, paddingEnd: 24 }}>
          <Text variant="caption" color={mine ? fg : 'textSecondary'} numberOfLines={1} auto>
            {site}
          </Text>
          {link.title ? (
            <Text variant="bodyStrong" color={mine ? fg : 'text'} numberOfLines={2} auto>
              {link.title}
            </Text>
          ) : null}
          {link.description ? (
            <Text variant="caption" color={mine ? fg : 'textSecondary'} numberOfLines={2} auto>
              {link.description}
            </Text>
          ) : null}
        </View>
      </Pressable>
      {onRemove ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tr('Remove the link preview')}
          onPress={onRemove}
          hitSlop={8}
          style={{
            position: 'absolute',
            top: 4,
            end: 4,
            padding: 4,
            borderRadius: t.radii.lg,
            backgroundColor: t.c.surface,
          }}
          testID="composer-link-remove"
        >
          <X size={14} color={t.c.textSecondary} />
        </Pressable>
      ) : null}
    </View>
  );
}
