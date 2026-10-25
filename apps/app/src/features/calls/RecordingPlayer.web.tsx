import type { CallRecordingPartView } from '@caime/core/api';
import { tr } from '@caime/core/i18n';
import { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { mediaUrl } from '@/api/client';
import { useTheme } from '@/theme/theme';
import { Text } from '@/ui/Text';
import { screenFor, seekTarget, startOf } from './recordingTimeline';

const ready = (p: CallRecordingPartView) => p.state === 'ready' && Boolean(p.url);

/**
 * A call's recording on the web (M17 I13b, I13c): the voices in the browser's own player on the
 * same origin (the session cookie carries it, by byte ranges as it plays), one part after another,
 * and the screen shown at each moment beside it in step, muted and driven by the voices. A line of
 * the notes opens it at its moment (`seek`); a moment between two parts (someone joining) opens the
 * next.
 */
export default function RecordingPlayer({
  parts,
  width,
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
  const screens = useMemo(() => parts.filter((p) => p.kind === 'screen' && ready(p)), [parts]);
  const [current, setCurrent] = useState(0);
  const part = voices[Math.min(current, voices.length - 1)];
  const [now, setNow] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const audio = useRef<HTMLAudioElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  /** Where to start once the part asked for has loaded, and whether to play it. */
  const pending = useRef<{ offset: number; play: boolean } | null>(null);
  const moment = now ?? (part ? startOf(part) : null);
  const screen = moment === null ? null : screenFor(screens, moment, playing);

  // A line of the notes asked for its moment.
  // biome-ignore lint/correctness/useExhaustiveDependencies: each ask is its count, not its object
  useEffect(() => {
    if (!seek) return;
    const target = seekTarget(voices, Date.parse(seek.at));
    if (!target) return;
    const i = voices.indexOf(target.part);
    if (i === current && audio.current) {
      audio.current.currentTime = target.offsetSeconds;
      void audio.current.play().catch(() => {});
    } else {
      pending.current = { offset: target.offsetSeconds, play: true };
      setCurrent(i);
    }
  }, [seek?.n]);

  // The screen follows the voices: where they are, and whether they play.
  useEffect(() => {
    const v = video.current;
    if (!v || !screen || moment === null) return;
    const want = Math.max(0, (moment - startOf(screen)) / 1000);
    if (Math.abs(v.currentTime - want) > 0.5) v.currentTime = want;
    if (playing && moment >= startOf(screen)) void v.play().catch(() => {});
    else v.pause();
  }, [screen, moment, playing]);

  if (!part) return null;
  const at = () => (audio.current ? startOf(part) + audio.current.currentTime * 1000 : null);
  return (
    <View style={{ gap: 8 }}>
      {/* biome-ignore lint/a11y/useMediaCaption: what was said is the notes beside it */}
      <audio
        ref={audio}
        key={part.id}
        src={mediaUrl(part.url) ?? part.url ?? undefined}
        controls
        preload="metadata"
        aria-label={tr('The call’s voices')}
        data-testid="call-recording-voices"
        style={{ display: 'block', width }}
        onLoadedMetadata={() => {
          const wanted = pending.current;
          pending.current = null;
          if (!wanted || !audio.current) return;
          audio.current.currentTime = wanted.offset;
          if (wanted.play) void audio.current.play().catch(() => {});
        }}
        onTimeUpdate={() => setNow(at())}
        onSeeked={() => setNow(at())}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          // On to the part recorded after someone joined, if there's one.
          if (current < voices.length - 1) {
            pending.current = { offset: 0, play: true };
            setCurrent(current + 1);
          }
        }}
      />
      {screen ? (
        <View style={{ gap: 4 }}>
          <Text variant="caption" color="textSecondary">
            {tr('Screen shown by {name}', {
              name: screen.shownBy?.displayName ?? tr('Deleted account'),
            })}
          </Text>
          <video
            ref={video}
            key={screen.id}
            src={mediaUrl(screen.url) ?? screen.url ?? undefined}
            muted
            playsInline
            preload="metadata"
            aria-label={tr('Screen shown in the call')}
            data-testid="call-recording-screen"
            style={{
              display: 'block',
              width,
              maxHeight: 320,
              objectFit: 'contain',
              borderRadius: t.radii.sm,
              backgroundColor: t.c.surfaceMuted,
            }}
          />
        </View>
      ) : null}
    </View>
  );
}
