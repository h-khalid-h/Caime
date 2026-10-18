import { nextRate, waveformIn } from '@caime/core/voice';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useEffect, useMemo, useState } from 'react';
import { mediaHeaders, mediaUrl } from '@/api/client';
import { chooseRate, rateChosen, VoiceNoteView } from './VoiceNoteView';

/**
 * How a note plays on a phone (R88): out loud with the ringer switched off, as anything someone
 * pressed play on does, and with recording off, so headphones play it at their full quality.
 * Set once, before the first note plays (the recorder sets it back when it's done).
 */
let playable: Promise<void> | null = null;
const readyToPlay = () =>
  (playable ??= setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false }).catch(
    () => {},
  ));

/**
 * A voice note in a bubble on a phone (PRD §46), played through expo-audio; the web has its own
 * (`VoiceNote.web.tsx`). Loaded only when a conversation has one (the bubble imports it lazily).
 * Faster or slower with its pitch kept, and anywhere along it (M16 E4).
 */
export default function VoiceNote({
  url,
  durationMs,
  payload,
  fg,
  meta,
  mine,
}: {
  url: string;
  durationMs: number | null;
  /** The note's payload: its bars are read here, in the audio module's chunk (M16 E4). */
  payload: Record<string, unknown>;
  fg: string;
  meta: string;
  mine: boolean;
}) {
  const src = mediaUrl(url) ?? url;
  const player = useAudioPlayer({ uri: src, headers: mediaHeaders() as Record<string, string> });
  const status = useAudioPlayerStatus(player);
  const [rate, setRate] = useState(rateChosen);
  const bars = useMemo(() => waveformIn(payload), [payload]);
  // Back to the start once it has played through, so the next press plays again.
  useEffect(() => {
    if (status.didJustFinish) {
      player.pause();
      player.seekTo(0).catch(() => {});
    }
  }, [status.didJustFinish, player]);
  // A voice at one and a half or twice its speed still sounds like the person.
  useEffect(() => {
    player.setPlaybackRate(rate, 'high');
  }, [player, rate]);
  const total = status.duration > 0 ? status.duration * 1000 : (durationMs ?? 0);
  const at = status.currentTime > 0 ? status.currentTime * 1000 : 0;
  return (
    <VoiceNoteView
      playing={status.playing}
      atMs={at}
      totalMs={total}
      bars={bars}
      rate={rate}
      onToggle={() =>
        status.playing ? player.pause() : void readyToPlay().then(() => player.play())
      }
      onSeek={(ms) => void player.seekTo(ms / 1000).catch(() => {})}
      onRate={() => {
        const next = nextRate(rate);
        chooseRate(next);
        setRate(next);
      }}
      fg={fg}
      meta={meta}
      mine={mine}
    />
  );
}
