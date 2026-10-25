import type { CallRecordingPartView } from '@caime/core/api';
import { tr } from '@caime/core/i18n';
import { nextRate } from '@caime/core/voice';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import Play from 'lucide-react-native/icons/play';
import { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { mediaHeaders, mediaUrl } from '@/api/client';
import { openFile } from '@/lib/openFile';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { readyToPlay } from '../voice/VoiceNote';
import { chooseRate, rateChosen, VoiceNoteView } from '../voice/VoiceNoteView';
import { seekTarget, startOf } from './recordingTimeline';

const ready = (p: CallRecordingPartView) => p.state === 'ready' && Boolean(p.url);

/**
 * A call's recording on a phone (M17 I13b, I13c): the voices played here as a voice note is
 * (expo-audio, with the session), one part after another, faster or slower and anywhere along
 * them, and a line of the notes opens them at its moment (`seek`). A screen shown opens in the
 * phone's own player, fetched with the session once (R88): in step with the voices on the web only.
 */
export default function RecordingPlayer({
  parts,
  seek,
}: {
  parts: CallRecordingPartView[];
  width: number;
  /** A moment to play from, asked by a line of the notes (`n` counts each ask). */
  seek: { at: string; n: number } | null;
}) {
  const t = useTheme();
  const voices = useMemo(
    () =>
      parts.filter((p) => p.kind === 'voices' && ready(p)).sort((a, b) => startOf(a) - startOf(b)),
    [parts],
  );
  const screens = parts.filter((p) => p.kind === 'screen' && ready(p));
  const [current, setCurrent] = useState(0);
  const part = voices[Math.min(current, voices.length - 1)];
  const src = part ? (mediaUrl(part.url) ?? part.url) : null;
  // A new part is a new player: expo-audio makes one for each source.
  const player = useAudioPlayer(
    src ? { uri: src, headers: mediaHeaders() as Record<string, string> } : null,
  );
  const status = useAudioPlayerStatus(player);
  const [rate, setRate] = useState(rateChosen);
  /** Where to start once the part asked for has loaded, and whether to play it. */
  const pending = useRef<{ offset: number; play: boolean } | null>(null);

  // A line of the notes asked for its moment: its part, then its place in it once that's loaded.
  // biome-ignore lint/correctness/useExhaustiveDependencies: each ask is its count, not its object
  useEffect(() => {
    if (!seek) return;
    const target = seekTarget(voices, Date.parse(seek.at));
    if (!target) return;
    pending.current = { offset: target.offsetSeconds, play: true };
    setCurrent(voices.indexOf(target.part));
  }, [seek?.n]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: an ask applies once its player has loaded
  useEffect(() => {
    const wanted = pending.current;
    if (!wanted || !status.isLoaded) return;
    pending.current = null;
    void readyToPlay().then(async () => {
      await player.seekTo(wanted.offset).catch(() => {});
      if (wanted.play) player.play();
    });
  }, [player, status.isLoaded, seek?.n]);
  // On to the part recorded after someone joined, if there's one.
  useEffect(() => {
    if (!status.didJustFinish) return;
    if (current < voices.length - 1) {
      pending.current = { offset: 0, play: true };
      setCurrent(current + 1);
    } else {
      player.pause();
      player.seekTo(0).catch(() => {});
    }
  }, [status.didJustFinish, current, voices.length, player]);
  useEffect(() => {
    player.setPlaybackRate(rate, 'high');
  }, [player, rate]);

  if (!part && !screens.length) return null;
  const total = status.duration > 0 ? status.duration * 1000 : (part?.durationMs ?? 0);
  return (
    <View style={{ gap: 8 }}>
      {part ? (
        <View testID="call-recording-voices">
          <VoiceNoteView
            playing={status.playing}
            atMs={status.currentTime > 0 ? status.currentTime * 1000 : 0}
            totalMs={total}
            bars={null}
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
            fg={t.c.text}
            meta={t.c.textTertiary}
            mine={false}
          />
        </View>
      ) : null}
      {screens.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {screens.map((screen) => (
            <Button
              key={screen.id}
              label={tr('Play the screen')}
              icon={Play}
              size="sm"
              variant="secondary"
              onPress={() =>
                void openFile({
                  id: screen.id,
                  url: screen.url ?? '',
                  mime: screen.mime,
                  name: 'screen.mp4',
                })
              }
              testID="call-recording-screen"
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}
