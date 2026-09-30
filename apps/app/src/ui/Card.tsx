import type { ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';
import { useTheme } from '@/theme/theme';

export function Card({
  children,
  style,
  padded = true,
}: {
  children: ReactNode;
  style?: ViewStyle;
  padded?: boolean;
}) {
  const t = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: t.c.surface,
          borderRadius: t.radii.lg,
          borderWidth: 1,
          borderColor: t.c.border,
          padding: padded ? 16 : 0,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Divider({ inset = 0 }: { inset?: number }) {
  const t = useTheme();
  return <View style={{ height: 1, backgroundColor: t.c.border, marginStart: inset }} />;
}
