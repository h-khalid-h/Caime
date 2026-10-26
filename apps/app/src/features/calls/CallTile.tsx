/**
 * A call made small (R121): while the person writes in its conversation, or goes anywhere else in
 * Caime, the call goes on in this tile at the top end, under the header: who and how long, mute,
 * back to the call, hang up. The engines hold the call; its screen stays mounted under the tile,
 * out of sight, so every voice keeps playing and nothing about the connections changes.
 */
import { radii, themes } from '@caime/brand/tokens';
import { tr } from '@caime/core/i18n';
import Maximize2 from 'lucide-react-native/icons/maximize-2';
import Mic from 'lucide-react-native/icons/mic';
import MicOff from 'lucide-react-native/icons/mic-off';
import PhoneOff from 'lucide-react-native/icons/phone-off';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/theme';
import type { IconComponent } from '@/ui/Button';
import { Pressable } from '@/ui/Pressable';
import { lifted } from '@/ui/shadow';
import { Text } from '@/ui/Text';
import { INK, OVER_APP } from './callUi';

/** A tile's button: the call's own round, small. */
function Small({
  icon: Icon,
  label,
  onPress,
  end = false,
  on = false,
  testID,
}: {
  icon: IconComponent;
  label: string;
  onPress: () => void;
  end?: boolean;
  on?: boolean;
  testID: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={end ? undefined : { selected: on }}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => ({
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: end ? themes.light.danger : on ? '#FFFFFF' : '#FFFFFF29',
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <Icon size={18} color={on ? INK : '#FFFFFF'} />
    </Pressable>
  );
}

export function CallTile({
  label,
  mark,
  title,
  status,
  over = false,
  muted,
  onMute,
  onBack,
  onEnd,
  endLabel,
}: {
  /** What a screen reader calls it: the call screen's own name ("Voice call with Sam"). */
  label: string;
  /** Who it's with: their photo, or the group's. */
  mark: ReactNode;
  title: string;
  /** How long it's been, or what's happening now ("Reconnecting…", "Call ended"). */
  status: string;
  /** Ended: it says so a moment, with nothing left to press but the way back. */
  over?: boolean;
  muted: boolean;
  onMute: () => void;
  onBack: () => void;
  onEnd: () => void;
  endLabel: string;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      role="region"
      aria-label={label}
      testID="call-tile"
      style={{
        position: OVER_APP.position,
        // Clear of a screen's header, at its end, where a conversation's oldest lines are.
        top: insets.top + 72,
        end: 12,
        zIndex: OVER_APP.zIndex,
        width: 304,
        maxWidth: '92%',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        padding: 8,
        borderRadius: radii.lg,
        backgroundColor: INK,
        ...lifted(t.c.shadow, 6, 16),
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={tr('Back to the call')}
        onPress={onBack}
        testID="call-tile-back"
        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 40 }}
      >
        {mark}
        <View style={{ flex: 1 }}>
          <Text variant="captionStrong" style={{ color: '#FFFFFF' }} numberOfLines={1}>
            {title}
          </Text>
          <Text
            variant="caption"
            style={{ color: '#FFFFFFCC' }}
            numberOfLines={1}
            testID="call-tile-status"
          >
            {status}
          </Text>
        </View>
        <Maximize2 size={16} color="#FFFFFF" />
      </Pressable>
      {over ? null : (
        <>
          <Small
            icon={muted ? MicOff : Mic}
            label={muted ? tr('Unmute') : tr('Mute')}
            on={muted}
            onPress={onMute}
            testID="call-tile-mute"
          />
          <Small icon={PhoneOff} label={endLabel} end onPress={onEnd} testID="call-tile-end" />
        </>
      )}
    </View>
  );
}
