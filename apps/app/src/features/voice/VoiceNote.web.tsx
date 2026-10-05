import { tr } from '@caime/core/i18n';
import { useEffect, useRef, useState } from 'react';
import { mediaUrl } from '@/api/client';
import { toast } from '@/ui/Toast';
import { VoiceNoteView } from './VoiceNoteView';

/**
 * A voice note in a bubble on the web (PRD §46): the browser's own audio element, same origin,
 * so the session cookie carries it. A recording a browser made (webm) says its length only once
 * it has all been read, so the length the sender measured stands until then.
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
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [atMs, setAtMs] = useState(0);
  const [heard, setHeard] = useState<number | null>(null);
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
  const toggle = () => {
    const a = audio.current;
    if (!a) return;
    if (playing) a.pause();
    else
      void a.play().catch((e: unknown) => {
        setPlaying(false);
        console.warn('voice note', e);
        toast(tr('Couldn’t play the voice note'), { tone: 'danger' });
      });
  };
  return (
    <VoiceNoteView
      playing={playing}
      atMs={atMs}
      totalMs={heard ?? durationMs ?? 0}
      onToggle={toggle}
      fg={fg}
      meta={meta}
      mine={mine}
    />
  );
}
