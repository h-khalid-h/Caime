import { type ReactNode, useCallback, useState } from 'react';
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import { type Edge, SafeAreaView } from 'react-native-safe-area-context';
import { usePhoneBar } from '@/state/phoneBar';
import { useTheme } from '@/theme/theme';
import { Text } from './Text';

export function Screen({
  children,
  edges = ['top'],
  style,
  surface,
}: {
  children: ReactNode;
  edges?: Edge[];
  style?: ViewStyle;
  /** White (surface) instead of the canvas. */
  surface?: boolean;
}) {
  const t = useTheme();
  // The phone's bar of places, when it's under the screen, keeps the home indicator's room.
  const bar = usePhoneBar((s) => s.shown);
  return (
    <SafeAreaView
      edges={bar ? edges.filter((e) => e !== 'bottom') : edges}
      style={[{ flex: 1, backgroundColor: surface ? t.c.surface : t.c.canvas }, style]}
    >
      {children}
    </SafeAreaView>
  );
}

/**
 * Whether a place's list has moved off its top (R88): its head stays where it is and draws a
 * hairline under it once there's something beneath to tell it from. Changes state only when the
 * answer does, never per frame.
 */
export function useScrolled(): [boolean, (e: NativeSyntheticEvent<NativeScrollEvent>) => void] {
  const [scrolled, setScrolled] = useState(false);
  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const past = e.nativeEvent.contentOffset.y > 2;
    setScrolled((was) => (was === past ? was : past));
  }, []);
  return [scrolled, onScroll];
}

/**
 * A place's head (the Chats, People, Spaces, Actions headers): a large title at the start with
 * its actions at the end. It stays above the place's list rather than scrolling with it (R88),
 * so what the place offers is always a tap away; `scrolled` draws the hairline under it.
 */
export function PageHeader({
  title,
  subtitle,
  left,
  right,
  scrolled,
}: {
  title: string;
  subtitle?: string | null;
  left?: ReactNode;
  right?: ReactNode;
  scrolled?: boolean;
}) {
  const t = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingTop: 12,
        paddingBottom: 8,
        gap: 8,
        minHeight: 60,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: scrolled ? t.c.border : 'transparent',
      }}
      testID="page-head"
    >
      {left}
      <View style={{ flex: 1 }}>
        <Text variant="title" accessibilityRole="header" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" color="textSecondary" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>{right}</View>
    </View>
  );
}

/** A compact bar for pushed screens: back, centred title, actions. */
export function TopBar({
  title,
  subtitle,
  left,
  right,
  border = true,
  children,
}: {
  title?: string;
  subtitle?: string | null;
  left?: ReactNode;
  right?: ReactNode;
  border?: boolean;
  children?: ReactNode;
}) {
  const t = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: 56,
        paddingHorizontal: 6,
        gap: 4,
        borderBottomWidth: border ? 1 : 0,
        borderBottomColor: t.c.border,
        backgroundColor: t.c.surface,
      }}
    >
      {left}
      <View style={{ flex: 1, minWidth: 0, paddingHorizontal: 6 }}>
        {children ?? (
          <>
            <Text variant="label" numberOfLines={1} accessibilityRole="header">
              {title}
            </Text>
            {subtitle ? (
              <Text variant="caption" color="textSecondary" numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </>
        )}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>{right}</View>
    </View>
  );
}
