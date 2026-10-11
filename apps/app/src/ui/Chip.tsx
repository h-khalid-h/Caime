import { tr } from '@caime/core/i18n';
import type { Sphere } from '@caime/core/taxonomy';
import type { ReactNode } from 'react';
import { ScrollView, View, type ViewStyle } from 'react-native';
import { useRtl } from '@/lib/direction';
import { useTheme } from '@/theme/theme';
import { arrowKeyMoves, rovingTabIndex } from './arrowKeys';
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
  /** One choice among others (ChoiceChips): a radio, or a checkbox, checked when it's selected. */
  role?: 'button' | 'radio' | 'checkbox';
  /** What it's called aloud, when that isn't its label ("Attention, 3 need you"). */
  accessibilityLabel?: string;
  /** How many it stands for ("Needs a reply · 3"), after the label. */
  count?: number;
  /** Its place in the keyboard's order (a group with one stop: `rovingTabIndex`). */
  tabIndex?: 0 | -1;
  disabled?: boolean;
  /** Its own colours when selected (a sphere's fill and strong), instead of the primary. */
  colours?: { bg: string; fg: string };
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
  count,
  tabIndex,
  disabled,
  colours,
}: ChipProps) {
  const t = useTheme();
  const tones = {
    neutral: { bg: t.c.surfaceMuted, fg: t.c.textSecondary },
    accent: { bg: t.c.accentSoft, fg: t.scheme === 'dark' ? t.c.accentStrong : t.c.accentStrong },
    warning: { bg: t.c.warningSoft, fg: t.c.warning },
    success: { bg: t.c.successSoft, fg: t.c.success },
    danger: { bg: t.c.dangerSoft, fg: t.c.danger },
  }[tone];
  const bg = selected ? (colours?.bg ?? t.c.primary) : tones.bg;
  const fg = selected ? (colours?.fg ?? t.c.onPrimary) : tones.fg;
  const h = size === 'sm' ? 24 : 34;
  const body = (
    <>
      {Icon ? <Icon size={size === 'sm' ? 12 : 15} color={fg} strokeWidth={2.2} /> : null}
      <Text variant={size === 'sm' ? 'caption' : 'captionStrong'} color={fg} numberOfLines={1}>
        {label}
      </Text>
      {count ? (
        <Text variant="caption" color={fg} style={{ opacity: selected ? 0.85 : 1 }}>
          {count}
        </Text>
      ) : null}
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
      accessibilityState={{
        ...(role === 'button' ? { selected: Boolean(selected) } : { checked: Boolean(selected) }),
        ...(disabled ? { disabled: true } : {}),
      }}
      accessibilityLabel={accessibilityLabel ?? (count ? `${label}, ${count}` : label)}
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      tabIndex={tabIndex}
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
            disabled ? { opacity: 0.5 } : null,
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
  /** A count that needs eyes ("Needs a reply · 3") colours its chip. */
  tone?: 'neutral' | 'accent' | 'warning' | 'success' | 'danger';
  /** How many it stands for, shown after the label (a filter). */
  count?: number;
  /** Its own id; else the group's with its value (`${testID}-${value}`). */
  testID?: string;
  disabled?: boolean;
  /** Its own colours when chosen (a sphere's). */
  colours?: { bg: string; fg: string };
}

type OneChoice<T extends string> = {
  multiple?: false;
  value: T | null;
  onChange: (value: T) => void;
  /** Pressing the one chosen takes it back (a choice that's optional). */
  onClear?: () => void;
};
type SeveralChoices<T extends string> = {
  /** Several at once: a group of checkboxes. */
  multiple: true;
  value: T[];
  onChange: (value: T[]) => void;
  /** The last one chosen can't be taken off (the days of a week, never none). */
  atLeastOne?: boolean;
};

/** `Omit` over each member of a union (TypeScript's own folds the union into one shape). */
export type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export type ChoiceChipsProps<T extends string> = {
  label: string;
  options: Array<ChoiceChip<T>>;
  /** Laid out in lines rather than a row that scrolls sideways (a desktop, a form). */
  wrap?: boolean;
  size?: 'sm' | 'md';
  /** The group's id; each chip is `${testID}-${value}` unless it has its own. */
  testID?: string;
  /** No room around the row (inside a card that has its own). */
  flush?: boolean;
  /** After the chips, in the same row: a button that shows more of them. */
  trailing?: ReactNode;
} & (OneChoice<T> | SeveralChoices<T>);

/**
 * One choice among a few, or several, as chips (R77): what Chats shows, whom People lists, the
 * days a rule runs. One choice is announced as a radio group, each chip a radio and the group
 * one stop for the keyboard (Tab lands on the one chosen, the arrows walk the rest and choose);
 * several is a group of checkboxes. On a phone the row scrolls sideways; `wrap` lays it out in
 * lines instead, for a desktop, where a mouse's wheel doesn't scroll sideways, or a form. Each
 * chip's 44-px target reaches 5 px past its pill and its focus ring 4 px past that, so the row
 * leaves that much room inside itself, where nothing is cut off, and targets side by side never
 * overlap.
 */
export function ChoiceChips<T extends string>(props: ChoiceChipsProps<T>) {
  const { label, options, wrap, size, testID, flush, trailing } = props;
  const rtl = useRtl();
  const many = props.multiple === true;
  const chosen = (v: T) => (props.multiple ? props.value.includes(v) : props.value === v);
  const anyChosen = options.some((o) => chosen(o.value));
  const pick = (o: ChoiceChip<T>) => {
    if (o.disabled) return;
    if (props.multiple) {
      const next = props.value.includes(o.value)
        ? props.value.filter((x) => x !== o.value)
        : [...props.value, o.value];
      if (next.length === 0 && props.atLeastOne) return;
      props.onChange(next);
    } else if (props.value === o.value && props.onClear) props.onClear();
    else props.onChange(o.value);
  };
  const chips = options.map((o, i) => (
    <Chip
      key={o.value}
      role={many ? 'checkbox' : 'radio'}
      label={o.label}
      icon={o.icon}
      tone={o.tone}
      count={o.count}
      size={size}
      accessibilityLabel={o.accessibilityLabel}
      selected={chosen(o.value)}
      disabled={o.disabled}
      colours={o.colours}
      tabIndex={many ? undefined : rovingTabIndex(chosen(o.value), i === 0, anyChosen)}
      onPress={() => pick(o)}
      testID={o.testID ?? (testID ? `${testID}-${o.value}` : undefined)}
    />
  ));
  const group = {
    ...(many ? { role: 'group' as const } : { accessibilityRole: 'radiogroup' as const }),
    accessibilityLabel: label,
    testID,
    ...arrowKeyMoves({
      rtl,
      choose: many ? undefined : (i) => options[i] && pick(options[i]),
    }),
  };
  const room: ViewStyle = flush
    ? { paddingVertical: 5, paddingHorizontal: 4 }
    : { paddingHorizontal: 16, paddingTop: 9, paddingBottom: 10 };
  if (wrap)
    return (
      <View
        {...group}
        style={[room, { flexDirection: 'row', flexWrap: 'wrap', columnGap: 8, rowGap: 10 }]}
      >
        {chips}
        {trailing}
      </View>
    );
  return (
    <View {...group}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[room, { gap: 8 }]}
      >
        {chips}
        {trailing}
      </ScrollView>
    </View>
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
      accessible
      accessibilityRole="text"
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
