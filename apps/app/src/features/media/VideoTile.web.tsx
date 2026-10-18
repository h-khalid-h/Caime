import type { FileView } from '@caime/core/api';
import { tr } from '@caime/core/i18n';
import { mediaUrl } from '@/api/client';
import { useTheme } from '@/theme/theme';

/**
 * A video in a bubble on the web (M16 E4b): the browser's own player on the same origin, so the
 * session cookie carries it, streamed by byte ranges as it plays; only enough to show its first
 * frame and its length loads before it's played.
 */
export default function VideoTile({
  file,
  width,
}: {
  file: Pick<FileView, 'id' | 'url' | 'name' | 'mime' | 'width' | 'height'>;
  width: number;
  onHold?: () => void;
}) {
  const t = useTheme();
  const ratio = file.width && file.height ? file.width / file.height : 16 / 9;
  const height = Math.round(Math.min(320, width / ratio));
  return (
    // biome-ignore lint/a11y/useMediaCaption: a video someone sent comes with no captions to give
    <video
      src={mediaUrl(file.url) ?? file.url}
      controls
      playsInline
      preload="metadata"
      aria-label={tr('Video')}
      data-testid="message-video"
      style={{
        display: 'block',
        width,
        height,
        borderRadius: t.radii.sm,
        backgroundColor: t.c.surfaceMuted,
        objectFit: 'contain',
      }}
    />
  );
}
