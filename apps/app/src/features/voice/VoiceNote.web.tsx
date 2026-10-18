import { tr } from '@caime/core/i18n';
import { nextRate, waveformIn } from '@caime/core/voice';
import { useEffect, useMemo, useRef, useState } from 'react';
import { mediaUrl } from '@/api/client';
import { toast } from '@/ui/Toast';
import { chooseRate, rateChosen, VoiceNoteView } from './VoiceNoteView';

/**
 * A voice note in a bubble on the web (PRD §46): the browser's own audio element, same origin,
 * so the session cookie carries it. A recording a browser made (webm) says its length only once
 * it has all been read, so the length the sender measured stands until then. Its speed and where
 * it is are the element's own (M16 E4), the pitch kept as the browser keeps it.
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
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [atMs, setAtMs] = useState(0);
  const [heard, setHeard] = useState<number | null>(null);
  const [rate, setRate] = useState(rateChosen);
  const bars = useMemo(() => waveformIn(payload), [payload]);
  useEffect(() => {
    const a = new Audio();
    a.preload = 'none';
    a.src = src;
    const onTime = () => setAtMs(a.currentTime * 1000);
    const onLength = () => {
      if (Number.isFinite(a.duration) && a.duration > 0) setHeard(a.duration * 1000);
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => {
      setPlaying(false);
      a.currentTime = 0;
      setAtMs(0);
    };
    a.addEventListener('timeupdate', onTime);
    a.addEventListener('durationchange', onLength);
    a.addEventListener('play', onPlay);
    a.addEventListener('pause', onPause);
    a.addEventListener('ended', onEnded);
    audio.current = a;
    return () => {
      a.pause();
      a.removeEventListener('timeupdate', onTime);
      a.removeEventListener('durationchange', onLength);
      a.removeEventListener('play', onPlay);
      a.removeEventListener('pause', onPause);
      a.removeEventListener('ended', onEnded);
      a.removeAttribute('src');
      audio.current = null;
    };
  }, [src]);
  // The speed as chosen, while it plays (a press of play sets it on the element too).
  useEffect(() => {
    if (audio.current) audio.current.playbackRate = rate;
  }, [rate]);
  const toggle = () => {
    const a = audio.current;
    if (!a) return;
    if (playing) a.pause();
    else {
      a.playbackRate = rate;
      void a.play().catch((e: unknown) => {
        setPlaying(false);
        console.warn('voice note', e);
        toast(tr('Couldn’t play the voice note'), { tone: 'danger' });
      });
    }
  };
  const seek = (ms: number) => {
    const a = audio.current;
    if (!a) return;
    // Before it has loaded, the element starts there once it does (its default start position).
    a.currentTime = ms / 1000;
    setAtMs(ms);
  };
  const speed = () => {
    const next = nextRate(rate);
    chooseRate(next);
    setRate(next);
  };
  return (
    <VoiceNoteView
      playing={playing}
      atMs={atMs}
      totalMs={heard ?? durationMs ?? 0}
      bars={bars}
      rate={rate}
      onToggle={toggle}
      onSeek={seek}
      onRate={speed}
      fg={fg}
      meta={meta}
      mine={mine}
    />
  );
}
