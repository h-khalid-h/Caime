import type { Sphere } from '@caishy/core/taxonomy';
import { View, type ViewStyle } from 'react-native';
import { useTheme } from '@/theme/theme';
import type { IconComponent } from './Button';
import { Pressable } from './Pressable';
import { sphereIcon } from './SphereIcon';
import { Text } from './Text';

export interface ChipProps {
  label: string;
  icon?: IconComponent;
  selected?: boolean;
  onPress?: () => void;
  tone?: 'neutral' | 'accent' | 'warning' | 'success' | 'danger';
  size?: 'sm' | 'md';
  style?: ViewStyle;
  testID?: string;
}

export function Chip({
  label,
  icon: Icon,
  selected,
  onPress,
  tone = 'neutral',
  size = 'md',
  style,
  testID,
}: ChipProps) {
  const t = useTheme();
  const tones = {
    neutral: { bg: t.c.surfaceMuted, fg: t.c.textSecondary },
    accent: { bg: t.c.accentSoft, fg: t.scheme === 'dark' ? t.c.accentStrong : t.c.accentStrong },
    warning: { bg: t.c.warningSoft, fg: t.c.warning },
    success: { bg: t.c.successSoft, fg: t.c.success },
    danger: { bg: t.c.dangerSoft, fg: t.c.danger },
  }[tone];
  const bg = selected ? t.c.primary : tones.bg;
  const fg = selected ? t.c.onPrimary : tones.fg;
  const h = size === 'sm' ? 24 : 34;
  const body = (
    <>
      {Icon ? <Icon size={size === 'sm' ? 12 : 15} color={fg} strokeWidth={2.2} /> : null}
      <Text variant={size === 'sm' ? 'caption' : 'captionStrong'} color={fg} numberOfLines={1}>
        {label}
      </Text>
    </>
  );
  const base: ViewStyle = {
    height: h,
    paddingHorizontal: size === 'sm' ? 8 : 12,
    borderRadius: h / 2,
    backgroundColor: bg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
  };
  if (!onPress)
    return (
      <View style={[base, style]} testID={testID}>
        {body}
      </View>
    );
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(selected) }}
      accessibilityLabel={label}
      onPress={onPress}
      haptic
      focusRadius={h / 2 + 5}
      // 34 high, and 44 to a finger, in the phone apps and a phone's browser alike (a hitSlop
      // does nothing on the web): the pill sits in a larger, invisible target that takes no
      // more room, so a tap never lands on the chip beside it by mistake.
      style={[
        {
          alignSelf: 'flex-start',
          paddingVertical: 5,
          paddingHorizontal: 4,
          marginVertical: -5,
          marginHorizontal: -4,
        },
        style,
      ]}
    >
      {({ hovered, pressed }) => (
        <View
          style={[
            base,
            { minHeight: 34, height: undefined, paddingVertical: size === 'sm' ? 4 : 0 },
            !selected && (hovered || pressed) ? { backgroundColor: t.c.surfacePressed } : null,
          ]}
        >
          {body}
        </View>
      )}
    </Pressable>
  );
}

/** A relationship label in its sphere's colour: "Manager · DATA C". Only the owner sees it. */
export function RelationshipChip({
  label,
  sphere,
  size = 'sm',
}: {
  label: string;
  sphere: Sphere | null | undefined;
  size?: 'sm' | 'md';
}) {
  const t = useTheme();
  const s = t.sphere(sphere);
  const Icon = sphereIcon(s.icon);
  const h = size === 'sm' ? 22 : 30;
  return (
    <View
      accessibilityLabel={`Your label: ${label}`}
      style={{
        height: h,
        paddingHorizontal: size === 'sm' ? 7 : 10,
        borderRadius: h / 2,
        backgroundColor: s.fill,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        alignSelf: 'flex-start',
        maxWidth: '100%',
      }}
    >
      <Icon size={size === 'sm' ? 11 : 14} color={s.strong} strokeWidth={2.4} />
      <Text
        variant={size === 'sm' ? 'caption' : 'captionStrong'}
        color={s.strong}
        numberOfLines={1}
        style={{ flexShrink: 1 }}
      >
        {label}
      </Text>
    </View>
  );
}
