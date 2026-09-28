/**
 * Calls on the web (PRD §47): the microphone and camera, the RTCPeerConnection, and the
 * signalling through the server. The caller makes the offer once the other side answers; ICE
 * candidates trickle both ways, and any that arrive before the other side's description wait
 * for it. The media goes device to device; the server only rings and relays.
 *
 * The device in a call says so every few seconds and hears back how the call stands, so an
 * event lost on the way (a socket reconnecting) never leaves either side waiting. Only the
 * server saying it's over ends it: a moment offline, or the server restarting, doesn't.
 *
 * Every call carries video both ways from the start, even a voice call with nothing to send
 * yet, so sharing a screen is a swap of what's sent (never a renegotiation); and a data channel
 * between the two devices says what each shows: its camera or not, its screen, muted.
 */

import type { CallSignalView, CallView, RealtimeEvent } from '@caime/core/api';
import { CALL_RING_SECONDS, type CallKind } from '@caime/core/calls';
import { ApiError } from '@/api/client';
import { endpoints } from '@/api/endpoints';
import { API_URL } from '@/lib/config';
import { DEVICE_ID, useCall } from '@/state/calls';
import { useGroupCall } from '@/state/groupCall';
import { useSession } from '@/state/session';
import { toast } from '@/ui/Toast';
import { checkLiveGroupCall } from './group';
import { media, mediaTrouble } from './media.web';

export const callsSupported =
  typeof window !== 'undefined' && 'RTCPeerConnection' in window && Boolean(navigator.mediaDevices);
/** Where a page can share its screen (desktop browsers; not phones). */
export const screenShareSupported =
  callsSupported && typeof navigator.mediaDevices.getDisplayMedia === 'function';

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
/** When a ring this device shows has run its time, it asks whether it still rings. */
let ringTimer: ReturnType<typeof setTimeout> | null = null;
/** The two devices' own line: what each shows (camera, screen, muted). */
let control: RTCDataChannel | null = null;
/** The screen being shown instead of the camera, while it is. */
let screen: MediaStreamTrack | null = null;
/** Whether this call had a relay to fall back on, for what to say when it couldn't connect. */
let relayed = true;

/** How far along a call is: a view never moves one back. */
const STAGE = { ringing: 0, active: 1, ended: 2 } as const;

const store = () => useCall.getState();
const current = () => store().call;
const me = () => useSession.getState().user?.id ?? '';
/** A group call on this device: one call at a time, so nothing rings over it. */
const inGroupCall = () => {
  const phase = useGroupCall.getState().phase;
  return Boolean(phase && phase !== 'ended');
};
const mineOn = (c: CallView) =>
  c.callerDevice === DEVICE_ID || (c.calleeDevice !== null && c.calleeDevice === DEVICE_ID);

/**
 * Signed out (here, or from another device): whatever call this device holds is let go of, so
 * no camera or microphone goes on without a call screen. The session is gone, so the server
 * hears nothing more from this side and ends the call within 90 seconds. Watched from the
 * first call, never at load: the session store and this engine import each other.
 */
let watching = false;
function watchSignOut(): void {
  if (watching) return;
  watching = true;
  useSession.subscribe((s, before) => {
    if (before.user && !s.user && current()) {
      release();
      store().reset();
    }
  });
}

/** Everything this device holds for the call, let go of. */
function release(): void {
  if (beat) clearInterval(beat);
  if (dropTimer) clearTimeout(dropTimer);
  if (connectTimer) clearTimeout(connectTimer);
  if (ringTimer) clearTimeout(ringTimer);
  beat = null;
  dropTimer = null;
  connectTimer = null;
  ringTimer = null;
  if (screen) {
    screen.onended = null;
    screen.stop();
  }
  screen = null;
  control?.close();
  control = null;
  pc?.close();
  pc = null;
  remoteDescribed = false;
  relayed = true;
  waiting = [];
  early = [];
  for (const t of store().local?.getTracks() ?? []) t.stop();
}

/**
 * Free again: anything ringing now shows, a group call as much as a 1:1 call (either rings over
 * nothing else on this device, so one that rang meanwhile wasn't shown).
 */
function lookForRings(): void {
  void checkLiveCall();
  void checkLiveGroupCall();
}

/** Show that it ended for a moment, then clear the screen, and look for a call ringing now. */
function finish(note: string | null): void {
  release();
  store().patch({ phase: 'ended', note, local: null, remote: null });
  const call = current();
  setTimeout(() => {
    if (current()?.id !== call?.id) return;
    store().reset();
    lookForRings();
  }, 1800);
}

/** Stop showing a ring or a call that's someone else's now (another device), without a word. */
function letGo(): void {
  release();
  store().reset();
  void checkLiveGroupCall();
}

/**
 * Mute or Camera off pressed while the browser was asking for them holds for what it gave: its
 * tracks start as the screen says. Returns whether the camera is off.
 */
function asPressed(got: { stream: MediaStream; cameraOff: boolean }): boolean {
  const { muted, cameraOff } = store();
  const off = got.cameraOff || cameraOff;
  for (const t of got.stream.getAudioTracks()) t.enabled = !muted;
  for (const t of got.stream.getVideoTracks()) t.enabled = !off;
  return off;
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
    // What comes back after this device's call ended, or for another call, is old news.
    const stillOn = () => current()?.id === callId && store().phase !== 'ended';
    endpoints.callAlive(callId, DEVICE_ID).then(
      ({ call }) => {
        if (stillOn()) onCallEvent({ type: 'call.updated', data: call } as RealtimeEvent);
      },
      (e) => {
        if (!stillOn() || !(e instanceof ApiError)) return;
        // Over, and how it ended: shown as if the event had come.
        const ended = e.details?.call as CallView | undefined;
        if (e.status === 409 && ended) onCallEvent({ type: 'call.updated', data: ended });
        // Signed out, or not in this call any more.
        else if ([401, 403, 404, 409].includes(e.status)) finish(null);
        // Offline for a moment, or the server restarting: the next beat tries again, and the
        // server waits 90 seconds for one.
      },
    );
  }, BEAT_MS);
}

/**
 * The two devices never found each other. With no relay to go through, a strict network (a mobile
 * carrier's, an office's) is the likely reason, so the person hears what might work, longer than
 * the call screen stays.
 */
function couldntConnect(): void {
  if (!relayed)
    toast('One of your networks may be blocking calls. Try again on another, such as Wi-Fi.');
  void hangUp('The call couldn’t connect.', true);
}

/** Answered: the two devices find each other soon, or the call couldn't connect. */
function connectBy(callId: string): void {
  if (connectTimer) clearTimeout(connectTimer);
  connectTimer = setTimeout(() => {
    if (current()?.id === callId && store().phase === 'connecting') couldntConnect();
  }, CONNECT_MS);
}

/** A ring shown here asks, once its time is up, whether it's still ringing (an event lost). */
function ringUntil(call: CallView): void {
  if (ringTimer) clearTimeout(ringTimer);
  const left = Date.parse(call.createdAt) + CALL_RING_SECONDS * 1000 - Date.now();
  ringTimer = setTimeout(() => void checkLiveCall(), Math.max(0, left) + 3000);
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

/** The sender that carries this device's picture: its camera, its screen, or nothing yet. */
const videoSender = () =>
  pc?.getTransceivers().find((t) => t.receiver.track.kind === 'video')?.sender ?? null;

/** Tell the other device what this one shows, whenever that changes and once it can hear. */
function tellState(): void {
  if (control?.readyState !== 'open') return;
  const { cameraOff, sharing, muted, local } = store();
  control.send(
    JSON.stringify({
      camera: Boolean(local?.getVideoTracks().length) && !cameraOff,
      sharing,
      muted,
    }),
  );
}

async function connect(local: MediaStream): Promise<RTCPeerConnection> {
  const { iceServers, relay } = await endpoints
    .callIce()
    .catch(() => ({ iceServers: [], relay: false }));
  relayed = relay;
  const peer = new RTCPeerConnection({ iceServers });
  const remote = new MediaStream();
  for (const track of local.getTracks()) peer.addTrack(track, local);
  // Created the same way on both devices (negotiated, id 0), so neither waits for the other's.
  const channel = peer.createDataChannel('state', { negotiated: true, id: 0 });
  channel.onopen = tellState;
  channel.onmessage = (e) => {
    try {
      const m = JSON.parse(String(e.data)) as Record<string, unknown>;
      store().patch({
        theirs: {
          camera: m.camera !== false,
          sharing: m.sharing === true,
          muted: m.muted === true,
        },
      });
    } catch {
      // Not something this version says: ignored.
    }
  };
  control = channel;
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
      couldntConnect();
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
    // With no camera to send yet, video still goes both ways, so a screen can be shown later.
    for (const t of pc.getTransceivers())
      if (t.receiver.track.kind === 'video' && t.direction === 'recvonly') t.direction = 'sendrecv';
    await pc.setLocalDescription(await pc.createAnswer());
    signal('answer', { sdp: pc.localDescription?.sdp });
  }
}

/** Call the other person in a direct conversation. */
export async function startCall(conversationId: string, kind: CallKind): Promise<void> {
  if (store().phase || inGroupCall()) return;
  watchSignOut();
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
    store().patch({ call, phase: 'outgoing', local: got.stream, cameraOff: asPressed(got) });
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
    store().patch({ local: got.stream, cameraOff: asPressed(got) });
    await connect(got.stream);
    const { call: answered } = await endpoints.acceptCall(call.id, DEVICE_ID);
    // It ended meanwhile (the event came before the answer): nothing to start.
    if (current()?.id !== call.id || store().phase !== 'connecting') return;
    store().patch({ call: answered });
    heartbeat(answered.id);
    connectBy(answered.id);
  } catch (e) {
    if (current()?.id !== call.id || store().phase === 'ended') return;
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
  tellState();
}

export function toggleCamera(): void {
  const cameraOff = !store().cameraOff;
  for (const t of store().local?.getVideoTracks() ?? []) t.enabled = !cameraOff;
  store().patch({ cameraOff });
  tellState();
}

/** Show this screen (a window, a tab) instead of the camera, until it's stopped. */
export async function startSharing(): Promise<void> {
  const call = current();
  if (!call || !videoSender() || store().sharing || store().phase !== 'active') return;
  let shown: MediaStream;
  try {
    shown = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  } catch (e) {
    // Choosing nothing is fine; anything else is said.
    if (!(e instanceof DOMException && e.name === 'NotAllowedError'))
      toast('Caime couldn’t share your screen.', { tone: 'danger' });
    return;
  }
  const track = shown.getVideoTracks()[0];
  const sender = videoSender();
  if (!track || !sender || current()?.id !== call.id) {
    for (const t of shown.getTracks()) t.stop();
    return;
  }
  await sender.replaceTrack(track);
  screen = track;
  // The browser's own "Stop sharing" ends it too.
  track.onended = () => void stopSharing();
  store().patch({ sharing: true });
  tellState();
}

/** Back to the camera (or to nothing, in a voice call). */
export async function stopSharing(): Promise<void> {
  const track = screen;
  if (!track) return;
  screen = null;
  track.onended = null;
  track.stop();
  await videoSender()
    ?.replaceTrack(store().local?.getVideoTracks()[0] ?? null)
    .catch(() => {});
  store().patch({ sharing: false });
  tellState();
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
    if (!store().phase && !inGroupCall()) ring(call);
    return;
  }
  // Once this device has hung up, what comes after is old news; so is a view older than the
  // one held (a beat's answer from before it was answered, arriving after).
  if (mine?.id !== call.id || store().phase === 'ended') return;
  if (STAGE[call.state] < STAGE[mine.state]) return;
  if (call.state === 'ended') {
    const iCalled = call.caller.id === me();
    // Turned down on another of my devices: this one just stops ringing.
    if (!iCalled && call.outcome === 'declined') {
      letGo();
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
    letGo();
    return;
  }
  store().patch({ call });
  // The other side answered: the caller's device makes the offer, once.
  if (call.state === 'active' && call.callerDevice === DEVICE_ID && store().phase === 'outgoing') {
    const local = store().local;
    if (!local) return;
    store().patch({ phase: 'connecting' });
    connectBy(call.id);
    void connect(local)
      .then(async (peer) => {
        // No camera to send (a voice call, or no camera here): video goes both ways all the same,
        // so the other's camera arrives, and a screen can be shown later without renegotiating.
        if (!local.getVideoTracks().length) peer.addTransceiver('video', { direction: 'sendrecv' });
        await peer.setLocalDescription(await peer.createOffer());
        signal('offer', { sdp: peer.localDescription?.sdp });
      })
      .catch(() => couldntConnect());
  }
}

/** Show a call ringing for this person, until it stops. */
function ring(call: CallView): void {
  watchSignOut();
  store().patch({ call, phase: 'incoming', note: null });
  ringUntil(call);
}

/**
 * What rings for this person now, from the server: a page opened (or a tab that was busy) shows
 * a call still ringing, and a ring shown here whose end it never heard of stops.
 */
export async function checkLiveCall(person: string = me()): Promise<void> {
  const phase = store().phase;
  if (!person || (phase && phase !== 'incoming')) return;
  const shown = phase === 'incoming' ? current() : null;
  const got = await endpoints.liveCall().catch(() => undefined);
  if (!got) return;
  const { call } = got;
  const ringing = call?.state === 'ringing' && call.callee.id === person ? call : null;
  if (shown) {
    // Answered elsewhere, turned down, called off or missed while this tab wasn't listening.
    if (current()?.id === shown.id && store().phase === 'incoming' && ringing?.id !== shown.id)
      letGo();
    return;
  }
  if (ringing && !store().phase && !inGroupCall()) ring(ringing);
}

// Closing the tab mid-call hangs up, so nobody is left waiting on it. A tab only ringing (or
// answering, not yet in the call) does nothing: the call goes on ringing on the other devices.
if (typeof window !== 'undefined')
  window.addEventListener('pagehide', () => {
    const call = current();
    const phase = store().phase;
    // Only the device in the call: the caller's, or the callee's once it answered.
    if (!call || !phase || phase === 'ended' || !mineOn(call)) return;
    void fetch(`${API_URL}/v1/calls/${call.id}/end`, {
      method: 'POST',
      keepalive: true,
      credentials: 'include',
      headers: { 'content-type': 'application/json', 'x-caime-client': 'web' },
      body: JSON.stringify({ deviceId: DEVICE_ID }),
    }).catch(() => {});
  });
