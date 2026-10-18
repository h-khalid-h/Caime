import type { FileView } from '@caime/core/api';
import { tr } from '@caime/core/i18n';
import Play from 'lucide-react-native/icons/play';
import { View } from 'react-native';
import { openFile } from '@/lib/openFile';
import { useTheme } from '@/theme/theme';
import { Pressable } from '@/ui/Pressable';

/**
 * A video in a bubble on a phone (M16 E4b): a tile that hands it to the phone's own player
 * (`openFile`: fetched once with the session, then the system's sheet), since a player inside the
 * bubble is a native module of its own. Built, not yet tried on a phone; the web has its own.
 */
export default function VideoTile({
  file,
  width,
  onHold,
}: {
  file: Pick<FileView, 'id' | 'url' | 'name' | 'mime' | 'width' | 'height'>;
  width: number;
  onHold?: () => void;
}) {
  const t = useTheme();
  const ratio = file.width && file.height ? file.width / file.height : 16 / 9;
  const height = Math.round(Math.min(320, width / ratio));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={tr('Play video')}
      onPress={() => void openFile(file)}
      onLongPress={onHold}
      delayLongPress={300}
      style={{
        width,
        height,
        borderRadius: t.radii.sm,
        backgroundColor: t.c.surfaceMuted,
        alignItems: 'center',
        justifyContent: 'center',
      }}
      testID="message-video"
    >
      <View
        style={{
          width: 48,
          height: 48,
          borderRadius: 24,
          backgroundColor: t.c.surface,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Play size={22} color={t.c.text} />
      </View>
    </Pressable>
  );
}
