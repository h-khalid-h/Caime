/**
 * Calls on the web (PRD §47): the microphone and camera, the RTCPeerConnection, and the
 * signalling through the server. The caller makes the offer once the other side answers; ICE
 * candidates trickle both ways, and any that arrive before the other side's description wait
 * for it. The media goes device to device; the server only rings and relays.
 *
 * The device in a call says so every few seconds and hears back how the call stands, so an
 * event lost on the way (a socket reconnecting) never leaves either side waiting. Only the
 * server saying it's over ends it: a moment offline, or the server restarting, doesn't.
 */

import type { CallSignalView, CallView, RealtimeEvent } from '@caishy/core/api';
import type { CallKind } from '@caishy/core/calls';
import { ApiError } from '@/api/client';
import { endpoints } from '@/api/endpoints';
import { API_URL } from '@/lib/config';
import { DEVICE_ID, useCall } from '@/state/calls';
import { useSession } from '@/state/session';
import { toast } from '@/ui/Toast';

export const callsSupported =
  typeof window !== 'undefined' && 'RTCPeerConnection' in window && Boolean(navigator.mediaDevices);

/** While it rings or connects, a beat this often; once the two are talking, a slower one. */
const BEAT_MS = 5000;
const TALKING_BEAT_MS = 20_000;
/** Answered, the two devices find each other in this long, or the call couldn't connect. */
const CONNECT_MS = 30_000;

let pc: RTCPeerConnection | null = null;
let remoteDescribed = false;
let waiting: RTCIceCandidateInit[] = [];
/** Signals that came before this device's connection existed. */
let early: CallSignalView[] = [];
let beat: ReturnType<typeof setInterval> | null = null;
let lastBeat = 0;
let dropTimer: ReturnType<typeof setTimeout> | null = null;
let connectTimer: ReturnType<typeof setTimeout> | null = null;

const store = () => useCall.getState();
const current = () => store().call;
const me = () => useSession.getState().user?.id ?? '';
const mineOn = (c: CallView) =>
  c.callerDevice === DEVICE_ID || (c.calleeDevice !== null && c.calleeDevice === DEVICE_ID);

/**
 * The microphone, and for a video call the camera. Without a camera (none, or another app has
 * it) a video call goes ahead with the voice alone; a refusal stays a refusal.
 */
async function media(kind: CallKind): Promise<{ stream: MediaStream; cameraOff: boolean }> {
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
function mediaTrouble(e: unknown, kind: CallKind): string {
  const name = e instanceof DOMException ? e.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError')
    return kind === 'video'
      ? 'Allow Caishy to use your camera and microphone in your browser’s site settings, then try again.'
      : 'Allow Caishy to use your microphone in your browser’s site settings, then try again.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError')
    return 'Caishy can’t find a microphone on this device.';
  if (name === 'NotReadableError' || name === 'AbortError')
    return 'Another app is using your microphone. Close it, then try again.';
  return 'Caishy couldn’t use your microphone.';
}

/** Everything this device holds for the call, let go of. */
function release(): void {
  if (beat) clearInterval(beat);
  if (dropTimer) clearTimeout(dropTimer);
  if (connectTimer) clearTimeout(connectTimer);
  beat = null;
  dropTimer = null;
  connectTimer = null;
  pc?.close();
  pc = null;
  remoteDescribed = false;
  waiting = [];
  early = [];
  for (const t of store().local?.getTracks() ?? []) t.stop();
}

/** Show that it ended for a moment, then clear the screen, and look for a call ringing now. */
function finish(note: string | null): void {
  release();
  store().patch({ phase: 'ended', note, local: null, remote: null });
  const call = current();
  setTimeout(() => {
    if (current()?.id !== call?.id) return;
    store().reset();
    void checkLiveCall();
  }, 1800);
}

/**
 * Say this device is still in the call, and catch up on what it missed: answered, turned down,
 * over. Only the server saying it's over (or that this device isn't in it) ends it here.
 */
function heartbeat(callId: string): void {
  if (beat) clearInterval(beat);
  lastBeat = 0;
  beat = setInterval(() => {
    const phase = store().phase;
    if (current()?.id !== callId || !phase || phase === 'ended') return;
    if (phase === 'active' && Date.now() - lastBeat < TALKING_BEAT_MS) return;
    lastBeat = Date.now();
    endpoints.callAlive(callId, DEVICE_ID).then(
      ({ call }) => onCallEvent({ type: 'call.updated', data: call } as RealtimeEvent),
      (e) => {
        // Offline for a moment, or the server restarting: the next beat tries again, and the
        // server waits 90 seconds for one.
        if (e instanceof ApiError && [403, 404, 409].includes(e.status) && current()?.id === callId)
          finish(null);
      },
    );
  }, BEAT_MS);
}

/** Answered: the two devices find each other soon, or the call couldn't connect. */
function connectBy(): void {
  if (connectTimer) clearTimeout(connectTimer);
  connectTimer = setTimeout(() => {
    if (store().phase === 'connecting') void hangUp('The call couldn’t connect.', true);
  }, CONNECT_MS);
}

const signal = (kind: 'offer' | 'answer' | 'candidate', rest: object) => {
  const call = current();
  if (!call) return;
  const send = (tries: number): Promise<unknown> =>
    endpoints.signalCall(call.id, { deviceId: DEVICE_ID, kind, ...rest }).catch((e) => {
      // An offer or an answer is the call itself: try it again. A candidate has others behind it.
      const again = !(e instanceof ApiError) || e.status >= 500 || e.status === 429;
      if (kind !== 'candidate' && again && tries > 1 && current()?.id === call.id)
        return new Promise((r) => setTimeout(r, 1000)).then(() => send(tries - 1));
    });
  void send(3);
};

async function connect(local: MediaStream): Promise<RTCPeerConnection> {
  const { iceServers } = await endpoints.callIce().catch(() => ({ iceServers: [] }));
  const peer = new RTCPeerConnection({ iceServers });
  const remote = new MediaStream();
  for (const track of local.getTracks()) peer.addTrack(track, local);
  peer.ontrack = (e) => {
    remote.addTrack(e.track);
    store().patch({ remote });
  };
  peer.onicecandidate = (e) => {
    if (e.candidate) signal('candidate', { candidate: e.candidate.toJSON() });
  };
  peer.onconnectionstatechange = () => {
    const state = peer.connectionState;
    if (state === 'connected') {
      if (dropTimer) clearTimeout(dropTimer);
      if (connectTimer) clearTimeout(connectTimer);
      store().patch({ phase: 'active' });
    } else if (state === 'disconnected') {
      store().patch({ phase: 'reconnecting' });
      // A moment's loss comes back by itself; a lasting one ends the call.
      dropTimer = setTimeout(() => void hangUp('The call dropped.'), 15_000);
    } else if (state === 'failed') {
      void hangUp('The call couldn’t connect.', true);
    }
  };
  pc = peer;
  for (const s of early.splice(0)) await onSignal(s);
  return peer;
}

async function onSignal(s: CallSignalView): Promise<void> {
  if (s.to !== DEVICE_ID || s.callId !== current()?.id) return;
  if (!pc) {
    early.push(s);
    return;
  }
  if (s.kind === 'candidate' && s.candidate) {
    if (remoteDescribed) await pc.addIceCandidate(s.candidate).catch(() => {});
    else waiting.push(s.candidate);
    return;
  }
  if (!s.sdp) return;
  await pc.setRemoteDescription({ type: s.kind === 'offer' ? 'offer' : 'answer', sdp: s.sdp });
  remoteDescribed = true;
  for (const c of waiting.splice(0)) await pc.addIceCandidate(c).catch(() => {});
  if (s.kind === 'offer') {
    await pc.setLocalDescription(await pc.createAnswer());
    signal('answer', { sdp: pc.localDescription?.sdp });
  }
}

/** Call the other person in a direct conversation. */
export async function startCall(conversationId: string, kind: CallKind): Promise<void> {
  if (store().phase) return;
  store().patch({ phase: 'starting', note: null });
  let got: Awaited<ReturnType<typeof media>>;
  try {
    got = await media(kind);
  } catch (e) {
    store().reset();
    toast(mediaTrouble(e, kind), { tone: 'danger' });
    void checkLiveCall();
    return;
  }
  try {
    const { call } = await endpoints.startCall(conversationId, { kind, deviceId: DEVICE_ID });
    store().patch({ call, phase: 'outgoing', local: got.stream, cameraOff: got.cameraOff });
    heartbeat(call.id);
  } catch (e) {
    for (const t of got.stream.getTracks()) t.stop();
    store().reset();
    // Rung by them while this was starting: that call is the one to show.
    if (e instanceof ApiError && e.code === 'in_call') {
      await checkLiveCall();
      if (store().phase) return;
    }
    toast((e as Error).message, { tone: 'danger' });
  }
}

/** Answer on this device: its connection is ready before the other side makes its offer. */
export async function answer(): Promise<void> {
  const call = current();
  if (!call || store().phase !== 'incoming') return;
  store().patch({ phase: 'connecting' });
  let got: Awaited<ReturnType<typeof media>>;
  try {
    got = await media(call.kind);
  } catch (e) {
    // Still ringing: fix it and answer, or decline. It isn't turned down for them.
    if (current()?.id === call.id && store().phase === 'connecting')
      store().patch({ phase: 'incoming' });
    toast(mediaTrouble(e, call.kind), { tone: 'danger' });
    return;
  }
  // It stopped ringing while the browser asked: nothing to answer.
  if (current()?.id !== call.id || store().phase !== 'connecting') {
    for (const t of got.stream.getTracks()) t.stop();
    return;
  }
  try {
    store().patch({ local: got.stream, cameraOff: got.cameraOff });
    await connect(got.stream);
    const { call: answered } = await endpoints.acceptCall(call.id, DEVICE_ID);
    store().patch({ call: answered });
    heartbeat(answered.id);
    connectBy();
  } catch (e) {
    finish(null);
    toast((e as Error).message, { tone: 'danger' });
  }
}

/** Turn it down, call it off, or hang up: whichever this is now. */
export async function hangUp(note: string | null = null, failed = false): Promise<void> {
  const call = current();
  if (!call) return;
  const incoming = store().phase === 'incoming';
  finish(note);
  await (incoming
    ? endpoints.declineCall(call.id)
    : endpoints.endCall(call.id, { deviceId: DEVICE_ID, failed })
  ).catch(() => {});
}

export function toggleMute(): void {
  const muted = !store().muted;
  for (const t of store().local?.getAudioTracks() ?? []) t.enabled = !muted;
  store().patch({ muted });
}

export function toggleCamera(): void {
  const cameraOff = !store().cameraOff;
  for (const t of store().local?.getVideoTracks() ?? []) t.enabled = !cameraOff;
  store().patch({ cameraOff });
}

/** What the server says about calls, from the realtime connection or a heartbeat. */
export function onCallEvent(event: RealtimeEvent): void {
  if (event.type === 'call.signal') {
    void onSignal(event.data as CallSignalView);
    return;
  }
  if (event.type !== 'call.ringing' && event.type !== 'call.updated') return;
  const call = event.data as CallView;
  const mine = current();
  if (event.type === 'call.ringing') {
    // Busy with another here (or just ending one): it's looked for again once this is over.
    if (!store().phase) store().patch({ call, phase: 'incoming', note: null });
    return;
  }
  // Once this device has hung up, what comes after is old news.
  if (mine?.id !== call.id || store().phase === 'ended') return;
  if (call.state === 'ended') {
    const iCalled = call.caller.id === me();
    // Turned down on another of my devices: this one just stops ringing.
    if (!iCalled && call.outcome === 'declined') {
      release();
      store().reset();
      return;
    }
    finish(
      iCalled && (call.outcome === 'declined' || call.outcome === 'missed')
        ? `${call.callee.displayName} didn’t answer.`
        : !iCalled && (call.outcome === 'missed' || call.outcome === 'cancelled')
          ? 'Missed call'
          : null,
    );
    return;
  }
  // Answered on another of my devices: this one stops ringing.
  if (call.state === 'active' && !mineOn(call)) {
    release();
    store().reset();
    return;
  }
  store().patch({ call });
  // The other side answered: the caller's device makes the offer, once.
  if (call.state === 'active' && call.callerDevice === DEVICE_ID && store().phase === 'outgoing') {
    const local = store().local;
    if (!local) return;
    store().patch({ phase: 'connecting' });
    connectBy();
    void connect(local)
      .then(async (peer) => {
        await peer.setLocalDescription(await peer.createOffer());
        signal('offer', { sdp: peer.localDescription?.sdp });
      })
      .catch(() => void hangUp('The call couldn’t connect.', true));
  }
}

/** A page opened while a call rings for its person still rings; so does one that was busy. */
export async function checkLiveCall(person: string = me()): Promise<void> {
  if (!person || store().phase) return;
  const { call } = await endpoints.liveCall().catch(() => ({ call: null }));
  if (call && call.state === 'ringing' && call.callee.id === person && !store().phase)
    store().patch({ call, phase: 'incoming', note: null });
}

// Closing the tab mid-call hangs up, so nobody is left waiting on it. A tab only ringing does
// nothing: the call goes on ringing on the person's other devices.
if (typeof window !== 'undefined')
  window.addEventListener('pagehide', () => {
    const call = current();
    const phase = store().phase;
    if (!call || !phase || phase === 'incoming' || phase === 'ended' || phase === 'starting')
      return;
    void fetch(`${API_URL}/v1/calls/${call.id}/end`, {
      method: 'POST',
      keepalive: true,
      credentials: 'include',
      headers: { 'content-type': 'application/json', 'x-caishy-client': 'web' },
      body: JSON.stringify({ deviceId: DEVICE_ID }),
    }).catch(() => {});
  });
