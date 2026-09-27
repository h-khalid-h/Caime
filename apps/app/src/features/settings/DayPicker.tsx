/** The days of a week, each on or off (a rule's hours, the work week). Its own file, so pages
 * that only need it don't load the whole rule editor. */
import { View } from 'react-native';
import { useTheme } from '@/theme/theme';
import { Pressable } from '@/ui/Pressable';
import { Text } from '@/ui/Text';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** The days of a week, each on or off; never none. */
export function DayPicker({
  days,
  onChange,
  label,
}: {
  days: number[];
  onChange: (days: number[]) => void;
  label: string;
}) {
  const t = useTheme();
  return (
    // A group named for what it is ("Your work week", "Days"), so each day says whose it is.
    <View
      role="group"
      accessibilityLabel={label}
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}
    >
      {DAYS.map((d, i) => {
        const on = days.includes(i);
        return (
          <Pressable
            key={d}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            accessibilityLabel={DAY_NAMES[i]}
            onPress={() => {
              const next = on ? days.filter((x) => x !== i) : [...days, i].sort();
              if (next.length) onChange(next);
            }}
            style={{
              minWidth: 44,
              minHeight: 44,
              paddingHorizontal: 12,
              borderRadius: 12,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: on ? t.c.primary : t.c.surfaceMuted,
            }}
          >
            <Text variant="captionStrong" color={on ? t.c.onPrimary : t.c.textSecondary}>
              {d}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
