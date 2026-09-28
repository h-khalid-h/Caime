import { minTouchTarget } from '@caime/brand/tokens';
import { View, type ViewStyle } from 'react-native';
import { useTheme } from '@/theme/theme';
import type { IconComponent } from './Button';
import { Pressable } from './Pressable';

export interface IconButtonProps {
  icon: IconComponent;
  /** Required: this is the button's name for screen readers. */
  label: string;
  onPress?: () => void;
  size?: number;
  color?: string;
  /** Filled circle behind the icon. */
  filled?: boolean;
  tone?: 'default' | 'primary' | 'accent';
  disabled?: boolean;
  badge?: boolean;
  style?: ViewStyle;
  /** Extra reach around a button drawn smaller than a finger (over a photo, say). */
  hitSlop?: number;
  testID?: string;
}

export function IconButton({
  icon: Icon,
  label,
  onPress,
  size = 22,
  color,
  filled,
  tone = 'default',
  disabled,
  badge,
  style,
  hitSlop,
  testID,
}: IconButtonProps) {
  const t = useTheme();
  const bg =
    tone === 'primary'
      ? t.c.primary
      : tone === 'accent'
        ? t.c.accent
        : filled
          ? t.c.surfaceMuted
          : 'transparent';
  const fg =
    color ??
    (tone === 'primary' ? t.c.onPrimary : tone === 'accent' ? t.c.onAccent : t.c.textSecondary);
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={hitSlop}
      haptic
      focusRadius={minTouchTarget / 2}
      style={({ pressed, hovered }) => [
        {
          width: minTouchTarget,
          height: minTouchTarget,
          borderRadius: minTouchTarget / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: (pressed || hovered) && tone === 'default' ? t.c.surfaceHover : bg,
          opacity: disabled ? 0.4 : pressed && tone !== 'default' ? 0.85 : 1,
        },
        style,
      ]}
    >
      <Icon size={size} color={fg} strokeWidth={2} />
      {badge ? (
        <View
          style={{
            position: 'absolute',
            top: 9,
            right: 9,
            width: 9,
            height: 9,
            borderRadius: 5,
            backgroundColor: t.c.accentStrong,
            borderWidth: 2,
            borderColor: t.c.canvas,
          }}
        />
      ) : null}
    </Pressable>
  );
}
