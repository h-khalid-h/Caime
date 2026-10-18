import { formatDuration } from '@caime/core/format';
import { tr } from '@caime/core/i18n';
import { numberFormat } from '@caime/core/locale';
import { stepped, WAVEFORM_TOP } from '@caime/core/voice';
import Pause from 'lucide-react-native/icons/pause';
import Play from 'lucide-react-native/icons/play';
import { useRef } from 'react';
import { type GestureResponderEvent, Platform, View } from 'react-native';
import { useRtl } from '@/lib/direction';
import { useUserClock } from '@/lib/time';
import { useTheme } from '@/theme/theme';
import { Pressable } from '@/ui/Pressable';
import { Text } from '@/ui/Text';

/** The speed chosen last, which the next note starts at (for as long as the app is open). */
let chosenRate = 1;
export const rateChosen = (): number => chosenRate;
export const chooseRate = (rate: number): void => {
  chosenRate = rate;
};

/** How far a screen reader's or a keyboard's step moves a note along. */
const STEP_MS = 5_000;
/** Bars without a recording's own shape: a flat line, never a made-up one. */
const FLAT = [...Array(32)].map(() => 0);

/** Where along the bars a press landed, 0 at their start and 1 at their end, in either direction. */
function fractionAt(e: GestureResponderEvent, width: number, rtl: boolean): number {
  let x: number;
  let w = width;
  if (Platform.OS === 'web') {
    // The browser's click: where it landed against the bars as they're drawn now.
    const target = (e as unknown as { currentTarget: HTMLElement }).currentTarget;
    const box = target.getBoundingClientRect();
    x = (e.nativeEvent as unknown as MouseEvent).clientX - box.left;
    w = box.width;
  } else x = e.nativeEvent.locationX;
  if (!(w > 0)) return 0;
  const along = Math.min(1, Math.max(0, x / w));
  return rtl ? 1 - along : along;
}

/**
 * How a voice note looks in a bubble (M16 E4): play or pause, its bars as its recorder heard them
 * (played in the bubble's words' colour), pressed anywhere to go there, how far along and how
 * long, and while it plays, its speed.
 */
export function VoiceNoteView({
  playing,
  atMs,
  totalMs,
  bars,
  rate,
  onToggle,
  onSeek,
  onRate,
  fg,
  meta,
  mine,
}: {
  playing: boolean;
  atMs: number;
  totalMs: number;
  /** The note's bars; null for one without them (older notes), drawn flat. */
  bars: number[] | null;
  rate: number;
  onToggle: () => void;
  onSeek: (ms: number) => void;
  onRate: () => void;
  fg: string;
  meta: string;
  mine: boolean;
}) {
  const t = useTheme();
  const rtl = useRtl();
  const { locale } = useUserClock();
  const width = useRef(0);
  const progress = totalMs > 0 ? Math.min(1, atMs / totalMs) : 0;
  const shape = bars ?? FLAT;
  const played = Math.round(progress * shape.length);
  const step = (ms: number) => onSeek(stepped(atMs, ms, totalMs));
  const rateText = `${numberFormat(locale, { maximumFractionDigits: 1 }).format(rate)}×`;
  const started = playing || atMs > 0;
  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 220 }}
      testID="voice-note"
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={playing ? tr('Pause') : tr('Play voice note')}
        onPress={onToggle}
        focusRadius={20}
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: mine ? 'rgba(255,255,255,0.18)' : t.c.surface,
          alignItems: 'center',
          justifyContent: 'center',
        }}
        testID="voice-play"
      >
        {playing ? <Pause size={18} color={fg} /> : <Play size={18} color={fg} />}
      </Pressable>
      <View style={{ flex: 1, gap: 4 }}>
        <Pressable
          accessibilityRole="adjustable"
          accessibilityLabel={tr('Voice note position')}
          accessibilityValue={{
            min: 0,
            max: Math.round(totalMs / 1000),
            now: Math.round(atMs / 1000),
            text: `${formatDuration(atMs)} / ${formatDuration(totalMs)}`,
          }}
          accessibilityActions={[
            { name: 'increment', label: tr('Forward 5 seconds') },
            { name: 'decrement', label: tr('Back 5 seconds') },
          ]}
          onAccessibilityAction={(e) =>
            step(e.nativeEvent.actionName === 'increment' ? STEP_MS : -STEP_MS)
          }
          onKeyDown={(e) => {
            const forward = rtl ? 'ArrowLeft' : 'ArrowRight';
            const back = rtl ? 'ArrowRight' : 'ArrowLeft';
            if (e.key === forward || e.key === 'ArrowUp') step(STEP_MS);
            else if (e.key === back || e.key === 'ArrowDown') step(-STEP_MS);
            else return;
            e.preventDefault?.();
          }}
          onLayout={(e) => {
            width.current = e.nativeEvent.layout.width;
          }}
          onPress={(e) => {
            if (totalMs > 0) onSeek(fractionAt(e, width.current, rtl) * totalMs);
          }}
          style={{ height: 28, flexDirection: 'row', alignItems: 'center', gap: 1.5 }}
          testID="voice-wave"
        >
          {shape.map((bar, i) => (
            <View
              // biome-ignore lint/suspicious/noArrayIndexKey: a bar is its place in the note
              key={i}
              pointerEvents="none"
              style={{
                flex: 1,
                maxWidth: 4,
                height: 3 + Math.round((bar / WAVEFORM_TOP) * 21),
                borderRadius: 1.5,
                backgroundColor: i < played ? fg : meta,
                opacity: i < played ? 1 : 0.45,
              }}
            />
          ))}
        </Pressable>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text variant="caption" color={meta} style={{ flex: 1 }} testID="voice-length">
            {started
              ? `${formatDuration(atMs)} / ${formatDuration(totalMs)}`
              : formatDuration(totalMs)}
          </Text>
          {started ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={tr('Playback speed: {rate}', { rate: rateText })}
              onPress={onRate}
              hitSlop={8}
              style={{
                paddingHorizontal: 8,
                height: 22,
                borderRadius: t.radii.sm,
                backgroundColor: mine ? 'rgba(255,255,255,0.18)' : t.c.surface,
                alignItems: 'center',
                justifyContent: 'center',
              }}
              testID="voice-speed"
            >
              <Text variant="captionStrong" color={fg}>
                {rateText}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}
