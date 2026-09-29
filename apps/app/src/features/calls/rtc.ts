/**
 * Where calls get WebRTC: the browser's own, on the web (and the tests' stand-ins). The phones'
 * is rtc.native.ts, react-native-webrtc, which puts the same API in the same places, so the
 * engines (engine.ts, group.ts) are one for both.
 */
export const callsAvailable: boolean =
  typeof window !== 'undefined' && 'RTCPeerConnection' in window && Boolean(navigator.mediaDevices);
/** A browser can show a screen (desktop ones; the engines check it has getDisplayMedia). */
export const canShareScreen = true;
/** Whether this is a phone app: what to say about permissions, and nothing to reload. */
export const onPhone = false;
