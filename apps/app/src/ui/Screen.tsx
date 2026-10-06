import type { ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';
import { type Edge, SafeAreaView } from 'react-native-safe-area-context';
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
  return (
    <SafeAreaView
      edges={edges}
      style={[{ flex: 1, backgroundColor: surface ? t.c.surface : t.c.canvas }, style]}
    >
      {children}
    </SafeAreaView>
  );
}

/** A large, left-aligned page title with actions on the right (the Chats/People/You headers). */
export function PageHeader({
  title,
  subtitle,
  left,
  right,
}: {
  title: string;
  subtitle?: string | null;
  left?: ReactNode;
  right?: ReactNode;
}) {
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
      }}
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
