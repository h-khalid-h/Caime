import type { ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';
import { useTheme } from '@/theme/theme';
import type { IconComponent } from './Button';
import { ChevronRight } from './icons';
import { Pressable } from './Pressable';
import { Text } from './Text';

export interface ListRowProps {
  title: string;
  subtitle?: string | null;
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
}

export function ListRow({
  title,
  subtitle,
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
}: ListRowProps) {
  const t = useTheme();
  const content = (hovered: boolean, pressed: boolean) => (
    <View
      style={[
        {
          minHeight: 52,
          paddingHorizontal: 16,
          paddingVertical: 10,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
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
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
      {chevron ? <ChevronRight size={18} color={t.c.textTertiary} /> : null}
    </View>
  );
  if (!onPress) return content(false, false);
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (subtitle ? `${title}, ${subtitle}` : title)}
      onPress={onPress}
      focusRadius={8}
    >
      {({ hovered, pressed }) => content(hovered, pressed)}
    </Pressable>
  );
}

export function SectionTitle({ children, action }: { children: string; action?: ReactNode }) {
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
    >
      <Text variant="overline" color="textTertiary" accessibilityRole="header">
        {children}
      </Text>
      {action}
    </View>
  );
}
