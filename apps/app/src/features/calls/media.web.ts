/**
 * The microphone and camera for a call on the web (PRD §47), for a 1:1 call and a group call
 * alike: what to ask for, and what to say when the browser won't give it.
 */
import type { CallKind } from '@caime/core/calls';

/**
 * The microphone, and for a video call the camera. Without a camera (none, or another app has
 * it) a video call goes ahead with the voice alone; a refusal stays a refusal.
 */
export async function media(kind: CallKind): Promise<{ stream: MediaStream; cameraOff: boolean }> {
  const audio = { echoCancellation: true, noiseSuppression: true };
  const voiceOnly = () => navigator.mediaDevices.getUserMedia({ audio, video: false });
  if (kind === 'voice') return { stream: await voiceOnly(), cameraOff: false };
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio,
      video: { width: { ideal: 1280 }, height: { ideal: 720 } },
    });
    return { stream, cameraOff: false };
  } catch (e) {
    const name = e instanceof DOMException ? e.name : '';
    if (name === 'NotAllowedError' || name === 'SecurityError') throw e;
    return { stream: await voiceOnly(), cameraOff: true };
  }
}

/** Why the microphone or camera couldn't be used, and what to do about it. */
export function mediaTrouble(e: unknown, kind: CallKind): string {
  const name = e instanceof DOMException ? e.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError')
    return kind === 'video'
      ? 'Allow Caime to use your camera and microphone in your browser’s site settings, then try again.'
      : 'Allow Caime to use your microphone in your browser’s site settings, then try again.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError')
    return 'Caime can’t find a microphone on this device.';
  if (name === 'NotReadableError' || name === 'AbortError')
    return 'Another app is using your microphone. Close it, then try again.';
  return 'Caime couldn’t use your microphone.';
}
