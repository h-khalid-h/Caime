/**
 * A camera or a voice in a call, on the web: a video element (or an audio one), given the stream.
 * The phones' is Media.native.tsx.
 */
import { createElement, useCallback } from 'react';

/** A camera or a voice, played: the remote one with sound, this device's own muted. */
export function Media({
  stream,
  video,
  mine,
  fit = 'cover',
  testID,
}: {
  stream: MediaStream;
  video: boolean;
  mine?: boolean;
  /** A camera fills the screen; a shared screen is shown whole. */
  fit?: 'cover' | 'contain';
  testID: string;
}) {
  // A callback ref: when the voice becomes a picture, the new element gets the stream too.
  const attach = useCallback(
    (el: HTMLMediaElement | null) => {
      if (el && el.srcObject !== stream) el.srcObject = stream;
    },
    [stream],
  );
  return createElement(video ? 'video' : 'audio', {
    ref: attach,
    autoPlay: true,
    playsInline: true,
    muted: mine,
    'data-testid': testID,
    style: video
      ? {
          width: '100%',
          height: '100%',
          objectFit: fit,
          transform: mine ? 'scaleX(-1)' : undefined,
          display: 'block',
        }
      : { display: 'none' },
  });
}
