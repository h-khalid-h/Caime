/**
 * Calls on the web (PRD §47): the microphone and camera, the RTCPeerConnection, and the
 * signalling through the server. The caller makes the offer once the other side answers; ICE
 * candidates trickle both ways, and any that arrive before the other side's description wait
 * for it. The media goes device to device; the server only rings and relays.
 */

import type { CallSignalView, CallView, RealtimeEvent } from '@caishy/core/api';
import type { CallKind } from '@caishy/core/calls';
import { endpoints } from '@/api/endpoints';
import { API_URL } from '@/lib/config';
import { DEVICE_ID, useCall } from '@/state/calls';
import { toast } from '@/ui/Toast';

export const callsSupported =
  typeof window !== 'undefined' && 'RTCPeerConnection' in window && Boolean(navigator.mediaDevices);

let pc: RTCPeerConnection | null = null;
let remoteDescribed = false;
let waiting: RTCIceCandidateInit[] = [];
/** Signals that came before this device's connection existed. */
let early: CallSignalView[] = [];
let alive: ReturnType<typeof setInterval> | null = null;
let dropTimer: ReturnType<typeof setTimeout> | null = null;

const store = () => useCall.getState();
const current = () => store().call;
const mineOn = (c: CallView) =>
  c.callerDevice === DEVICE_ID || (c.calleeDevice !== null && c.calleeDevice === DEVICE_ID);

function media(kind: CallKind): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true },
    video: kind === 'video' ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false,
  });
}

/** Everything this device holds for the call, let go of. */
function release(): void {
  if (alive) clearInterval(alive);
  if (dropTimer) clearTimeout(dropTimer);
  alive = null;
  dropTimer = null;
  pc?.close();
  pc = null;
  remoteDescribed = false;
  waiting = [];
  early = [];
  for (const t of store().local?.getTracks() ?? []) t.stop();
}

/** Show that it ended for a moment, then clear the screen. */
function finish(note: string | null): void {
  release();
  store().patch({ phase: 'ended', note, local: null, remote: null });
  const call = current();
  setTimeout(() => {
    if (current()?.id === call?.id) store().reset();
  }, 1800);
}

const signal = (kind: 'offer' | 'answer' | 'candidate', rest: object) => {
  const call = current();
  if (call)
    void endpoints.signalCall(call.id, { deviceId: DEVICE_ID, kind, ...rest }).catch(() => {});
};

async function connect(call: CallView, local: MediaStream): Promise<RTCPeerConnection> {
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
  alive = setInterval(() => {
    void endpoints.callAlive(call.id, DEVICE_ID).catch(() => finish(null));
  }, 20_000);
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
  let local: MediaStream;
  try {
    local = await media(kind);
  } catch {
    store().reset();
    toast(
      kind === 'video'
        ? 'Allow Caishy to use your camera and microphone to call.'
        : 'Allow Caishy to use your microphone to call.',
      { tone: 'danger' },
    );
    return;
  }
  try {
    const { call } = await endpoints.startCall(conversationId, { kind, deviceId: DEVICE_ID });
    store().patch({ call, phase: 'outgoing', local });
  } catch (e) {
    for (const t of local.getTracks()) t.stop();
    store().reset();
    toast((e as Error).message, { tone: 'danger' });
  }
}

/** Answer on this device: its connection is ready before the other side makes its offer. */
export async function answer(): Promise<void> {
  const call = current();
  if (!call || store().phase !== 'incoming') return;
  store().patch({ phase: 'connecting' });
  try {
    const local = await media(call.kind);
    store().patch({ local });
    await connect(call, local);
    const { call: answered } = await endpoints.acceptCall(call.id, DEVICE_ID);
    store().patch({ call: answered });
  } catch (e) {
    const devices = e instanceof DOMException;
    finish(devices ? 'Caishy couldn’t use your microphone or camera.' : null);
    if (devices) void endpoints.declineCall(call.id).catch(() => {});
    else toast((e as Error).message, { tone: 'danger' });
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

/** What the server says about calls, from the realtime connection. */
export function onCallEvent(event: RealtimeEvent): void {
  if (event.type === 'call.signal') {
    void onSignal(event.data as CallSignalView);
    return;
  }
  if (event.type !== 'call.ringing' && event.type !== 'call.updated') return;
  const call = event.data as CallView;
  const mine = current();
  if (event.type === 'call.ringing') {
    if (!store().phase) store().patch({ call, phase: 'incoming', note: null });
    return;
  }
  // Once this device has hung up, what comes after is old news.
  if (mine?.id !== call.id || store().phase === 'ended') return;
  if (call.state === 'ended') {
    finish(
      call.outcome === 'declined' || call.outcome === 'missed'
        ? `${call.callee.displayName} didn’t answer.`
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
  // The other side answered: the caller's device makes the offer.
  if (call.state === 'active' && call.callerDevice === DEVICE_ID && !pc) {
    const local = store().local;
    if (!local) return;
    store().patch({ phase: 'connecting' });
    void connect(call, local)
      .then(async (peer) => {
        await peer.setLocalDescription(await peer.createOffer());
        signal('offer', { sdp: peer.localDescription?.sdp });
      })
      .catch(() => void hangUp('The call couldn’t connect.', true));
  }
}

/** A page opened while a call rings for its person still rings. */
export async function checkLiveCall(me: string): Promise<void> {
  const { call } = await endpoints.liveCall().catch(() => ({ call: null }));
  if (call && call.state === 'ringing' && call.callee.id === me && !store().phase)
    store().patch({ call, phase: 'incoming' });
}

// Closing the tab mid-call hangs up, so nobody is left waiting on it.
if (typeof window !== 'undefined')
  window.addEventListener('pagehide', () => {
    const call = current();
    if (!call || !store().phase || store().phase === 'ended') return;
    const incoming = store().phase === 'incoming';
    void fetch(`${API_URL}/v1/calls/${call.id}/${incoming ? 'decline' : 'end'}`, {
      method: 'POST',
      keepalive: true,
      credentials: 'include',
      headers: { 'content-type': 'application/json', 'x-caishy-client': 'web' },
      body: incoming ? '{}' : JSON.stringify({ deviceId: DEVICE_ID }),
    }).catch(() => {});
  });
