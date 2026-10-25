/**
 * Cai records a call (R114 (4), M17 I13b), on the one device the server names: the member's
 * browser that records the notes (R85 (4)). The voices of everyone in the call (each said yes,
 * or Cai would have stopped) are mixed into one part; a new part begins whenever someone joins,
 * so whoever joins later plays only what came after (R85 (2)). Each shared screen is a part of its
 * own, begun as it's shown and ended as it stops: a camera is never recorded. Every part is sent
 * in pieces of about ten seconds as it's recorded, each at the offset the server has it to, so a
 * device that drops loses at most the piece under way; the server makes each part seekable once
 * it ends. A no stops everything at once and drops what was on its way (R85 (2)); a call that
 * ends, or a recorder that hands over, sends its last piece first. While Cai joins in (M17
 * I13g), its voice is one of the voices in the mix (voice.ts), so the recording holds what
 * everyone heard.
 *
 * Part of the calls (stack.ts), loaded with them; never on a phone (the server never names one).
 */
import type { CallNotesView } from '@caime/core/api';
import { CAI_ID } from '@caime/core/system-ids';
import { ApiError } from '@/api/client';
import { endpoints } from '@/api/endpoints';
import { DEVICE_ID, useCall } from '@/state/calls';
import { useGroupCall } from '@/state/groupCall';
import { useSession } from '@/state/session';
import { canRecordNotes } from './notes';
import { caiVoiceStream } from './voice';

/** A piece is this long: what a recorder that drops can lose. */
const PIECE_MS = 10_000;
/** Speech, mixed: a voice note's rate. */
const VOICE_BITS = 32_000;
/**
 * A shared screen is mostly still (a sheet, a slide): a megabit at most, a keyframe every ten
 * seconds so the recording seeks (68 MB an hour measured for a spreadsheet at 1080p).
 */
const SCREEN_BITS = 1_000_000;
const KEYFRAME_MS = 10_000;
/** A screen shown by someone else is recorded once its picture is the screen's, not the camera's. */
const SCREEN_SETTLE_MS = 700;
/** After a recorder stops, how long its last data has to arrive before its part is finished. */
const STOP_SETTLE_MS = 500;
/** A piece is tried this many times over a network's blip before its part is begun again. */
const TRIES = 3;
/** Parts begun again after a loss, for one ask, before this device gives it up. */
const RESTARTS_MAX = 10;

/** What a browser records in, best first: MP4 plays everywhere; the server copies the rest. */
const VOICE_TYPES = [
  'audio/mp4;codecs=mp4a.40.2',
  'audio/webm;codecs=opus',
  'audio/ogg;codecs=opus',
  'audio/mp4',
];
const SCREEN_TYPES = [
  'video/mp4;codecs=avc1.42E01F',
  'video/mp4;codecs=avc1',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
];

function pick(types: string[]): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  return types.find((t) => MediaRecorder.isTypeSupported(t)) ?? null;
}

interface Part {
  callId: string;
  kind: 'voices' | 'screen';
  shownBy?: string;
  recorder: MediaRecorder;
  /** The server's id for it, once begun (null: refused). */
  id: Promise<string | null>;
  offset: number;
  queue: Blob[];
  sending: boolean;
  /** Its recorder has stopped: it's finished once what's queued has gone. */
  ended: boolean;
  /** Given up: nothing more of it is sent. */
  dead: boolean;
  finished: boolean;
  /** The track a screen part records. */
  track?: MediaStreamTrack;
}

/** The call being recorded on this device, and for which ask. */
let recording: { callId: string; notesId: string } | null = null;
let audio: AudioContext | null = null;
let mix: MediaStreamAudioDestinationNode | null = null;
const voices = new Map<string, { stream: MediaStream; node: MediaStreamAudioSourceNode }>();
let voicesPart: Part | null = null;
const screens = new Map<string, Part>();
const settling = new Map<string, ReturnType<typeof setTimeout>>();
/** What's on its way, so a no drops it too. */
let inFlight = new AbortController();
/** Asks this device gave up on (refused, or lost too often): never recorded again here. */
const givenUp = new Set<string>();
let restarts = 0;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function sendPiece(part: Part, id: string, blob: Blob): Promise<'sent' | 'lost' | 'refused'> {
  for (let n = 1; n <= TRIES; n++) {
    const { signal } = inFlight;
    try {
      const r = await endpoints.recordingPiece(
        part.callId,
        id,
        { deviceId: DEVICE_ID, offset: part.offset, bytes: blob },
        signal,
      );
      part.offset = r.offset;
      return 'sent';
    } catch (e) {
      if (signal.aborted) return 'lost';
      if (e instanceof ApiError) {
        // It landed already: its answer was what was lost on the way.
        if (e.code === 'offset_mismatch' && Number(e.details?.offset) === part.offset + blob.size) {
          part.offset += blob.size;
          return 'sent';
        }
        // Not recording any more (a no, deleted), or not this device's: nothing more goes.
        if (e.status === 403 || e.status === 404) return 'refused';
        return 'lost';
      }
      if (n < TRIES) await wait(1_500 * n);
    }
  }
  return 'lost';
}

/** Each part's pieces go one at a time, in order; once its recorder stops, it's finished. */
async function pump(part: Part): Promise<void> {
  if (part.sending) return;
  part.sending = true;
  try {
    const id = await part.id;
    if (!id) {
      part.dead = true;
      part.queue.length = 0;
      return;
    }
    while (part.queue.length && !part.dead) {
      const blob = part.queue[0];
      if (!blob) break;
      const sent = await sendPiece(part, id, blob);
      if (sent === 'sent') {
        part.queue.shift();
        continue;
      }
      part.dead = true;
      part.queue.length = 0;
      if (sent === 'refused') {
        if (recording) givenUp.add(recording.notesId);
        stopAll(false);
      } else {
        // Lost (a piece that wouldn't go, or the part's at its largest): what it has is kept and
        // a new part begins from now.
        lose(part);
      }
    }
    if (part.ended && !part.queue.length && !part.finished) {
      part.finished = true;
      await endpoints.finishRecordingPart(part.callId, id, DEVICE_ID).catch(() => {});
    }
  } finally {
    part.sending = false;
    if (part.queue.length && !part.dead) void pump(part);
  }
}

function begin(
  callId: string,
  kind: 'voices' | 'screen',
  stream: MediaStream,
  shownBy?: string,
): Part | null {
  const type = pick(kind === 'voices' ? VOICE_TYPES : SCREEN_TYPES);
  if (!type) return null;
  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, {
      mimeType: type,
      ...(kind === 'voices'
        ? { audioBitsPerSecond: VOICE_BITS }
        : { videoBitsPerSecond: SCREEN_BITS, videoKeyFrameIntervalDuration: KEYFRAME_MS }),
    } as MediaRecorderOptions);
  } catch {
    return null;
  }
  const part: Part = {
    callId,
    kind,
    shownBy,
    recorder,
    id: endpoints
      .startRecordingPart(callId, {
        deviceId: DEVICE_ID,
        kind,
        shownBy,
        mime: type.split(';')[0] ?? type,
        at: Date.now(),
      })
      .then((r) => r.partId)
      .catch(() => {
        // Not recording any more, or refused: this ask is given up here.
        if (recording) givenUp.add(recording.notesId);
        queueMicrotask(() => stopAll(false));
        return null;
      }),
    offset: 0,
    queue: [],
    sending: false,
    ended: false,
    dead: false,
    finished: false,
  };
  recorder.ondataavailable = (e) => {
    // Nothing goes after the part is finished: the server has closed it.
    if (!e.data.size || part.dead || part.finished) return;
    part.queue.push(e.data);
    void pump(part);
  };
  recorder.onstop = () => {
    // A recorder whose track ended (a screen no longer shown) may hand over its last data just
    // after it says it stopped: the part is finished once that's had its moment.
    setTimeout(() => {
      part.ended = true;
      void pump(part);
    }, STOP_SETTLE_MS);
  };
  recorder.start(PIECE_MS);
  return part;
}

/** End a part: with its last piece (a call over), or dropping it (a no). */
function end(part: Part | null, keepLast: boolean): void {
  if (!part) return;
  if (!keepLast) {
    part.dead = true;
    part.queue.length = 0;
    part.finished = true;
  }
  // A screen's recorder stops by itself when its track ends (its stop then finishes it); any
  // other is stopped here, once.
  if (part.recorder.state !== 'inactive') part.recorder.stop();
  // Dropped, it's still finished with what landed before.
  if (!keepLast)
    void part.id.then((id) =>
      id ? endpoints.finishRecordingPart(part.callId, id, DEVICE_ID).catch(() => {}) : undefined,
    );
}

/** A part that couldn't go on: a new one of the same begins from now, unless this ask is spent. */
function lose(part: Part): void {
  if (!recording) return;
  if (++restarts > RESTARTS_MAX) {
    givenUp.add(recording.notesId);
    stopAll(true);
    return;
  }
  if (part.recorder.state !== 'inactive') part.recorder.stop();
  if (part === voicesPart) voicesPart = null;
  if (part.shownBy && screens.get(part.shownBy) === part) screens.delete(part.shownBy);
  follow();
}

/** Stop everything: with the last pieces (the call over, a hand-over) or without (a no). */
function stopAll(keepLast: boolean): void {
  end(voicesPart, keepLast);
  voicesPart = null;
  for (const part of screens.values()) end(part, keepLast);
  screens.clear();
  for (const timer of settling.values()) clearTimeout(timer);
  settling.clear();
  for (const v of voices.values()) v.node.disconnect();
  voices.clear();
  if (!keepLast) {
    inFlight.abort();
    inFlight = new AbortController();
  }
  void audio?.close().catch(() => {});
  audio = null;
  mix = null;
  recording = null;
  restarts = 0;
}

/** A no ends it with nothing more sent; the call over, or another device recording, sends the last. */
function keepsLast(notes: CallNotesView | null | undefined): boolean {
  if (!notes || notes.state === 'on' || notes.state === 'asking') return true;
  return notes.why === 'ended' || notes.why === 'no_recorder' || notes.why === 'allowance';
}

interface Here {
  callId: string;
  notes: CallNotesView;
  /** Each voice, by whose it is. */
  voices: Map<string, MediaStream>;
  /** Each screen shown, by whose it is: the track, and whether it's this device's own. */
  screens: Map<string, { track: MediaStreamTrack; own: boolean }>;
}

/** The call recorded on this device now: its voices and screens; null when it isn't. */
function here(): Here | null {
  const me = useSession.getState().user?.id;
  if (!me || !canRecordNotes()) return null;
  const group = useGroupCall.getState();
  if (group.call && group.phase === 'in') {
    const notes = group.call.notes;
    if (notes?.state !== 'on' || !notes.records || notes.recorderDevice !== DEVICE_ID) return null;
    const v = new Map<string, MediaStream>();
    const s = new Map<string, { track: MediaStreamTrack; own: boolean }>();
    if (group.local) v.set(me, group.local);
    const cai = caiVoiceStream();
    if (cai) v.set(CAI_ID, cai);
    if (group.screen) s.set(me, { track: group.screen, own: true });
    for (const p of Object.values(group.peers)) {
      if (p.stream) v.set(p.person.id, p.stream);
      const picture = p.stream?.getVideoTracks()[0];
      if (p.theirs?.sharing && picture) s.set(p.person.id, { track: picture, own: false });
    }
    return { callId: group.call.id, notes, voices: v, screens: s };
  }
  const one = useCall.getState();
  if (one.call && (one.phase === 'active' || one.phase === 'reconnecting')) {
    const notes = one.call.notes;
    if (notes?.state !== 'on' || !notes.records || notes.recorderDevice !== DEVICE_ID) return null;
    const other = one.call.caller.id === me ? one.call.callee.id : one.call.caller.id;
    const v = new Map<string, MediaStream>();
    const s = new Map<string, { track: MediaStreamTrack; own: boolean }>();
    if (one.local) v.set(me, one.local);
    if (one.remote) v.set(other, one.remote);
    const cai = caiVoiceStream();
    if (cai) v.set(CAI_ID, cai);
    if (one.screen) s.set(me, { track: one.screen, own: true });
    const picture = one.remote?.getVideoTracks()[0];
    if (one.theirs?.sharing && picture) s.set(other, { track: picture, own: false });
    return { callId: one.call.id, notes, voices: v, screens: s };
  }
  return null;
}

/** The notes of the call on this device, recorded or not: why it stopped, when it has. */
function notesNow(): CallNotesView | null {
  const group = useGroupCall.getState();
  if (group.call) return group.call.notes;
  return useCall.getState().call?.notes ?? null;
}

function followVoices(now: Here): void {
  if (!audio || !mix) return;
  let joined = false;
  for (const [who, v] of voices) {
    const stream = now.voices.get(who);
    if (stream === v.stream) continue;
    // Left (their voice leaves the mix), or their stream was replaced (a reconnection).
    v.node.disconnect();
    voices.delete(who);
  }
  for (const [who, stream] of now.voices) {
    if (voices.has(who) || !stream.getAudioTracks().length) continue;
    const node = audio.createMediaStreamSource(stream);
    node.connect(mix);
    if (voicesPart && !voicesPart.dead) joined = true;
    voices.set(who, { stream, node });
  }
  // Someone joined: what they hear from now is a part of its own (R85 (2)).
  if (joined && voicesPart) {
    end(voicesPart, true);
    voicesPart = null;
  }
  if (!voicesPart && voices.size) voicesPart = begin(now.callId, 'voices', mix.stream);
}

function followScreens(now: Here): void {
  for (const [who, part] of screens) {
    const shown = now.screens.get(who);
    if (shown && shown.track === part.track) continue;
    end(part, true);
    screens.delete(who);
  }
  for (const [who, timer] of settling)
    if (!now.screens.has(who)) {
      clearTimeout(timer);
      settling.delete(who);
    }
  for (const [who, shown] of now.screens) {
    if (screens.has(who) || settling.has(who)) continue;
    const start = () => {
      settling.delete(who);
      const again = here();
      if (!again || again.callId !== now.callId || again.screens.get(who)?.track !== shown.track)
        return;
      const part = begin(now.callId, 'screen', new MediaStream([shown.track]), who);
      if (part) {
        part.track = shown.track;
        screens.set(who, part);
      }
    };
    // Someone else's picture turns from camera to screen as they say so: it settles first.
    if (shown.own) start();
    else settling.set(who, setTimeout(start, SCREEN_SETTLE_MS));
  }
}

/** Whatever changes in a call, the recording follows: on this device, these voices and screens. */
function follow(): void {
  const now = here();
  if (!now || givenUp.has(now.notes.id)) {
    if (recording) stopAll(keepsLast(notesNow()));
    return;
  }
  if (recording && (recording.callId !== now.callId || recording.notesId !== now.notes.id))
    stopAll(true);
  if (!recording) {
    try {
      audio = new AudioContext();
    } catch {
      return;
    }
    void audio.resume().catch(() => {});
    mix = audio.createMediaStreamDestination();
    recording = { callId: now.callId, notesId: now.notes.id };
  }
  followVoices(now);
  followScreens(now);
}

if (typeof window !== 'undefined') {
  useCall.subscribe(follow);
  useGroupCall.subscribe(follow);
}
