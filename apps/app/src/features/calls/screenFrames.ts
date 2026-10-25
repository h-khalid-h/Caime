/**
 * What was on a shared screen (R114 (1) and (4), M17 I13h), kept by the recording's browser: each
 * screen part (`recording.ts`) is sampled every `FRAME_SAMPLE_MS` as a grey picture of a few
 * hundred cells (`frames.ts` decides what's a change), and at each change a JPEG of the screen, at
 * most `FRAME_EDGE` wide, goes to the server at its moment into the part, one every
 * `FRAME_MIN_MS` at most and `FRAMES_PER_PART_MAX` a part (the server holds to the same). A
 * screen's track alone is ever sampled, never a camera. Nothing of it on a phone (the server
 * never names one as recorder), and nothing without a document.
 */
import {
  FRAME_CELLS,
  FRAME_EDGE,
  FRAME_MIN_MS,
  FRAME_SAMPLE_MS,
  FRAMES_PER_PART_MAX,
} from '@caime/core/calls';
import { endpoints } from '@/api/endpoints';
import { DEVICE_ID } from '@/state/calls';
import { FrameWatch, greyOf } from './frames';

const QUALITY = 0.72;

export interface WatchedPart {
  callId: string;
  /** The server's id for the part, once begun (null: refused). */
  id: Promise<string | null>;
  /** When the part began on this device's clock: a frame's moment is counted from it. */
  startedAt: number;
}

/** The frame as a JPEG at most `FRAME_EDGE` wide, from the video the track plays in. */
async function frameOf(video: HTMLVideoElement): Promise<Blob | null> {
  const scale = Math.min(1, FRAME_EDGE / Math.max(video.videoWidth, video.videoHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  const draw = canvas.getContext('2d');
  if (!draw) return null;
  draw.drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise((done) => canvas.toBlob((b) => done(b), 'image/jpeg', QUALITY));
}

/**
 * Watch a shown screen for the part recording it, sending a frame at each change; the function
 * returned stops it (the part ended, lost or dropped).
 */
export function watchScreen(part: WatchedPart, track: MediaStreamTrack): () => void {
  if (typeof document === 'undefined') return () => {};
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.srcObject = new MediaStream([track]);
  void video.play().catch(() => {});
  const small = document.createElement('canvas');
  small.width = FRAME_CELLS.width;
  small.height = FRAME_CELLS.height;
  const watch = new FrameWatch();
  let lastAt = Number.NEGATIVE_INFINITY;
  let sent = 0;
  let busy = false;
  let stopped = false;
  const tick = async () => {
    if (busy || stopped || video.readyState < 2 || !video.videoWidth) return;
    const at = Date.now() - part.startedAt;
    // Not before the server would take one: a change seen too soon is found again at the next
    // sample, since nothing was kept.
    if (at - lastAt < FRAME_MIN_MS || sent >= FRAMES_PER_PART_MAX) return;
    const draw = small.getContext('2d', { willReadFrequently: true });
    if (!draw) return;
    draw.drawImage(video, 0, 0, small.width, small.height);
    if (!watch.next(greyOf(draw.getImageData(0, 0, small.width, small.height).data))) return;
    busy = true;
    try {
      const [blob, id] = await Promise.all([frameOf(video), part.id]);
      if (!blob || !id || stopped) return;
      lastAt = at;
      sent++;
      await endpoints
        .recordingFrame(part.callId, id, { deviceId: DEVICE_ID, at, bytes: blob })
        .catch(() => {});
    } finally {
      busy = false;
    }
  };
  const timer = setInterval(() => void tick(), FRAME_SAMPLE_MS);
  return () => {
    stopped = true;
    clearInterval(timer);
    video.pause();
    video.srcObject = null;
  };
}
