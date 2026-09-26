import * as Haptics from 'expo-haptics';
import type { ReactNode } from 'react';
import {
  Platform,
  Pressable as RNPressable,
  type PressableProps as RNPressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '@/theme/theme';
import { useKeyboardMode } from './focus';

export interface PressState {
  pressed: boolean;
  hovered: boolean;
  focused: boolean;
}

export interface PressableProps extends Omit<RNPressableProps, 'style' | 'children'> {
  style?: StyleProp<ViewStyle> | ((s: PressState) => StyleProp<ViewStyle>);
  children?: ReactNode | ((s: PressState) => ReactNode);
  /** A light tap on native when pressed. */
  haptic?: boolean;
  /** Draw the keyboard focus ring (web). Default true. */
  focusRing?: boolean;
  focusRadius?: number;
}

/** Pressable with hover and keyboard-focus states on the web and haptics on phones. */
export function Pressable({
  style,
  children,
  haptic,
  focusRing = true,
  focusRadius,
  onPress,
  ...rest
}: PressableProps) {
  const t = useTheme();
  const keyboard = useKeyboardMode();
  return (
    <RNPressable
      {...rest}
      onPress={(e) => {
        if (haptic && Platform.OS !== 'web') void Haptics.selectionAsync().catch(() => {});
        onPress?.(e);
      }}
      style={(raw) => {
        const s = raw as unknown as PressState;
        const state: PressState = {
          pressed: s.pressed,
          hovered: Boolean(s.hovered),
          focused: Boolean(s.focused),
        };
        const base = typeof style === 'function' ? style(state) : style;
        const ring: ViewStyle | null =
          focusRing && keyboard && state.focused && Platform.OS === 'web'
            ? ({
                outlineColor: t.c.focus,
                outlineStyle: 'solid',
                outlineWidth: 2,
                outlineOffset: 2,
                borderRadius: focusRadius,
              } as ViewStyle)
            : Platform.OS === 'web'
              ? ({ outlineStyle: 'none' } as unknown as ViewStyle)
              : null;
        return [base, ring];
      }}
    >
      {(raw) => {
        const s = raw as unknown as PressState;
        const state: PressState = {
          pressed: s.pressed,
          hovered: Boolean(s.hovered),
          focused: Boolean(s.focused),
        };
        return typeof children === 'function' ? children(state) : children;
      }}
    </RNPressable>
  );
}
