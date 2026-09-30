/**
 * Group calls (PRD §47), on the web and the phones: every device in the call connects to every
 * other, one RTCPeerConnection each, so the media goes device to device as in a 1:1 call. Of any
 * two, the one that joined later makes the offer (both sides decide from the server's view of who joined
 * when, and by device id on a tie), so two devices never offer each other.
 *
 * The server's view of the call, from events and from each heartbeat's answer, says who's in it:
 * a connection opens for each device that joins and closes for each that leaves, and a view
 * older than the one held (`rev`) changes nothing. Only the server saying it's over, or that this
 * device isn't in it, ends it here; a connection that drops is tried again by whoever offered.
 *
 * Video goes both ways on every connection from the start, so a screen shown later is a swap of
 * what each sends; and a data channel on each says what this device shows.
 */

import type {
  CallPersonView,
  GroupCallSignalView,
  GroupCallView,
  RealtimeEvent,
} from '@caime/core/api';
import { CALL_RING_SECONDS, type CallKind } from '@caime/core/calls';
import { ApiError } from '@/api/client';
import { endpoints } from '@/api/endpoints';
import { API_URL } from '@/lib/config';
import { DEVICE_ID, useCall } from '@/state/calls';
import { useGroupCall } from '@/state/groupCall';
import { useSession } from '@/state/session';
import { toast } from '@/ui/Toast';
import { checkLiveCall } from './engine';
import { errorName, media, mediaTrouble } from './media';
import { callsAvailable } from './rtc';

export const groupCallsSupported = callsAvailable;

/** A device in the call says it's there this often (the server waits 90 seconds for it). */
const BEAT_MS = 10_000;
/** Two devices find each other in this long, or the one that offered tries again. */
const CONNECT_MS = 20_000;
/** A connection lost for this long is tried again. */
const DROP_MS = 10_000;
/** Tries at connecting two devices before their tile says it couldn't. */
const TRIES = 3;
/** Signals kept for devices this one doesn't know of yet, at most. */
const EARLY_MAX = 200;

interface Peer {
  /** Whose device, and which: a device is in the call for one person, and signals say whose. */
  key: string;
  userId: string;
  device: string;
  pc: RTCPeerConnection;
  remote: MediaStream;
  control: RTCDataChannel;
  /** This device makes the offers on this connection. */
  offers: boolean;
  /** When that device joined, as the server said (null until a view says, for one it offered). */
  joinedAt: string | null;
  /** That device's connection's identity (its DTLS fingerprint): a new one is a new connection. */
  fingerprint: string | null;
  described: boolean;
  waiting: RTCIceCandidateInit[];
  /** Signals are dealt with one at a time, in order. */
  queue: Promise<void>;
  timer: ReturnType<typeof setTimeout> | null;
  tries: number;
}

/** Each other device in the call, by `keyOf` its person and itself. */
const peers = new Map<string, Peer>();
const keyOf = (userId: string, device: string) => `${userId}|${device}`;
/** Signals from devices this one hasn't heard have joined yet. */
let early: GroupCallSignalView[] = [];
let beat: ReturnType<typeof setInterval> | null = null;
let ringTimer: ReturnType<typeof setTimeout> | null = null;
/** The screen shown instead of the camera, while it is. */
let screen: MediaStreamTrack | null = null;
let iceServers: RTCIceServer[] = [];
let lastRefresh = 0;
/** Calls this device has heard ended: nothing later brings one back. */
const over = new Set<string>();
/** Calls turned down or left on this device: they don't ring here again. */
const leftHere = new Set<string>();
/** Each join from this device: only the latest one's answer is acted on. */
let joins = 0;

const store = () => useGroupCall.getState();
/** What the server said about a call in one of the person's groups: for its banner. */
function heard(call: GroupCallView): boolean {
  if (call.state === 'ended') over.add(call.id);
  else if (over.has(call.id)) return false;
  store().seen(call);
  return true;
}
const current = () => store().call;
const me = () => useSession.getState().user?.id ?? '';
/** A 1:1 call on this device: one call at a time. */
const inOneToOne = () => {
  const phase = useCall.getState().phase;
  return Boolean(phase && phase !== 'ended');
};
const mine = (call: GroupCallView) => call.members.find((m) => m.person.id === me());
/**
 * It rings for this person now, as the server says: their ring ends there when its time is up.
 * This device's clock only says when to ask again.
 */
const ringsForMe = (call: GroupCallView) =>
  call.state !== 'ended' && mine(call)?.state === 'ringing' && !leftHere.has(call.id);

/**
 * Signed out (here, or from another device): the call this device holds is let go of. Watched
 * from the first call, never at load: the session store and the engines import each other.
 */
let watching = false;
function watchSignOut(): void {
  if (watching) return;
  watching = true;
  useSession.subscribe((s, before) => {
    if (before.user && !s.user) {
      if (current()) release();
      store().reset();
      useGroupCall.setState({ on: {} });
      leftHere.clear();
    }
  });
}

function closePeer(key: string): void {
  const peer = peers.get(key);
  if (!peer) return;
  peers.delete(key);
  if (peer.timer) clearTimeout(peer.timer);
  peer.control.close();
  peer.pc.close();
  store().peer(key, null);
}

/** Everything this device holds for the call, let go of. */
function release(): void {
  if (beat) clearInterval(beat);
  if (ringTimer) clearTimeout(ringTimer);
  beat = null;
  ringTimer = null;
  if (screen) {
    screen.onended = null;
    screen.stop();
  }
  screen = null;
  for (const key of [...peers.keys()]) closePeer(key);
  early = [];
  lastRefresh = 0;
  for (const t of store().local?.getTracks() ?? []) t.stop();
}

/**
 * Free again: anything ringing now shows, a 1:1 call as much as a group call (either rings over
 * nothing else on this device, so one that rang meanwhile wasn't shown).
 */
function lookForRings(): void {
  void checkLiveGroupCall();
  void checkLiveCall();
}

/** Show that it ended for a moment, then clear the screen, and look for a call ringing now. */
function finish(note: string | null): void {
  const call = current();
  release();
  store().patch({ phase: 'ended', note, local: null, peers: {}, sharing: false });
  setTimeout(() => {
    if (current()?.id !== call?.id || store().phase !== 'ended') return;
    store().reset();
    lookForRings();
  }, 1800);
}

/** Stop showing a ring (answered on another device, turned down, over), without a word. */
function stopRinging(): void {
  release();
  store().reset();
  lookForRings();
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

/** The DTLS fingerprint an offer or answer carries: the same for as long as a connection lives. */
const fingerprintOf = (sdp: string) => /a=fingerprint:(\S+ \S+)/.exec(sdp)?.[1] ?? null;

const videoSender = (pc: RTCPeerConnection) =>
  pc.getTransceivers().find((t) => t.receiver.track.kind === 'video')?.sender ?? null;

/** Tell the other devices (or one) what this one shows. */
function tellState(only?: Peer): void {
  const { cameraOff, sharing, muted, local } = store();
  const said = JSON.stringify({
    camera: Boolean(local?.getVideoTracks().length) && !cameraOff,
    sharing,
    muted,
  });
  for (const p of only ? [only] : peers.values())
    if (p.control.readyState === 'open') p.control.send(said);
}

function signal(
  to: Pick<Peer, 'userId' | 'device'>,
  kind: 'offer' | 'answer' | 'candidate',
  rest: object,
): void {
  const call = current();
  if (!call) return;
  const body = { deviceId: DEVICE_ID, to: to.device, toUser: to.userId, kind, ...rest };
  const send = (tries: number): Promise<unknown> =>
    endpoints.signalGroupCall(call.id, body).catch((e) => {
      // An offer or an answer is the connection itself: try it again. A candidate has others.
      const again = !(e instanceof ApiError) || e.status >= 500 || e.status === 429;
      if (kind !== 'candidate' && again && tries > 1 && current()?.id === call.id)
        return new Promise((r) => setTimeout(r, 1000)).then(() => send(tries - 1));
    });
  void send(3);
}

/** Make (or make again, with new routes) the offer to another device. */
async function offer(peer: Peer, restart = false): Promise<void> {
  const { pc } = peer;
  // No picture to send yet (a voice call, no camera): video goes both ways all the same.
  if (!pc.getTransceivers().some((t) => t.receiver.track.kind === 'video'))
    pc.addTransceiver('video', { direction: 'sendrecv' });
  await pc.setLocalDescription(await pc.createOffer(restart ? { iceRestart: true } : undefined));
  signal(peer, 'offer', { sdp: pc.localDescription?.sdp });
}

/** Two devices that haven't found each other yet: the one that offered tries again. */
function tryAgain(peer: Peer): void {
  if (peers.get(peer.key) !== peer) return;
  if (peer.timer) clearTimeout(peer.timer);
  peer.timer = null;
  if (peer.tries >= TRIES) {
    store().peer(peer.key, { link: 'failed' });
    return;
  }
  peer.tries++;
  store().peer(peer.key, { link: 'reconnecting' });
  peer.timer = setTimeout(() => tryAgain(peer), CONNECT_MS);
  if (peer.offers) peer.queue = peer.queue.then(() => offer(peer, true)).catch(() => {});
}

async function onSignalFor(peer: Peer, s: GroupCallSignalView): Promise<void> {
  if (peers.get(peer.key) !== peer) return;
  const { pc } = peer;
  if (s.kind === 'candidate' && s.candidate) {
    const candidate = s.candidate;
    // After an ICE restart, a candidate can come before the offer or answer it belongs to (each
    // signal is a request of its own): one the connection won't take yet waits for the next.
    if (peer.described)
      await pc.addIceCandidate(candidate).catch(() => peer.waiting.push(candidate));
    else peer.waiting.push(candidate);
    return;
  }
  if (!s.sdp) return;
  // An answer to no offer of this device's (the other side was confused): ignored.
  if (s.kind === 'answer' && pc.signalingState !== 'have-local-offer') return;
  const fingerprint = fingerprintOf(s.sdp);
  // An offer from a device this one offers to, or from a connection other than the one held:
  // that device joined again (it offers, having joined later). This connection is over; a new
  // one answers it.
  if (
    s.kind === 'offer' &&
    (peer.offers || (peer.fingerprint && fingerprint && fingerprint !== peer.fingerprint))
  ) {
    const person = store().peers[peer.key]?.person;
    closePeer(peer.key);
    if (!person) return;
    openPeer(peer.userId, peer.device, person, false, null);
    const fresh = peers.get(peer.key);
    if (fresh) fresh.queue = fresh.queue.then(() => onSignalFor(fresh, s)).catch(() => {});
    return;
  }
  await pc.setRemoteDescription({ type: s.kind === 'offer' ? 'offer' : 'answer', sdp: s.sdp });
  peer.described = true;
  peer.fingerprint = fingerprint ?? peer.fingerprint;
  for (const c of peer.waiting.splice(0)) await pc.addIceCandidate(c).catch(() => {});
  if (s.kind === 'offer') {
    for (const t of pc.getTransceivers())
      if (t.receiver.track.kind === 'video' && t.direction === 'recvonly') t.direction = 'sendrecv';
    // With no picture of its own on the connection yet (none, or a screen started since), it
    // sends what it shows now.
    const picture = screen ?? store().local?.getVideoTracks()[0] ?? null;
    const sender = videoSender(pc);
    if (picture && sender && !sender.track) await sender.replaceTrack(picture).catch(() => {});
    await pc.setLocalDescription(await pc.createAnswer());
    signal(peer, 'answer', { sdp: pc.localDescription?.sdp });
  }
}

/** A connection to another device in the call: offered from here, or waiting for its offer. */
function openPeer(
  userId: string,
  device: string,
  person: CallPersonView,
  offers: boolean,
  joinedAt: string | null,
): void {
  const key = keyOf(userId, device);
  const local = store().local;
  if (!local || peers.has(key)) return;
  const pc = new RTCPeerConnection({ iceServers });
  const remote = new MediaStream();
  for (const track of local.getAudioTracks()) pc.addTrack(track, local);
  const picture = screen ?? local.getVideoTracks()[0] ?? null;
  if (picture) pc.addTrack(picture, local);
  // Made the same way on both devices (negotiated, id 0), so neither waits for the other's.
  const control = pc.createDataChannel('state', { negotiated: true, id: 0 });
  const peer: Peer = {
    key,
    userId,
    device,
    pc,
    remote,
    control,
    offers,
    joinedAt,
    fingerprint: null,
    described: false,
    waiting: [],
    queue: Promise.resolve(),
    timer: null,
    tries: 0,
  };
  peers.set(key, peer);
  store().peer(key, { device, person, stream: remote, link: 'connecting', theirs: null });
  control.onopen = () => tellState(peer);
  control.onmessage = (e) => {
    try {
      const m = JSON.parse(String(e.data)) as Record<string, unknown>;
      store().peer(key, {
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
  pc.ontrack = (e) => {
    if (!remote.getTracks().includes(e.track)) remote.addTrack(e.track);
    store().peer(key, { stream: remote });
  };
  pc.onicecandidate = (e) => {
    if (e.candidate) signal(peer, 'candidate', { candidate: e.candidate.toJSON() });
  };
  pc.onconnectionstatechange = () => {
    if (peers.get(key) !== peer) return;
    const state = pc.connectionState;
    if (state === 'connected') {
      if (peer.timer) clearTimeout(peer.timer);
      peer.timer = null;
      peer.tries = 0;
      store().peer(key, { link: 'connected' });
    } else if (state === 'disconnected') {
      store().peer(key, { link: 'reconnecting' });
      if (peer.timer) clearTimeout(peer.timer);
      peer.timer = setTimeout(() => tryAgain(peer), DROP_MS);
    } else if (state === 'failed') tryAgain(peer);
  };
  peer.timer = setTimeout(() => tryAgain(peer), CONNECT_MS);
  if (offers) peer.queue = peer.queue.then(() => offer(peer)).catch(() => {});
  // What it sent before this device knew it had joined.
  const sentBy = (s: GroupCallSignalView) => s.from === device && s.fromUser === userId;
  const theirs = early.filter(sentBy);
  early = early.filter((s) => !sentBy(s));
  for (const s of theirs) peer.queue = peer.queue.then(() => onSignalFor(peer, s)).catch(() => {});
}

/** Of two devices in the call, the one that joined later makes the offer. */
function offersTo(
  me: { joinedAt: string | null },
  them: { joinedAt: string | null; device: string | null },
) {
  const a = Date.parse(me.joinedAt ?? '') || 0;
  const b = Date.parse(them.joinedAt ?? '') || 0;
  return a !== b ? a > b : DEVICE_ID > (them.device ?? '');
}

/** Connect to every device in the call, and to no other. */
function reconcile(call: GroupCallView): void {
  const self = call.members.find(
    (m) => m.person.id === me() && m.device === DEVICE_ID && m.state === 'joined',
  );
  if (!self) return;
  const others = new Map(
    call.members
      .filter((m) => m.state === 'joined' && m.device && m.person.id !== me())
      .map((m) => [keyOf(m.person.id, m.device as string), m]),
  );
  for (const key of [...peers.keys()]) if (!others.has(key)) closePeer(key);
  for (const [key, m] of others) {
    const held = peers.get(key);
    // Joined again since (a device leaving and coming back, unheard): a new connection.
    if (held?.joinedAt && held.joinedAt !== m.joinedAt) closePeer(key);
    const peer = peers.get(key);
    if (peer) {
      peer.joinedAt ??= m.joinedAt;
      store().peer(key, { person: m.person });
    } else openPeer(m.person.id, m.device as string, m.person, offersTo(self, m), m.joinedAt);
  }
}

/** How a call that ended reads here, when there's something to say. */
function endNote(call: GroupCallView): string | null {
  const started = call.startedBy.id === me();
  if (started && (call.outcome === 'missed' || call.outcome === 'declined'))
    return 'Nobody answered.';
  return null;
}

/** What the server says about the call on this device. */
function onUpdated(call: GroupCallView): void {
  const held = current();
  const phase = store().phase;
  if (!held || held.id !== call.id || !phase || phase === 'ended' || phase === 'starting') return;
  // Older than what's held (a heartbeat's answer overtaken by an event): old news.
  if (call.rev < held.rev || !heard(call)) return;
  const self = mine(call);
  if (call.state === 'ended') {
    if (phase === 'incoming') stopRinging();
    else finish(endNote(call));
    return;
  }
  if (phase === 'incoming') {
    // Joined on another device, turned down, or its time is up: this one stops ringing.
    if (self?.state !== 'ringing') stopRinging();
    else store().patch({ call });
    return;
  }
  if (phase === 'joining') {
    store().patch({ call });
    return;
  }
  // Taken out of it, or moved to another device.
  if (self?.state !== 'joined' || self.device !== DEVICE_ID) {
    finish(self?.state === 'joined' ? 'You’re in this call on another device now.' : null);
    return;
  }
  store().patch({ call });
  reconcile(call);
}

/** Ask the server how the call stands now (a device joined that this one hasn't heard of). */
async function refresh(force = false): Promise<void> {
  const call = current();
  if (!call || store().phase !== 'in') return;
  if (!force && Math.abs(Date.now() - lastRefresh) < 1000) return;
  lastRefresh = Date.now();
  try {
    const { call: now } = await endpoints.groupCallAlive(call.id, DEVICE_ID);
    onUpdated(now);
  } catch (e) {
    if (current()?.id !== call.id || store().phase !== 'in' || !(e instanceof ApiError)) return;
    const view = e.details?.call as GroupCallView | undefined;
    // Over, or this device isn't in it: shown as if the event had come.
    if ((e.status === 409 || e.status === 403) && view) onUpdated(view);
    else if ([401, 403, 404, 409].includes(e.status)) finish(null);
    // Offline for a moment, or the server restarting: the next beat tries again.
  }
}

function heartbeat(): void {
  if (beat) clearInterval(beat);
  beat = setInterval(() => void refresh(true), BEAT_MS);
}

function keepEarly(s: GroupCallSignalView): void {
  if (early.length >= EARLY_MAX) early.shift();
  early.push(s);
}

function onSignal(s: GroupCallSignalView): void {
  const call = current();
  const phase = store().phase;
  if (s.to !== DEVICE_ID) return;
  // Starting it: someone quick joined and offered before the call's id came back here. Kept
  // until it does.
  if (phase === 'starting' && !call) {
    keepEarly(s);
    return;
  }
  if (!call || s.callId !== call.id) return;
  if (phase !== 'in' && phase !== 'joining') return;
  const peer = peers.get(keyOf(s.fromUser, s.from));
  if (peer) {
    peer.queue = peer.queue.then(() => onSignalFor(peer, s)).catch(() => {});
    return;
  }
  keepEarly(s);
  // From a device that joined since this one last heard: find out who it is.
  void refresh();
}

/** In it now: whoever offered before this device knew of them is found out about at once. */
function settleIn(call: GroupCallView): void {
  heartbeat();
  reconcile(call);
  if (early.length) void refresh(true);
}

/** Show a call ringing for this person, until it stops. */
function ring(call: GroupCallView): void {
  watchSignOut();
  store().patch({ call, phase: 'incoming', note: null });
  if (ringTimer) clearTimeout(ringTimer);
  const left = Date.parse(call.createdAt) + CALL_RING_SECONDS * 1000 - Date.now();
  // Once its time is up, ask whether it still rings (an event lost on the way).
  ringTimer = setTimeout(() => void checkLiveGroupCall(), Math.max(0, left) + 3000);
}

/** Start a call in a group: everyone else in it who can take part is rung. */
export async function startGroupCall(conversationId: string, kind: CallKind): Promise<void> {
  if (store().phase || inOneToOne()) return;
  watchSignOut();
  store().patch({ phase: 'starting', note: null });
  let got: Awaited<ReturnType<typeof media>>;
  try {
    got = await media(kind);
  } catch (e) {
    store().reset();
    toast(mediaTrouble(e, kind), { tone: 'danger' });
    return;
  }
  try {
    iceServers = (await endpoints.callIce().catch(() => ({ iceServers: [] }))).iceServers;
    const { call } = await endpoints.startGroupCall(conversationId, { kind, deviceId: DEVICE_ID });
    early = early.filter((s) => s.callId === call.id);
    heard(call);
    store().patch({ call, phase: 'in', local: got.stream, cameraOff: asPressed(got) });
    settleIn(call);
  } catch (e) {
    for (const t of got.stream.getTracks()) t.stop();
    early = [];
    store().reset();
    // Someone else started one first: it's there to join.
    if (e instanceof ApiError && e.code === 'call_on')
      void endpoints
        .groupCallIn(conversationId)
        .then(({ call }) => call && heard(call))
        .catch(() => {});
    toast((e as Error).message, { tone: 'danger' });
  }
}

/** Join on this device: the call ringing here, or one on in a group (from its banner). */
export async function joinGroupCall(target?: GroupCallView): Promise<void> {
  const phase = store().phase;
  const call = target ?? current();
  if (!call || (phase && !(phase === 'incoming' && current()?.id === call.id))) return;
  if (inOneToOne()) {
    toast('You’re already in a call.', { tone: 'danger' });
    return;
  }
  const wasRinging = phase === 'incoming';
  const attempt = ++joins;
  watchSignOut();
  if (ringTimer) clearTimeout(ringTimer);
  store().patch({ call, phase: 'joining', note: null });
  // This join is the one this device is making: a later one (after leaving it) answers for itself.
  const latest = () =>
    attempt === joins && current()?.id === call.id && store().phase === 'joining';
  let got: Awaited<ReturnType<typeof media>>;
  try {
    got = await media(call.kind);
  } catch (e) {
    if (!latest()) return;
    // Still ringing: fix it and join, or decline. It isn't turned down for them, and it asks
    // again once its time is up.
    if (wasRinging) ring(call);
    else store().reset();
    toast(mediaTrouble(e, call.kind), { tone: 'danger' });
    return;
  }
  // It ended while the browser asked, or this join was left for another: nothing to join.
  if (!latest()) {
    for (const t of got.stream.getTracks()) t.stop();
    return;
  }
  store().patch({ local: got.stream, cameraOff: asPressed(got) });
  try {
    iceServers = (await endpoints.callIce().catch(() => ({ iceServers: [] }))).iceServers;
    const { call: joined } = await endpoints.joinGroupCall(call.id, DEVICE_ID);
    // A later join from this device answers for itself.
    if (attempt !== joins) return;
    if (current()?.id !== call.id || store().phase !== 'joining') {
      // Left (or it ended) while it was joining: out of it again, so nobody waits for this one.
      void endpoints.leaveGroupCall(call.id, DEVICE_ID).catch(() => {});
      return;
    }
    heard(joined);
    store().patch({ call: joined, phase: 'in' });
    settleIn(joined);
  } catch (e) {
    if (!latest()) return;
    const ended =
      e instanceof ApiError ? (e.details?.call as GroupCallView | undefined) : undefined;
    if (ended) heard(ended);
    finish(null);
    toast((e as Error).message, { tone: 'danger' });
  }
}

/** Turn it down while it rings, or leave it: whichever this is now. */
export async function leaveGroupCall(): Promise<void> {
  const call = current();
  const phase = store().phase;
  if (!call || !phase) return;
  leftHere.add(call.id);
  if (phase === 'incoming') {
    stopRinging();
    await endpoints.declineGroupCall(call.id).catch(() => {});
    return;
  }
  // Left while joining from its ring, before the join landed: it still rings for them, here and
  // on their other devices, so it's turned down too. (Declining changes only a ring, so a join
  // that landed meanwhile is simply left.)
  const rung = phase === 'joining' && mine(call)?.state === 'ringing';
  finish(null);
  if (phase === 'in' || phase === 'joining')
    await Promise.all([
      rung ? endpoints.declineGroupCall(call.id).catch(() => {}) : null,
      endpoints
        .leaveGroupCall(call.id, DEVICE_ID)
        .then(({ call: now }) => heard(now))
        .catch(() => {}),
    ]);
}

export function toggleGroupMute(): void {
  const muted = !store().muted;
  for (const t of store().local?.getAudioTracks() ?? []) t.enabled = !muted;
  store().patch({ muted });
  tellState();
}

export function toggleGroupCamera(): void {
  const cameraOff = !store().cameraOff;
  for (const t of store().local?.getVideoTracks() ?? []) t.enabled = !cameraOff;
  store().patch({ cameraOff });
  tellState();
}

/** Show this screen (a window, a tab) to everyone instead of the camera, until it's stopped. */
export async function startGroupSharing(): Promise<void> {
  const call = current();
  if (!call || store().sharing || store().phase !== 'in') return;
  let shown: MediaStream;
  try {
    shown = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  } catch (e) {
    // Choosing nothing is fine; anything else is said.
    if (errorName(e) !== 'NotAllowedError')
      toast('Caime couldn’t share your screen.', { tone: 'danger' });
    return;
  }
  const track = shown.getVideoTracks()[0];
  if (!track || current()?.id !== call.id || store().phase !== 'in') {
    for (const t of shown.getTracks()) t.stop();
    return;
  }
  screen = track;
  for (const peer of peers.values())
    await videoSender(peer.pc)
      ?.replaceTrack(track)
      .catch(() => {});
  // The browser's own "Stop sharing" ends it too.
  track.onended = () => void stopGroupSharing();
  store().patch({ sharing: true });
  tellState();
}

/** Back to the camera (or to nothing, in a voice call), for everyone. */
export async function stopGroupSharing(): Promise<void> {
  const track = screen;
  if (!track) return;
  screen = null;
  track.onended = null;
  track.stop();
  const camera = store().local?.getVideoTracks()[0] ?? null;
  for (const peer of peers.values())
    await videoSender(peer.pc)
      ?.replaceTrack(camera)
      .catch(() => {});
  store().patch({ sharing: false });
  tellState();
}

/** What the server says about group calls, from the realtime connection. */
export function onGroupCallEvent(event: RealtimeEvent): void {
  if (event.type === 'groupcall.signal') {
    onSignal(event.data as GroupCallSignalView);
    return;
  }
  if (event.type !== 'groupcall.ringing' && event.type !== 'groupcall.updated') return;
  const call = event.data as GroupCallView;
  // The group's banner hears it whatever this device is doing (just left it, say).
  const news = heard(call);
  if (current()?.id === call.id) {
    onUpdated(call);
    return;
  }
  // Rung (the ring, or an update of a call that rings for them that this device missed).
  if (news && !store().phase && !inOneToOne() && ringsForMe(call)) ring(call);
}

/**
 * What rings for this person now, from the server: a page opened (or a tab that was busy) shows
 * a call still ringing, and a ring shown here whose end it never heard of stops.
 */
export async function checkLiveGroupCall(
  person: string = me(),
  known?: GroupCallView | null,
): Promise<void> {
  const phase = store().phase;
  if (!person || (phase && phase !== 'incoming')) return;
  const shown = phase === 'incoming' ? current() : null;
  const got =
    known !== undefined ? { call: known } : await endpoints.liveGroupCall().catch(() => undefined);
  if (!got) return;
  const { call } = got;
  const ringing = call && heard(call) && ringsForMe(call) ? call : null;
  if (shown) {
    if (current()?.id === shown.id && store().phase === 'incoming' && ringing?.id !== shown.id)
      stopRinging();
    return;
  }
  if (ringing && !store().phase && !inOneToOne()) ring(ringing);
}

/** The call on in a group now, for its banner (a page opened while one is on). */
export async function checkGroupCallIn(conversationId: string): Promise<void> {
  const got = await endpoints.groupCallIn(conversationId).catch(() => undefined);
  if (!got) return;
  if (got.call) heard(got.call);
  else {
    // Over while this device wasn't listening.
    const was = store().on[conversationId];
    if (was) heard({ ...was, state: 'ended' });
  }
}

/** A group call on this device: the 1:1 engine rings nothing over it. */
export const inGroupCall = () => {
  const phase = store().phase;
  return Boolean(phase && phase !== 'ended');
};

// Closing the tab mid-call leaves it, so nobody waits on this device. A tab only ringing does
// nothing: the call goes on ringing on the person's other devices.
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function')
  window.addEventListener('pagehide', () => {
    const call = current();
    const phase = store().phase;
    if (!call || (phase !== 'in' && phase !== 'joining')) return;
    void fetch(`${API_URL}/v1/group-calls/${call.id}/leave`, {
      method: 'POST',
      keepalive: true,
      credentials: 'include',
      headers: { 'content-type': 'application/json', 'x-caime-client': 'web' },
      // Only this device leaves: the person may be in the call on another one now.
      body: JSON.stringify({ deviceId: DEVICE_ID }),
    }).catch(() => {});
  });
