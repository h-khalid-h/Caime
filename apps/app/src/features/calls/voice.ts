/**
 * Cai's voice in a call (R114 (3), M17 I13g), on this device: what every screen shows of it
 * ("Cai is speaking", and what Cai wrote to this person alone) and, on the one device the server
 * names (the notes' recorder, a member's browser: R85 (4)), the sound itself. As the server says
 * Cai spoke, that browser fetches the sound, plays it to its own speakers, into the recording's
 * voices while the call is recorded, and into what it sends every other device in place of its
 * microphone alone, so everyone hears Cai the way they hear the person holding the recorder. The
 * microphone is mixed in as it is (muted, it's silent; Cai still goes out, since Cai isn't the
 * person), the notes go on hearing the microphone alone (Cai's words go into them from the
 * server), and what a microphone picks up of Cai from the speakers the server drops as an echo.
 * Utterances play one after another.
 *
 * Part of the calls (stack.ts), loaded with them; on a phone only the words (the server never
 * names one).
 */
import type { CaiSpokenView, CaiWrittenView, RealtimeEvent } from '@caime/core/api';
import { create } from 'zustand';
import { mediaHeaders } from '@/api/client';
import { API_URL } from '@/lib/config';
import { DEVICE_ID, useCall } from '@/state/calls';
import { useGroupCall } from '@/state/groupCall';

interface CaiVoiceStore {
  /** Cai speaking now in the call on this device, and until when (on this device's clock). */
  speaking: { callId: string; text: string; until: number } | null;
  /** The last thing Cai wrote to this person in a call, until they dismiss it. */
  written: CaiWrittenView | null;
  patch: (p: Partial<Pick<CaiVoiceStore, 'speaking' | 'written'>>) => void;
}

export const useCaiVoice = create<CaiVoiceStore>((set) => ({
  speaking: null,
  written: null,
  patch: (p) => set(p),
}));

let speakingTimer: ReturnType<typeof setTimeout> | null = null;

/** Cai spoke or wrote, the server says: the screens follow; the recorder plays the sound. */
export function onCaiEvent(event: RealtimeEvent): void {
  if (event.type === 'call.cai') {
    const data = event.data;
    const until = Math.max(Date.now() + 1_000, Date.parse(data.until));
    useCaiVoice.getState().patch({ speaking: { callId: data.callId, text: data.text, until } });
    if (speakingTimer) clearTimeout(speakingTimer);
    speakingTimer = setTimeout(() => {
      const s = useCaiVoice.getState();
      if (s.speaking?.callId === data.callId && s.speaking.until === until)
        s.patch({ speaking: null });
    }, until - Date.now());
    if (playing?.callId === data.callId) enqueue(data);
  } else if (event.type === 'call.cai.written') {
    useCaiVoice.getState().patch({ written: event.data });
  }
}

/** The person has read what Cai wrote them. */
export function dismissWritten(): void {
  useCaiVoice.getState().patch({ written: null });
}

// ---- The sound, on the recorder's browser --------------------------------------------------

type Listener = (track: MediaStreamTrack | null) => void;
const listeners = new Set<Listener>();
let audio: AudioContext | null = null;
/** The microphone and Cai together: what this device sends while Cai joins in. */
let outgoing: MediaStreamAudioDestinationNode | null = null;
/** Cai alone: for the recording's voices. */
let caiOut: MediaStreamAudioDestinationNode | null = null;
let mic: { stream: MediaStream; node: MediaStreamAudioSourceNode } | null = null;
let playing: { callId: string } | null = null;
const queue: CaiSpokenView[] = [];
let current: AudioBufferSourceNode | null = null;
let fetching = false;

/** The track this device sends in place of its microphone's while Cai joins in; else null. */
export function outgoingAudioTrack(): MediaStreamTrack | null {
  return outgoing?.stream.getAudioTracks()[0] ?? null;
}

/** Told whenever that changes: an engine puts it on every connection, or the microphone back. */
export function onOutgoingAudio(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Cai's voice alone, for the recording's voices while the call is recorded; else null. */
export function caiVoiceStream(): MediaStream | null {
  return caiOut?.stream ?? null;
}

function tell(): void {
  const track = outgoingAudioTrack();
  for (const listener of listeners) listener(track);
}

/** The call whose Cai this device voices: the notes' recorder with Cai joining in. */
function here(): { callId: string; local: MediaStream } | null {
  if (typeof window === 'undefined' || typeof AudioContext === 'undefined') return null;
  const group = useGroupCall.getState();
  if (group.call && group.phase === 'in') {
    const n = group.call.notes;
    if (n?.state !== 'on' || !n.interacts || n.recorderDevice !== DEVICE_ID || !group.local)
      return null;
    return { callId: group.call.id, local: group.local };
  }
  const one = useCall.getState();
  if (one.call && (one.phase === 'active' || one.phase === 'reconnecting')) {
    const n = one.call.notes;
    if (n?.state !== 'on' || !n.interacts || n.recorderDevice !== DEVICE_ID || !one.local)
      return null;
    return { callId: one.call.id, local: one.local };
  }
  return null;
}

/** Whether a call is on this device at all: what Cai said or wrote goes with it. */
function inACall(): boolean {
  const group = useGroupCall.getState();
  if (group.call && (group.phase === 'in' || group.phase === 'joining')) return true;
  const one = useCall.getState();
  return Boolean(one.call && one.phase && one.phase !== 'ended');
}

function source(
  stream: MediaStream,
): { stream: MediaStream; node: MediaStreamAudioSourceNode } | null {
  if (!audio || !outgoing || !stream.getAudioTracks().length) return null;
  const node = audio.createMediaStreamSource(stream);
  node.connect(outgoing);
  return { stream, node };
}

function start(now: { callId: string; local: MediaStream }): void {
  try {
    audio = new AudioContext();
  } catch {
    return;
  }
  void audio.resume().catch(() => {});
  outgoing = audio.createMediaStreamDestination();
  caiOut = audio.createMediaStreamDestination();
  mic = source(now.local);
  playing = { callId: now.callId };
  tell();
}

/** Cai's voice off this device: whatever was playing or waiting is let go. */
function stop(): void {
  try {
    current?.stop();
  } catch {
    // Already over.
  }
  current = null;
  queue.length = 0;
  mic?.node.disconnect();
  mic = null;
  outgoing = null;
  caiOut = null;
  void audio?.close().catch(() => {});
  audio = null;
  playing = null;
  tell();
}

function enqueue(utterance: CaiSpokenView): void {
  queue.push(utterance);
  void playNext();
}

/** The next utterance: its sound from the server (this device's alone), decoded and played. */
async function playNext(): Promise<void> {
  if (current || fetching || !audio) return;
  const next = queue.shift();
  if (!next) return;
  fetching = true;
  let buffer: AudioBuffer | null = null;
  try {
    const res = await fetch(
      `${API_URL}/v1/calls/${next.callId}/cai/${next.utteranceId}?deviceId=${encodeURIComponent(DEVICE_ID)}`,
      { credentials: 'include', headers: { 'x-caime-client': 'web', ...mediaHeaders() } },
    );
    if (res.ok && audio) buffer = await audio.decodeAudioData(await res.arrayBuffer());
  } catch {
    buffer = null;
  }
  fetching = false;
  if (!buffer || !audio || !outgoing || !caiOut || playing?.callId !== next.callId) {
    void playNext();
    return;
  }
  const src = audio.createBufferSource();
  src.buffer = buffer;
  src.connect(audio.destination);
  src.connect(outgoing);
  src.connect(caiOut);
  src.onended = () => {
    if (current !== src) return;
    current = null;
    // The sound itself says when Cai finished, here; the others go by the server's estimate.
    const s = useCaiVoice.getState();
    if (s.speaking?.callId === next.callId && !queue.length) s.patch({ speaking: null });
    void playNext();
  };
  current = src;
  src.start();
}

/** Whatever changes in a call, Cai's voice follows: on this device, with this microphone, or off. */
function follow(): void {
  const now = here();
  if (!now) {
    if (playing) stop();
    if (!inACall()) {
      const s = useCaiVoice.getState();
      if (s.speaking || s.written) s.patch({ speaking: null, written: null });
    }
    return;
  }
  if (playing && playing.callId !== now.callId) stop();
  if (!playing) start(now);
  else if (mic?.stream !== now.local) {
    // The microphone's stream was replaced (a reconnection): the new one goes out.
    mic?.node.disconnect();
    mic = source(now.local);
  }
}

if (typeof window !== 'undefined') {
  useCall.subscribe(follow);
  useGroupCall.subscribe(follow);
}
