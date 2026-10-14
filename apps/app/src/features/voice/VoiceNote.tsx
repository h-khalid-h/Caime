import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useEffect } from 'react';
import { mediaHeaders, mediaUrl } from '@/api/client';
import { VoiceNoteView } from './VoiceNoteView';

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
 */
export default function VoiceNote({
  url,
  durationMs,
  fg,
  meta,
  mine,
}: {
  url: string;
  durationMs: number | null;
  fg: string;
  meta: string;
  mine: boolean;
}) {
  const src = mediaUrl(url) ?? url;
  const player = useAudioPlayer({ uri: src, headers: mediaHeaders() as Record<string, string> });
  const status = useAudioPlayerStatus(player);
  // Back to the start once it has played through, so the next press plays again.
  useEffect(() => {
    if (status.didJustFinish) {
      player.pause();
      player.seekTo(0).catch(() => {});
    }
  }, [status.didJustFinish, player]);
  const total = status.duration > 0 ? status.duration * 1000 : (durationMs ?? 0);
  const at = status.currentTime > 0 ? status.currentTime * 1000 : 0;
  return (
    <VoiceNoteView
      playing={status.playing}
      atMs={at}
      totalMs={total}
      onToggle={() =>
        status.playing ? player.pause() : void readyToPlay().then(() => player.play())
      }
      fg={fg}
      meta={meta}
      mine={mine}
    />
  );
}
