/**
 * A camera in a call, on a phone: react-native-webrtc's view of the stream. A voice needs no
 * view there: the phone plays what arrives, and never its own.
 */
import { type MediaStream as NativeStream, RTCView } from 'react-native-webrtc';

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
  if (!video) return null;
  return (
    <RTCView
      streamURL={(stream as unknown as NativeStream).toURL()}
      objectFit={fit}
      mirror={mine}
      // This phone's own picture sits over the other's.
      zOrder={mine ? 1 : 0}
      style={{ width: '100%', height: '100%' }}
      testID={testID}
    />
  );
}
