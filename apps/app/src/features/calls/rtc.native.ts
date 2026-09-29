/**
 * WebRTC on the phones: react-native-webrtc's RTCPeerConnection, MediaStream and
 * navigator.mediaDevices, put where the browser keeps its own, so the engines are the web's. It
 * asks for the camera and microphone itself (the system prompt, with app.json's reasons).
 *
 * It's native code, so it's only in a build of Caime's own (a store build or a development
 * build), never in Expo Go: there calls aren't offered, and the rest of the app works as ever.
 * The library throws as it loads without its native half, so it's loaded only when that's here.
 */
import { NativeModules } from 'react-native';

export const callsAvailable: boolean = Boolean(NativeModules.WebRTCModule);
if (callsAvailable) {
  const { registerGlobals } =
    require('react-native-webrtc') as typeof import('react-native-webrtc');
  registerGlobals();
}

/** Showing a phone's screen needs a broadcast extension (iOS) and a foreground service: not yet. */
export const canShareScreen = false;
export const onPhone = true;
