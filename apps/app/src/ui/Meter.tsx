import { View } from 'react-native';
import { useTheme } from '@/theme/theme';

/** How much of something is used: a thin bar, calm until it's nearly full (never red: being at
 * what a plan includes isn't an error). */
export function Meter({ used, of, label }: { used: number; of: number; label: string }) {
  const t = useTheme();
  const share = of > 0 ? Math.min(1, used / of) : 0;
  const color = share >= 0.8 ? t.c.warning : t.c.primary;
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: of, now: Math.min(used, of) }}
      style={{
        height: 6,
        borderRadius: 3,
        backgroundColor: t.c.surfaceMuted,
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          width: `${Math.max(share > 0 ? 2 : 0, share * 100)}%`,
          height: '100%',
          borderRadius: 3,
          backgroundColor: color,
        }}
      />
    </View>
  );
}
