/**
 * Cai's notes in a call (M16 F7, R82 phase 1 under R85), on this device: asking, answering and
 * stopping them, what the call screens show of them, and, on the one device the server names (a
 * member's browser in the call, R85 (4)), recording what's said. Each voice is on its own track
 * (this device's microphone and each other device's stream, whose speaker is known by
 * construction), cut at its pauses by its level, each utterance recorded on its own and sent as it
 * ends: silence is never sent or paid for, and a recorder that drops loses at most the utterance
 * under way. A track runs through a short delay before it's recorded, so an utterance's recording
 * starts a little before its first word was heard rather than after it.
 *
 * Part of the calls (stack.ts), loaded with them; on a phone nothing here records (no recorder in
 * react-native-webrtc, R82 (5)), and the server never names a phone.
 */
import type { CallNotesView, RealtimeEvent } from '@caime/core/api';
import { tr } from '@caime/core/i18n';
import { ApiError } from '@/api/client';
import { endpoints } from '@/api/endpoints';
import { DEVICE_ID, useCall } from '@/state/calls';
import { useGroupCall } from '@/state/groupCall';
import { useSession } from '@/state/session';
import { toast } from '@/ui/Toast';

/** How often each track's level is read. */
const TICK_MS = 50;
/** Speech for this long starts an utterance. */
const START_MS = 250;
/**
 * Quiet for this long ends one: a pause between thoughts, not between words (M17 F8a: at 0.9 s a
 * sentence came out in pieces, each heard alone and so heard worse).
 */
const END_MS = 1_500;
/** Past this length, a breath's quiet ends it, so a long turn is cut between words. */
const SOFT_MS = 20_000;
const SOFT_END_MS = 300;
/** An utterance is cut at this length whatever is said (the server takes a little more). */
const MAX_MS = 30_000;
/** Shorter than this, it isn't sent: a model invents words in near-silence (R82 (2)). */
const MIN_MS = 500;
/** What's recorded runs this far behind what's heard, so it starts before the first word. */
const LEAD_MS = 400;
/** Never speech below this, whatever the room. */
const FLOOR_DB = -50;
/** Speech stands this far above the room's own level. */
const OVER_ROOM_DB = 12;
/** Utterances sent at once; the rest wait their turn. */
const SENDING = 2;

// ---- What the screens show -----------------------------------------------------------------

/** The call on this device, whichever kind, with its notes. */
function held(): { id: string; notes: CallNotesView | null; group: boolean } | null {
  const group = useGroupCall.getState();
  if (group.call && group.phase === 'in')
    return { id: group.call.id, notes: group.call.notes, group: true };
  const one = useCall.getState();
  const inIt = one.phase === 'active' || one.phase === 'reconnecting';
  // The caller may ask while it rings: the ring then asks for them (R85 (1)).
  if (one.call && (inIt || one.phase === 'outgoing' || one.phase === 'connecting'))
    return { id: one.call.id, notes: one.call.notes, group: false };
  return null;
}

/** The notes as the server says they stand now, onto the call this device shows. */
function show(callId: string, conversationId: string, group: boolean, notes: CallNotesView | null) {
  if (group) {
    const s = useGroupCall.getState();
    if (s.call?.id === callId) s.patch({ call: { ...s.call, notes } });
    const on = s.on[conversationId];
    if (on?.id === callId) s.seen({ ...on, notes });
  } else {
    const s = useCall.getState();
    if (s.call?.id === callId) s.patch({ call: { ...s.call, notes } });
  }
}

/** What the server says of a call's notes: the call screen, and a group's banner, follow. */
export function onNotesEvent(event: RealtimeEvent): void {
  if (event.type !== 'call.notes') return;
  const { callId, conversationId, group, notes } = event.data;
  const was = held()?.id === callId ? held()?.notes : null;
  show(callId, conversationId, group, notes);
  // Stopped, or never started: everyone in the call hears why, once.
  if (was && (was.state === 'on' || was.state === 'asking') && notes.id === was.id) {
    const line = stopLine(notes);
    if (line) toast(line);
  }
}

/** Why Cai stopped, or didn't start, in words that name nobody (R85). */
export function stopLine(notes: CallNotesView): string | null {
  if (notes.state !== 'stopped' && notes.state !== 'declined') return null;
  switch (notes.why) {
    case 'declined':
      return notes.records
        ? tr('Not this time: Cai isn’t recording.')
        : tr('Not this time: Cai isn’t taking notes.');
    case 'joined_without':
      return notes.records
        ? tr('Someone is in the call without Cai, so Cai stopped recording.')
        : tr('Someone is in the call without Cai, so Cai stopped taking notes.');
    case 'no_recorder':
      return tr('Cai takes notes when someone in the call is on Caime in a browser.');
    case 'allowance':
      return tr('Cai stopped taking notes: today’s AI assist is used up.');
    case 'minor':
      return tr('Cai can’t take notes in this call.');
    case 'ended':
      return null;
    default:
      return notes.records ? tr('Cai stopped recording.') : tr('Cai stopped taking notes.');
  }
}

/** Whether this device can be the one that records: a browser with a recorder. */
export function canRecordNotes(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof AudioContext !== 'undefined' &&
    typeof MediaRecorder !== 'undefined' &&
    noteMime() !== null
  );
}

function refused(e: unknown): void {
  toast(e instanceof ApiError ? e.message : tr('Something went wrong.'), { tone: 'danger' });
}

/**
 * Ask Cai to take notes in the call on this device, or to record it too (R114 (1)): this
 * person's own yes (R85 (1)).
 */
export async function askNotes(records = false): Promise<void> {
  const call = held();
  if (!call) return;
  try {
    const { notes } = await endpoints.askCallNotes(call.id, {
      deviceId: DEVICE_ID,
      canRecord: canRecordNotes(),
      records,
    });
    const now = held();
    if (now?.id === call.id) show(call.id, conversationOf(), call.group, notes);
  } catch (e) {
    refused(e);
  }
}

/** Yes or no to Cai taking notes, asked by someone in the call. */
export async function answerNotes(answer: 'yes' | 'no'): Promise<void> {
  const call = held();
  if (!call) return;
  try {
    const { notes } = await endpoints.answerCallNotes(call.id, {
      deviceId: DEVICE_ID,
      answer,
      canRecord: canRecordNotes(),
      // The ask this person was shown: a yes counts for it alone (R114 (1)).
      notesId: call.notes?.id,
    });
    if (held()?.id === call.id) show(call.id, conversationOf(), call.group, notes);
  } catch (e) {
    refused(e);
  }
}

/** Stop Cai, for everyone, from now (R85 (2)). */
export async function stopNotes(): Promise<void> {
  const call = held();
  if (!call) return;
  try {
    const { notes } = await endpoints.stopCallNotes(call.id);
    if (held()?.id === call.id) show(call.id, conversationOf(), call.group, notes);
  } catch (e) {
    refused(e);
  }
}

function conversationOf(): string {
  const group = useGroupCall.getState();
  if (group.call && group.phase === 'in') return group.call.conversationId;
  return useCall.getState().call?.conversationId ?? '';
}

// ---- The recorder -------------------------------------------------------------------------

/** One voice on its own track. */
interface NoteTrack {
  speakerId: string;
  stream: MediaStream;
}

interface Running {
  speakerId: string;
  stream: MediaStream;
  source: MediaStreamAudioSourceNode;
  analyser: AnalyserNode;
  delay: DelayNode;
  out: MediaStreamAudioDestinationNode;
  samples: Float32Array<ArrayBuffer>;
  /** The room's level, learnt as it goes (dB). */
  room: number;
  above: number;
  below: number;
  recorder: MediaRecorder | null;
  /** When the recorder started, on this device's clock. */
  since: number;
}

/** What a browser records an utterance in: the first it has of these. */
function noteMime(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const type of ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'])
    if (MediaRecorder.isTypeSupported(type)) return type;
  return null;
}

/** A level in decibels from a buffer of samples. */
export function levelDb(samples: Float32Array): number {
  let sum = 0;
  for (const s of samples) sum += s * s;
  const rms = Math.sqrt(sum / Math.max(1, samples.length));
  return rms > 0 ? 20 * Math.log10(rms) : -120;
}

/**
 * Where an utterance starts and ends, from a track's level: pure, so it's tested without audio.
 * The room's level falls at once to anything quieter and rises slowly, so speech never becomes
 * the room.
 */
export function step(
  s: { room: number; above: number; below: number; speaking: boolean; speakingMs: number },
  db: number,
  tickMs = TICK_MS,
): { room: number; above: number; below: number; start: boolean; end: boolean; cut: boolean } {
  const room = db < s.room ? db : s.room + 0.02;
  const speech = db > Math.max(FLOOR_DB, room + OVER_ROOM_DB);
  const above = speech ? s.above + tickMs : 0;
  const below = speech ? 0 : s.below + tickMs;
  return {
    room,
    above,
    below,
    start: !s.speaking && above >= START_MS,
    end: s.speaking && (below >= END_MS || (s.speakingMs >= SOFT_MS && below >= SOFT_END_MS)),
    // At its longest while still speaking: cut here, and the next part starts at once.
    cut: s.speaking && below < END_MS && s.speakingMs >= MAX_MS,
  };
}

let audio: AudioContext | null = null;
let ticker: ReturnType<typeof setInterval> | null = null;
let recording: string | null = null;
const running = new Map<string, Running>();
const queue: Array<{ callId: string; speakerId: string; at: number; blob: Blob }> = [];
let sending = 0;
/** What's on its way, so a stop sends nothing more, not even what was already going. */
let inFlight = new AbortController();

function send(): void {
  while (sending < SENDING && queue.length) {
    const next = queue.shift();
    if (!next) return;
    sending++;
    const { signal } = inFlight;
    const tries = (n: number): Promise<unknown> =>
      endpoints
        .callNoteLine(
          next.callId,
          { deviceId: DEVICE_ID, speakerId: next.speakerId, at: next.at, audio: next.blob },
          signal,
        )
        .catch((e: unknown) =>
          // Refused (not the recorder any more, the notes stopped) or stopped here: dropped. A
          // network's blip: tried again.
          e instanceof ApiError || signal.aborted || n <= 1
            ? undefined
            : new Promise((r) => setTimeout(r, 1500)).then(() => tries(n - 1)),
        );
    void tries(3).finally(() => {
      sending--;
      send();
    });
  }
}

/** Utterances whose recording was let go of (a stop): never sent. */
const dropped = new WeakSet<MediaRecorder>();

function begin(t: Running): void {
  const mime = noteMime();
  if (!mime || !recording) return;
  const callId = recording;
  const recorder = new MediaRecorder(t.out.stream, { mimeType: mime, audioBitsPerSecond: 32_000 });
  // Each utterance keeps its own parts: the last of one arrives after the next has begun.
  const parts: Blob[] = [];
  const since = Date.now();
  recorder.ondataavailable = (e) => {
    if (e.data.size) parts.push(e.data);
  };
  recorder.onstop = () => {
    if (dropped.has(recorder) || Date.now() - since < MIN_MS || !parts.length) return;
    // What's recorded began LEAD_MS before it was started, on what was heard then.
    queue.push({
      callId,
      speakerId: t.speakerId,
      at: since - LEAD_MS,
      blob: new Blob(parts, { type: mime.split(';')[0] }),
    });
    send();
  };
  recorder.start();
  t.recorder = recorder;
  t.since = since;
}

/** An utterance over: sent as it ends, or, at a stop, let go of (R85 (2): nothing after a no). */
function finish(t: Running, keep = true): void {
  const recorder = t.recorder;
  t.recorder = null;
  if (!recorder) return;
  if (!keep) dropped.add(recorder);
  if (recorder.state !== 'inactive') recorder.stop();
}

function tick(): void {
  const now = Date.now();
  for (const t of running.values()) {
    t.analyser.getFloatTimeDomainData(t.samples);
    const next = step(
      {
        room: t.room,
        above: t.above,
        below: t.below,
        speaking: Boolean(t.recorder),
        speakingMs: t.recorder ? now - t.since : 0,
      },
      levelDb(t.samples),
    );
    t.room = next.room;
    t.above = next.above;
    t.below = next.below;
    if (next.start) begin(t);
    else if (next.end) finish(t);
    else if (next.cut) {
      finish(t);
      begin(t);
    }
  }
}

function attach(track: NoteTrack): void {
  if (!audio || !track.stream.getAudioTracks().length) return;
  const source = audio.createMediaStreamSource(track.stream);
  const analyser = audio.createAnalyser();
  analyser.fftSize = 1024;
  const delay = audio.createDelay(1);
  delay.delayTime.value = LEAD_MS / 1000;
  const out = audio.createMediaStreamDestination();
  source.connect(analyser);
  source.connect(delay);
  delay.connect(out);
  running.set(track.speakerId, {
    speakerId: track.speakerId,
    stream: track.stream,
    source,
    analyser,
    delay,
    out,
    samples: new Float32Array(analyser.fftSize),
    room: FLOOR_DB,
    above: 0,
    below: 0,
    recorder: null,
    since: 0,
  });
}

function detach(speakerId: string, keep = true): void {
  const t = running.get(speakerId);
  if (!t) return;
  finish(t, keep);
  t.source.disconnect();
  t.delay.disconnect();
  running.delete(speakerId);
}

/** Stop recording: nothing more is sent, not what was being said, nor what was on its way. */
function stopRecording(): void {
  for (const speakerId of [...running.keys()]) detach(speakerId, false);
  queue.length = 0;
  inFlight.abort();
  inFlight = new AbortController();
  if (ticker) clearInterval(ticker);
  ticker = null;
  void audio?.close().catch(() => {});
  audio = null;
  recording = null;
}

/**
 * Record these tracks for a call's notes, keeping what runs for a track that stays: someone
 * joining or leaving changes only theirs.
 */
function record(callId: string, tracks: NoteTrack[]): void {
  if (recording && recording !== callId) stopRecording();
  if (!audio) {
    try {
      audio = new AudioContext();
    } catch {
      return;
    }
    void audio.resume().catch(() => {});
    ticker = setInterval(tick, TICK_MS);
  }
  recording = callId;
  for (const speakerId of [...running.keys()]) {
    const now = tracks.find((t) => t.speakerId === speakerId);
    if (!now || now.stream !== running.get(speakerId)?.stream) detach(speakerId);
  }
  for (const t of tracks) if (!running.has(t.speakerId)) attach(t);
}

/** The voices in the call on this device while it's the one recording: each its own track. */
function tracksHere(): { callId: string; tracks: NoteTrack[] } | null {
  const me = useSession.getState().user?.id;
  if (!me || !canRecordNotes()) return null;
  const group = useGroupCall.getState();
  if (group.call && group.phase === 'in') {
    const n = group.call.notes;
    if (n?.state !== 'on' || n.recorderDevice !== DEVICE_ID) return null;
    const tracks: NoteTrack[] = [];
    if (group.local) tracks.push({ speakerId: me, stream: group.local });
    for (const p of Object.values(group.peers))
      if (p.stream) tracks.push({ speakerId: p.person.id, stream: p.stream });
    return { callId: group.call.id, tracks };
  }
  const one = useCall.getState();
  if (one.call && (one.phase === 'active' || one.phase === 'reconnecting')) {
    const n = one.call.notes;
    if (n?.state !== 'on' || n.recorderDevice !== DEVICE_ID) return null;
    const other = one.call.caller.id === me ? one.call.callee.id : one.call.caller.id;
    const tracks: NoteTrack[] = [];
    if (one.local) tracks.push({ speakerId: me, stream: one.local });
    if (one.remote) tracks.push({ speakerId: other, stream: one.remote });
    return { callId: one.call.id, tracks };
  }
  return null;
}

/** Whatever changes in a call, the recorder follows: on this device, these tracks, or none. */
function follow(): void {
  const now = tracksHere();
  if (!now) {
    if (recording) stopRecording();
    return;
  }
  record(now.callId, now.tracks);
}

if (typeof window !== 'undefined') {
  useCall.subscribe(follow);
  useGroupCall.subscribe(follow);
}
