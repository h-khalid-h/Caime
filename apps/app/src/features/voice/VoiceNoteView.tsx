import { formatDuration } from '@caime/core/format';
import { tr } from '@caime/core/i18n';
import Pause from 'lucide-react-native/icons/pause';
import Play from 'lucide-react-native/icons/play';
import { View } from 'react-native';
import { useTheme } from '@/theme/theme';
import { Pressable } from '@/ui/Pressable';
import { Text } from '@/ui/Text';

/** How a voice note looks in a bubble: play or pause, how far along, how long. */
export function VoiceNoteView({
  playing,
  atMs,
  totalMs,
  onToggle,
  fg,
  meta,
  mine,
}: {
  playing: boolean;
  atMs: number;
  totalMs: number;
  onToggle: () => void;
  fg: string;
  meta: string;
  mine: boolean;
}) {
  const t = useTheme();
  const progress = totalMs > 0 ? Math.min(1, atMs / totalMs) : 0;
  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 200 }}
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
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
          style={{
            height: 4,
            borderRadius: 2,
            backgroundColor: mine ? 'rgba(255,255,255,0.3)' : t.c.border,
            overflow: 'hidden',
          }}
        >
          <View style={{ width: `${progress * 100}%`, height: 4, backgroundColor: fg }} />
        </View>
        <Text variant="caption" color={meta} testID="voice-length">
          {playing || atMs > 0
            ? `${formatDuration(atMs)} / ${formatDuration(totalMs)}`
            : formatDuration(totalMs)}
        </Text>
      </View>
    </View>
  );
}
