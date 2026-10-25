import type { CallRecordingPartView } from '@caime/core/api';
import { tr } from '@caime/core/i18n';
import { mediaUrl } from '@/api/client';
import { useTheme } from '@/theme/theme';

/**
 * A part of a call's recording on the web (M17 I13b): the browser's own player on the same
 * origin, so the session cookie carries it, by byte ranges as it plays; only its length loads
 * before it's played. A screen shows as a picture, the voices as a bar.
 */
export default function RecordingPlayer({
  part,
  width,
}: {
  part: Pick<CallRecordingPartView, 'id' | 'kind' | 'url' | 'mime'> & { url: string };
  width: number;
}) {
  const t = useTheme();
  const src = mediaUrl(part.url) ?? part.url;
  const style = { display: 'block', width, borderRadius: t.radii.sm };
  if (part.kind === 'screen')
    return (
      // biome-ignore lint/a11y/useMediaCaption: a shared screen has no words of its own to caption
      <video
        src={src}
        controls
        playsInline
        preload="metadata"
        aria-label={tr('Screen shown in the call')}
        data-testid="call-recording-screen"
        style={{
          ...style,
          maxHeight: 320,
          objectFit: 'contain',
          backgroundColor: t.c.surfaceMuted,
        }}
      />
    );
  return (
    // biome-ignore lint/a11y/useMediaCaption: what was said is the notes beside it
    <audio
      src={src}
      controls
      preload="metadata"
      aria-label={tr('The call’s voices')}
      data-testid="call-recording-voices"
      style={style}
    />
  );
}
