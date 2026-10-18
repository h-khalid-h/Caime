/**
 * The open slots an organization can be booked in (R51), by day, each a chip: a customer, or
 * the team, picks one for an appointment card. Shown in the viewer's own time, as every time is;
 * each day's times are one group of choice chips (R77), the one chosen `slot-<iso>`.
 */
import { formatClock, formatDayHeading } from '@caime/core/format';
import { tr } from '@caime/core/i18n';
import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useTheme } from '@/theme/theme';
import { ChoiceChips } from '@/ui/Chip';
import { Text } from '@/ui/Text';

/** As tall as the days of slots get before they scroll. */
const SLOTS_MAX_H = 260;
/** A slot's chip, as `ChoiceChips` draws it. */
const CHIP_H = 34;
const HELD_DAYS = [0, 1];
const HELD_CHIPS = [0, 1, 2, 3, 4, 5];

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
      <ScrollView style={{ maxHeight: SLOTS_MAX_H }} nestedScrollEnabled>
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

/**
 * The picker's room while a host's slots are asked for (M16 E5): a free field swapped for the
 * picker once they came moved everything under it, so a tap on what came next (a card's
 * "Repeats") landed on nothing.
 */
export function SlotPickerHolder({ label }: { label: string }) {
  const t = useTheme();
  return (
    <View style={{ gap: 10 }} testID="slot-picker-holder">
      <Text variant="label">{label}</Text>
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={tr('Loading')}
        style={{ height: SLOTS_MAX_H, gap: 10, overflow: 'hidden' }}
      >
        {HELD_DAYS.map((day) => (
          <View key={day} style={{ gap: 6 }}>
            <View
              style={{ width: 96, height: 12, borderRadius: 6, backgroundColor: t.c.surfaceMuted }}
            />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {HELD_CHIPS.map((i) => (
                <View
                  key={i}
                  style={{
                    width: 76,
                    height: CHIP_H,
                    borderRadius: CHIP_H / 2,
                    backgroundColor: t.c.surfaceMuted,
                  }}
                />
              ))}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}
