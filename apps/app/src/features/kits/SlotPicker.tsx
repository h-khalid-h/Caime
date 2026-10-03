/**
 * The open slots an organization can be booked in (R51), by day, each a chip: a customer, or
 * the team, picks one for an appointment card. Shown in the viewer's own time, as every time is.
 */
import { formatClock, formatDayHeading } from '@caime/core/format';
import { tr } from '@caime/core/i18n';
import { useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import { Chip } from '@/ui/Chip';
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
  const now = new Date();
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
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                {times.map((iso) => (
                  <Chip
                    key={iso}
                    label={formatClock(iso, timeZone, locale)}
                    selected={value === iso}
                    role="radio"
                    onPress={() => onChange(iso)}
                    testID={`slot-${iso}`}
                  />
                ))}
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
