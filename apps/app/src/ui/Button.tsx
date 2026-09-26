import type { ComponentType } from 'react';
import { ActivityIndicator, View, type ViewStyle } from 'react-native';
import { useTheme } from '@/theme/theme';
import { Pressable } from './Pressable';
import { Text } from './Text';

export type ButtonVariant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger';
export type IconComponent = ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  icon?: IconComponent;
  loading?: boolean;
  disabled?: boolean;
  /** Stretch to the container's width. */
  block?: boolean;
  accessibilityHint?: string;
  style?: ViewStyle;
  testID?: string;
}

const HEIGHT = { sm: 36, md: 44, lg: 52 } as const;

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon: Icon,
  loading,
  disabled,
  block,
  accessibilityHint,
  style,
  testID,
}: ButtonProps) {
  const t = useTheme();
  const c = t.c;
  const palette = {
    primary: { bg: c.primary, hover: c.primaryPressed, fg: c.onPrimary, border: 'transparent' },
    accent: { bg: c.accent, hover: c.accentStrong, fg: c.onAccent, border: 'transparent' },
    secondary: { bg: c.surfaceMuted, hover: c.surfacePressed, fg: c.text, border: 'transparent' },
    ghost: { bg: 'transparent', hover: c.surfaceHover, fg: c.link, border: 'transparent' },
    danger: { bg: c.dangerSoft, hover: c.dangerSoft, fg: c.danger, border: 'transparent' },
  }[variant];
  const inactive = disabled || loading;
  const radius = t.playful ? t.radii.pill : t.radii.md;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: Boolean(inactive), busy: Boolean(loading) }}
      disabled={inactive}
      onPress={onPress}
      haptic
      focusRadius={radius}
      style={({ pressed, hovered }) => [
        {
          height: HEIGHT[size],
          minWidth: HEIGHT[size],
          paddingHorizontal: size === 'sm' ? 14 : 20,
          borderRadius: radius,
          backgroundColor: pressed || hovered ? palette.hover : palette.bg,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: 8,
          opacity: disabled ? 0.45 : 1,
          alignSelf: block ? 'stretch' : 'flex-start',
          transform: pressed && t.playful ? [{ scale: 0.98 }] : undefined,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <>
          {Icon ? (
            <View accessible={false}>
              <Icon size={size === 'sm' ? 16 : 18} color={palette.fg} strokeWidth={2.2} />
            </View>
          ) : null}
          <Text
            variant={size === 'sm' ? 'captionStrong' : 'label'}
            color={palette.fg}
            numberOfLines={1}
          >
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}
