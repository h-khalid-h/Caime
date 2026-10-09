import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useRtl } from '@/lib/direction';

/**
 * React Native Web turns `start` and `end` into a physical side by its own locale context, not
 * by the document's `dir`, so a layout under `<html dir="rtl">` had its rows mirrored and its
 * logical margins, insets and corners still left to right (R73). A `dir` on a View sets that
 * context for everything inside: the root wraps the app in one, and a Modal (a sheet), which
 * React Native Web mounts outside the root, wraps its own.
 */
export function Direction({ children }: { children: ReactNode }) {
  const rtl = useRtl();
  const dir: Record<string, string> = { dir: rtl ? 'rtl' : 'ltr' };
  return (
    <View {...dir} style={{ flex: 1 }}>
      {children}
    </View>
  );
}
