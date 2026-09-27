/**
 * What the 1:1 and the group call screens share: the video and audio elements, the round
 * buttons, the ringtone, keeping the keyboard in the screen, and the running clock.
 */
import { createElement, type Ref, useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import type { IconComponent } from '@/ui/Button';
import { Pressable } from '@/ui/Pressable';
import { Text } from '@/ui/Text';

export const INK = '#0B0B12';
/** Readable over whatever the other camera shows. */
export const OVER_VIDEO = {
  textShadowColor: '#00000099',
  textShadowRadius: 8,
  textShadowOffset: { width: 0, height: 1 },
};

/** A camera or a voice, played: the remote one with sound, this device's own muted. */
export function Media({
  stream,
  video,
  mine,
  fit = 'cover',
  testID,
}: {
  stream: MediaStream;
  video: boolean;
  mine?: boolean;
  /** A camera fills the screen; a shared screen is shown whole. */
  fit?: 'cover' | 'contain';
  testID: string;
}) {
  // A callback ref: when the voice becomes a picture, the new element gets the stream too.
  const attach = useCallback(
    (el: HTMLMediaElement | null) => {
      if (el && el.srcObject !== stream) el.srcObject = stream;
    },
    [stream],
  );
  return createElement(video ? 'video' : 'audio', {
    ref: attach,
    autoPlay: true,
    playsInline: true,
    muted: mine,
    'data-testid': testID,
    style: video
      ? {
          width: '100%',
          height: '100%',
          objectFit: fit,
          transform: mine ? 'scaleX(-1)' : undefined,
          display: 'block',
        }
      : { display: 'none' },
  });
}

export function Round({
  icon: Icon,
  label,
  onPress,
  tone = 'plain',
  on = false,
  focusRef,
  testID,
}: {
  icon: IconComponent;
  label: string;
  onPress: () => void;
  tone?: 'plain' | 'end' | 'go';
  on?: boolean;
  /** The button focus goes to when the screen changes. */
  focusRef?: Ref<View>;
  testID: string;
}) {
  const bg = tone === 'end' ? '#E5484D' : tone === 'go' ? '#30A46C' : on ? '#FFFFFF' : '#FFFFFF29';
  return (
    <View style={{ alignItems: 'center', gap: 6 }}>
      <Pressable
        ref={focusRef}
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        testID={testID}
        style={({ pressed }) => ({
          width: 64,
          height: 64,
          borderRadius: 32,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: bg,
          opacity: pressed ? 0.8 : 1,
        })}
      >
        <Icon size={26} color={on ? INK : '#FFFFFF'} />
      </Pressable>
      <Text variant="caption" style={{ color: '#FFFFFFCC' }}>
        {label}
      </Text>
    </View>
  );
}

/**
 * A soft two-note ring while a call rings for this person, so a tab in the background is heard.
 * Where the browser won't let a page play sound yet, it stays quiet: the screen still shows it.
 */
export function useRingtone(ringing: boolean) {
  useEffect(() => {
    if (!ringing || typeof window === 'undefined' || !('AudioContext' in window)) return;
    let audio: AudioContext;
    try {
      audio = new AudioContext();
    } catch {
      return;
    }
    const ring = () => {
      if (audio.state === 'closed') return;
      const at = audio.currentTime;
      const gain = audio.createGain();
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.06, at + 0.05);
      gain.gain.setValueAtTime(0.06, at + 0.9);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 1);
      gain.connect(audio.destination);
      for (const frequency of [440, 480]) {
        const tone = audio.createOscillator();
        tone.frequency.value = frequency;
        tone.connect(gain);
        tone.start(at);
        tone.stop(at + 1);
      }
    };
    ring();
    const every = setInterval(ring, 3000);
    return () => {
      clearInterval(every);
      void audio.close().catch(() => {});
    };
  }, [ringing]);
}

/**
 * While the call screen is up, the keyboard stays in it (Tab and Shift+Tab go round its
 * buttons, never to the app hidden behind), and when it closes, focus goes back where it was.
 */
export function useFocusInside(shown: boolean) {
  const root = useRef<View>(null);
  useEffect(() => {
    if (!shown || typeof document === 'undefined') return;
    const before = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      const el = root.current as unknown as HTMLElement | null;
      if (e.key !== 'Tab' || !el) return;
      const stops = [
        ...el.querySelectorAll<HTMLElement>(
          'button, [href], input, [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((x) => !x.hasAttribute('disabled') && x.offsetParent !== null);
      if (!stops.length) return;
      const first = stops[0]!;
      const last = stops[stops.length - 1]!;
      const at = document.activeElement as HTMLElement | null;
      const outside = !at || !el.contains(at);
      if (e.shiftKey ? outside || at === first : outside || at === last) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (before?.isConnected) before.focus();
    };
  }, [shown]);
  return root;
}

/** "0:42", "12:05", "1:02:05": how long it's been since it was answered. */
export function useElapsed(since: string | null, running: boolean): string {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!running) return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [running]);
  if (!since) return '0:00';
  const s = Math.max(0, Math.floor((now - Date.parse(since)) / 1000));
  const mm = String(Math.floor(s / 60) % 60).padStart(s >= 3600 ? 2 : 1, '0');
  const ss = String(s % 60).padStart(2, '0');
  return s >= 3600 ? `${Math.floor(s / 3600)}:${mm}:${ss}` : `${mm}:${ss}`;
}
