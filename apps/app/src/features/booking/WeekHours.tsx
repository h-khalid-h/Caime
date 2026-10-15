/**
 * A week's open hours (R51, R92): which days, and each day's range, the same every day or its
 * own (a clinic open late on Thursdays, a branch closing early on Saturdays). The host's hours
 * and a branch's both use it.
 */
import type { BookingDay } from '@caime/core/booking';
import { tr } from '@caime/core/i18n';
import { weekOrder } from '@caime/core/time';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { DayPicker, dayNames } from '@/features/settings/DayPicker';
import { useUserClock } from '@/lib/time';
import { SwitchRow } from '@/ui/SwitchRow';
import { Text } from '@/ui/Text';
import { TimeField } from '@/ui/TimeField';

const DEFAULT = { start: '09:00', end: '17:00' };

/** What's wrong with a week's hours, said for the person, or null. */
export function weekHoursError(days: BookingDay[]): string | null {
  if (!days.length) return tr('Pick at least one day.');
  if (days.some((d) => d.start >= d.end)) return tr('The day has to end after it starts.');
  return null;
}

/** Every day's range the same. */
const allSame = (days: BookingDay[]) =>
  days.every((d) => d.start === days[0]?.start && d.end === days[0]?.end);

export function WeekHours({
  days,
  onChange,
  weekStart,
  testID,
}: {
  days: BookingDay[];
  onChange: (days: BookingDay[]) => void;
  weekStart: number;
  testID: string;
}) {
  const { locale } = useUserClock();
  const names = useMemo(() => dayNames(locale).long, [locale]);
  const [same, setSame] = useState(() => allSame(days));
  const first = days[0] ?? { weekday: 0, ...DEFAULT };
  const sorted = (next: BookingDay[]) => [...next].sort((a, b) => a.weekday - b.weekday);
  const pickDays = (weekdays: number[]) =>
    onChange(
      sorted(
        weekdays.map(
          (weekday) =>
            days.find((d) => d.weekday === weekday) ?? {
              weekday,
              start: first.start,
              end: first.end,
            },
        ),
      ),
    );
  const setRange = (weekday: number | 'all', part: 'start' | 'end', value: string) =>
    onChange(
      days.map((d) => (weekday === 'all' || d.weekday === weekday ? { ...d, [part]: value } : d)),
    );
  return (
    <View style={{ gap: 12 }}>
      <View style={{ gap: 6 }}>
        <Text variant="label">{tr('Days')}</Text>
        <DayPicker
          days={days.map((d) => d.weekday)}
          onChange={pickDays}
          label={tr('Days')}
          weekStart={weekStart}
          testID={`${testID}-day`}
        />
      </View>
      <SwitchRow
        label={tr('Same hours every day')}
        value={same}
        onChange={(v) => {
          setSame(v);
          // One range again: the first day's, for every day.
          if (v) onChange(days.map((d) => ({ ...d, start: first.start, end: first.end })));
        }}
        testID={`${testID}-one-range`}
      />
      {same ? (
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <TimeField
              label={tr('From')}
              value={first.start}
              onChange={(v) => setRange('all', 'start', v)}
              testID={`${testID}-start`}
            />
          </View>
          <View style={{ flex: 1 }}>
            <TimeField
              label={tr('To')}
              value={first.end}
              onChange={(v) => setRange('all', 'end', v)}
              testID={`${testID}-end`}
            />
          </View>
        </View>
      ) : (
        weekOrder(weekStart)
          .map((weekday) => days.find((d) => d.weekday === weekday))
          .filter((d): d is BookingDay => Boolean(d))
          .map((d) => (
            <View key={d.weekday} style={{ gap: 6 }}>
              <Text variant="bodyStrong">{names[d.weekday]}</Text>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <TimeField
                    label={tr('From')}
                    value={d.start}
                    onChange={(v) => setRange(d.weekday, 'start', v)}
                    testID={`${testID}-start-${d.weekday}`}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <TimeField
                    label={tr('To')}
                    value={d.end}
                    onChange={(v) => setRange(d.weekday, 'end', v)}
                    testID={`${testID}-end-${d.weekday}`}
                  />
                </View>
              </View>
            </View>
          ))
      )}
    </View>
  );
}
