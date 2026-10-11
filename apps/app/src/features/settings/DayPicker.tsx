/** The days of a week, each on or off (a rule's hours, the work week, a host's hours). Its own
 * file, so pages that only need it don't load the whole rule editor. */
import { weekOrder } from '@caime/core/time';
import { useMemo } from 'react';
import { useUserClock } from '@/lib/time';
import { ChoiceChips } from '@/ui/Chip';

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
 * (R76: Saturday first in Egypt, Monday in France), the days are named in their language, and
 * it's the one group of choice chips (R77): each day `${testID}-${weekday}`, 0 = Sunday.
 */
export function DayPicker({
  days,
  onChange,
  label,
  weekStart,
  testID = 'day',
}: {
  days: number[];
  onChange: (days: number[]) => void;
  label: string;
  /** The first day shown; the person's own week's when left out. */
  weekStart?: number;
  testID?: string;
}) {
  const clock = useUserClock();
  const names = useMemo(() => dayNames(clock.locale), [clock.locale]);
  const order = weekOrder(weekStart ?? clock.weekStart);
  return (
    <ChoiceChips
      multiple
      atLeastOne
      wrap
      flush
      label={label}
      value={days.map(String)}
      onChange={(next) => onChange(next.map(Number).sort((a, b) => a - b))}
      options={order.map((i) => ({
        value: String(i),
        label: names.short[i] ?? '',
        accessibilityLabel: names.long[i],
        testID: `${testID}-${i}`,
      }))}
    />
  );
}
