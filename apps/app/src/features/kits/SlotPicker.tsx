/**
 * The open slots an organization can be booked in (R51), by day, each a chip: a customer, or
 * the team, picks one for an appointment card. Shown in the viewer's own time, as every time is;
 * each day's times are one group of choice chips (R77), the one chosen `slot-<iso>`.
 */
import { formatClock, formatDayHeading } from '@caime/core/format';
import { tr } from '@caime/core/i18n';
import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { ChoiceChips } from '@/ui/Chip';
import { Text } from '@/ui/Text';

export function SlotPicker({
  slots,
  slotMinutes,
  value,
  onChange,
  timeZone,
  locale,
}: {
  slots: string[];
  slotMinutes: number;
  value: string | null;
  onChange: (iso: string) => void;
  timeZone: string;
  locale: string;
}) {
  // "Today" and "Tomorrow" are named from when the picker opened: a form lives minutes, and a
  // new clock each render would undo the memo below.
  const [now] = useState(() => new Date());
  const days = useMemo(() => {
    const byDay = new Map<string, string[]>();
    for (const iso of slots) {
      const day = formatDayHeading(iso, now, timeZone, locale);
      byDay.set(day, [...(byDay.get(day) ?? []), iso]);
    }
    return [...byDay];
  }, [slots, timeZone, locale, now]);
  return (
    <View style={{ gap: 10 }} testID="slot-picker">
      <Text variant="label">{tr('When · {slotMinutes} min', { slotMinutes })}</Text>
      <ScrollView style={{ maxHeight: 260 }} nestedScrollEnabled>
        <View style={{ gap: 10 }}>
          {days.map(([day, times]) => (
            <View key={day} style={{ gap: 6 }}>
              <Text variant="overline" color="textTertiary">
                {day}
              </Text>
              <ChoiceChips
                wrap
                flush
                label={day}
                value={value}
                onChange={onChange}
                options={times.map((iso) => ({
                  value: iso,
                  label: formatClock(iso, timeZone, locale),
                  testID: `slot-${iso}`,
                }))}
              />
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
