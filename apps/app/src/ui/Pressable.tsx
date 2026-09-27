import * as Haptics from 'expo-haptics';
import type { ReactNode, Ref } from 'react';
import {
  Platform,
  Pressable as RNPressable,
  type PressableProps as RNPressableProps,
  type StyleProp,
  type View,
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
  /** To move focus to it (a prop in React 19). */
  ref?: Ref<View>;
}

/**
 * React Native Web turns accessibilityRole into a role but drops accessibilityState, so a
 * checkbox never says it's ticked and a tab never says it's the one showing. Say it as ARIA.
 */
function ariaOf(
  role: RNPressableProps['accessibilityRole'],
  s: RNPressableProps['accessibilityState'],
) {
  if (!s || Platform.OS !== 'web') return {};
  const aria: Record<string, boolean> = {};
  if (s.checked !== undefined && s.checked !== 'mixed') aria['aria-checked'] = s.checked;
  if (s.selected !== undefined)
    aria[role === 'button' ? 'aria-pressed' : 'aria-selected'] = s.selected;
  if (s.disabled) aria['aria-disabled'] = true;
  if (s.busy) aria['aria-busy'] = true;
  if (s.expanded !== undefined) aria['aria-expanded'] = s.expanded;
  return aria;
}

type KeyEvent = {
  key?: string;
  repeat?: boolean;
  nativeEvent?: { key?: string; repeat?: boolean };
  preventDefault?: () => void;
};

/**
 * On the web, Space presses a button but nothing else (react-native-web): a checkbox, a radio or
 * a switch would scroll the page instead of ticking. Space ticks them, as it does a real one.
 */
function spacePresses(
  role: RNPressableProps['accessibilityRole'],
  disabled: boolean | null | undefined,
  onPress: RNPressableProps['onPress'],
  onKeyDown: ((e: KeyEvent) => void) | undefined,
): object {
  if (Platform.OS !== 'web' || !role || !['checkbox', 'radio', 'switch'].includes(role)) return {};
  return {
    onKeyDown: (e: KeyEvent) => {
      onKeyDown?.(e);
      const key = e.nativeEvent?.key ?? e.key;
      if ((key !== ' ' && key !== 'Spacebar') || disabled) return;
      e.preventDefault?.();
      // Held down, it's pressed once, as a real checkbox is: never again with each repeat.
      if (e.nativeEvent?.repeat || e.repeat) return;
      onPress?.(e as never);
    },
  };
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
      {...ariaOf(rest.accessibilityRole, rest.accessibilityState)}
      {...spacePresses(
        rest.accessibilityRole,
        rest.disabled ?? rest.accessibilityState?.disabled,
        onPress,
        (rest as { onKeyDown?: (e: KeyEvent) => void }).onKeyDown,
      )}
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
