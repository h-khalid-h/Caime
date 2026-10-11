/** The days of a week, each on or off (a rule's hours, the work week). Its own file, so pages
 * that only need it don't load the whole rule editor. */
import { weekOrder } from '@caime/core/time';
import { useMemo } from 'react';
import { View } from 'react-native';
import { useUserClock } from '@/lib/time';
import { useTheme } from '@/theme/theme';
import { Pressable } from '@/ui/Pressable';
import { Text } from '@/ui/Text';

/** A Sunday, for naming the days of the week from. */
const A_SUNDAY = Date.UTC(2023, 0, 1);

/** The days' names in a language, short and long, 0 = Sunday (Intl: "Sun", "الأحد", "dim."). */
export function dayNames(locale: string): { short: string[]; long: string[] } {
  const name = (style: 'short' | 'long') => {
    const f = new Intl.DateTimeFormat(locale, { weekday: style, timeZone: 'UTC' });
    return [0, 1, 2, 3, 4, 5, 6].map((i) => f.format(new Date(A_SUNDAY + i * 86_400_000)));
  };
  try {
    return { short: name('short'), long: name('long') };
  } catch {
    return {
      short: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
      long: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    };
  }
}

/**
 * The days of a week, each on or off; never none. The week runs as the person's country's does
 * (R76: Saturday first in Egypt, Monday in France), and the days are named in their language.
 */
export function DayPicker({
  days,
  onChange,
  label,
  weekStart,
}: {
  days: number[];
  onChange: (days: number[]) => void;
  label: string;
  /** The first day shown; the person's own week's when left out. */
  weekStart?: number;
}) {
  const t = useTheme();
  const clock = useUserClock();
  const names = useMemo(() => dayNames(clock.locale), [clock.locale]);
  const order = weekOrder(weekStart ?? clock.weekStart);
  return (
    // A group named for what it is ("Your work week", "Days"), so each day says whose it is.
    <View
      role="group"
      accessibilityLabel={label}
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}
    >
      {order.map((i) => {
        const on = days.includes(i);
        return (
          <Pressable
            key={i}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            accessibilityLabel={names.long[i]}
            onPress={() => {
              const next = on ? days.filter((x) => x !== i) : [...days, i].sort();
              if (next.length) onChange(next);
            }}
            style={{
              minWidth: 44,
              minHeight: 44,
              paddingHorizontal: 12,
              borderRadius: t.radii.sm,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: on ? t.c.primary : t.c.surfaceMuted,
            }}
            testID={`day-${i}`}
          >
            <Text variant="captionStrong" color={on ? t.c.onPrimary : t.c.textSecondary}>
              {names.short[i]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
