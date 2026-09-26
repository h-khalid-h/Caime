import { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';
import { usePrefs } from '@/theme/prefs';
import { useTheme } from '@/theme/theme';

function Bar({ width, height = 12 }: { width: number | `${number}%`; height?: number }) {
  const t = useTheme();
  return (
    <View style={{ width, height, borderRadius: height / 2, backgroundColor: t.c.surfaceMuted }} />
  );
}

const ROWS = Array.from({ length: 12 }, (_, i) => i);

/** Placeholder rows while the first page loads (only ever shown without a cache). */
export function SkeletonRows({ count = 6 }: { count?: number }) {
  const reduce = usePrefs((p) => p.reduceMotion);
  const pulse = useRef(new Animated.Value(0.55)).current;
  useEffect(() => {
    if (reduce) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.55, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reduce]);
  return (
    <Animated.View
      style={{ opacity: pulse }}
      accessibilityLabel="Loading"
      accessibilityRole="progressbar"
    >
      {ROWS.slice(0, count).map((i) => (
        <View
          key={`skeleton-${i}`}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingHorizontal: 16,
            paddingVertical: 12,
          }}
        >
          <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: undefined }}>
            <Bar width={48} height={48} />
          </View>
          <View style={{ flex: 1, gap: 8 }}>
            <Bar width={`${40 + ((i * 17) % 30)}%`} height={13} />
            <Bar width={`${60 + ((i * 11) % 30)}%`} height={11} />
          </View>
        </View>
      ))}
    </Animated.View>
  );
}
