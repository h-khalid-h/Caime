import type { ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';
import { useTheme } from '@/theme/theme';
import { Chevron } from '@/ui/directional';
import type { IconComponent } from './Button';
import { Pressable } from './Pressable';
import { Text } from './Text';

export interface ListRowProps {
  title: string;
  subtitle?: string | null;
  /** The subtitle again, in runs; matched runs are emphasised (search results). */
  subtitleParts?: Array<{ text: string; match: boolean }>;
  icon?: IconComponent;
  iconColor?: string;
  left?: ReactNode;
  right?: ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  destructive?: boolean;
  selected?: boolean;
  style?: ViewStyle;
  testID?: string;
  accessibilityLabel?: string;
  /** A row that picks something reads as a checkbox. */
  checked?: boolean;
  /** One of a list to choose one from (with `checked`): read as a radio, not a checkbox. */
  radio?: boolean;
}

export function ListRow({
  title,
  subtitle,
  subtitleParts,
  icon: Icon,
  iconColor,
  left,
  right,
  onPress,
  chevron,
  destructive,
  selected,
  style,
  testID,
  accessibilityLabel,
  checked,
  radio,
}: ListRowProps) {
  const t = useTheme();
  const content = (hovered: boolean, pressed: boolean, id?: string) => (
    <View
      testID={id}
      style={[
        {
          minHeight: 56,
          paddingHorizontal: 16,
          paddingVertical: 12,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
          backgroundColor: selected
            ? t.c.surfacePressed
            : pressed
              ? t.c.surfacePressed
              : hovered
                ? t.c.surfaceHover
                : 'transparent',
        },
        style,
      ]}
    >
      {left}
      {Icon ? (
        <Icon size={20} color={iconColor ?? (destructive ? t.c.danger : t.c.textSecondary)} />
      ) : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong" color={destructive ? 'danger' : 'text'} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" color="textSecondary" numberOfLines={2}>
            {subtitleParts
              ? subtitleParts.map((part, i) =>
                  part.match ? (
                    // biome-ignore lint/suspicious/noArrayIndexKey: runs have no identity but their order
                    <Text key={i} variant="captionStrong" color="text">
                      {part.text}
                    </Text>
                  ) : (
                    part.text
                  ),
                )
              : subtitle}
          </Text>
        ) : null}
      </View>
      {right}
      {chevron ? <Chevron size={18} color={t.c.textTertiary} /> : null}
    </View>
  );
  // A row that only shows something keeps its id, as a pressable one does.
  if (!onPress) return content(false, false, testID);
  return (
    <Pressable
      testID={testID}
      accessibilityRole={checked === undefined ? 'button' : radio ? 'radio' : 'checkbox'}
      accessibilityState={checked === undefined ? undefined : { checked }}
      accessibilityLabel={accessibilityLabel ?? (subtitle ? `${title}, ${subtitle}` : title)}
      onPress={onPress}
      focusRadius={8}
    >
      {({ hovered, pressed }) => content(hovered, pressed)}
    </Pressable>
  );
}

/** A section's label (BRAND.md: overline, sentence case), with a count beside it when there is one. */
export function SectionTitle({
  children,
  count,
  action,
  testID,
}: {
  children: string;
  /** How many are in it, shown after the label ("Needs you · 3"). */
  count?: number;
  action?: ReactNode;
  testID?: string;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingTop: 18,
        paddingBottom: 6,
      }}
      testID={testID}
    >
      <Text variant="overline" color="textTertiary" accessibilityRole="header">
        {count ? `${children} · ${count}` : children}
      </Text>
      {action}
    </View>
  );
}
