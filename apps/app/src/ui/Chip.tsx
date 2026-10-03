import { tr } from '@caime/core/i18n';
import type { Sphere } from '@caime/core/taxonomy';
import { ScrollView, View, type ViewStyle } from 'react-native';
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
  /** One choice among others (ChoiceChips): a radio, checked when it's selected. */
  role?: 'button' | 'radio';
  /** What it's called aloud, when that isn't its label ("Attention, 3 need you"). */
  accessibilityLabel?: string;
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
  role = 'button',
  accessibilityLabel,
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
      accessibilityRole={role}
      accessibilityState={
        role === 'radio' ? { checked: Boolean(selected) } : { selected: Boolean(selected) }
      }
      accessibilityLabel={accessibilityLabel ?? label}
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

export interface ChoiceChip<T extends string> {
  value: T;
  label: string;
  icon?: IconComponent;
  accessibilityLabel?: string;
  testID?: string;
}

/**
 * One choice among a few, as chips (what Chats shows, whom People lists): announced as one
 * choice, each chip a radio. On a phone the row scrolls sideways; `wrap` lays it out in lines
 * instead, for a desktop, where a mouse's wheel doesn't scroll sideways. Each chip's 44-px target
 * reaches 5 px past its pill and its focus ring 4 px past that, so the row leaves that much room
 * inside itself, where nothing is cut off, and targets side by side never overlap.
 */
export function ChoiceChips<T extends string>({
  label,
  value,
  options,
  onChange,
  wrap,
}: {
  label: string;
  value: T;
  options: Array<ChoiceChip<T>>;
  onChange: (value: T) => void;
  wrap?: boolean;
}) {
  const chips = options.map((o) => (
    <Chip
      key={o.value}
      role="radio"
      label={o.label}
      icon={o.icon}
      accessibilityLabel={o.accessibilityLabel}
      selected={o.value === value}
      onPress={() => onChange(o.value)}
      testID={o.testID}
    />
  ));
  const room: ViewStyle = { paddingHorizontal: 16, paddingTop: 9, paddingBottom: 10 };
  if (wrap)
    return (
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={label}
        style={[room, { flexDirection: 'row', flexWrap: 'wrap', columnGap: 8, rowGap: 10 }]}
      >
        {chips}
      </View>
    );
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      contentContainerStyle={[room, { gap: 8 }]}
    >
      {chips}
    </ScrollView>
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
      accessibilityLabel={tr('Your label: {label}', { label })}
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
