/**
 * A branch's own days (R92): the weekdays and hours one of an organization's places is booked
 * on, in the organization's zone, on its grid; without any, it opens when the organization does.
 */
import type { BookingHours } from '@caime/core/booking';
import { tr } from '@caime/core/i18n';
import { useState } from 'react';
import { View } from 'react-native';
import { DayPicker } from '@/features/settings/DayPicker';
import { Button } from '@/ui/Button';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { TimeField } from '@/ui/TimeField';

export function BranchHours({
  branch,
  hours,
  weekStart,
  onClose,
  onSave,
  testID,
}: {
  branch: { id: string; name: string };
  hours: BookingHours;
  weekStart: number;
  onClose: () => void;
  /** Its own days, or null for the organization's; throws with a message to show. */
  onSave: (own: BookingHours['days'] | null) => Promise<void>;
  testID: string;
}) {
  const own = hours.placeHours?.find((p) => p.placeId === branch.id)?.days ?? null;
  const from = own ?? hours.days;
  const [days, setDays] = useState<number[]>(from.map((d) => d.weekday));
  const [start, setStart] = useState(from[0]?.start ?? '09:00');
  const [end, setEnd] = useState(from[0]?.end ?? '17:00');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async (next: BookingHours['days'] | null) => {
    setBusy(true);
    setError(null);
    try {
      await onSave(next);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const submit = () => {
    if (!days.length) return setError(tr('Pick at least one day.'));
    if (start >= end) return setError(tr('The day has to end after it starts.'));
    return save([...days].sort((a, b) => a - b).map((weekday) => ({ weekday, start, end })));
  };
  return (
    <Sheet
      open
      onClose={onClose}
      title={tr('Hours at {place}', { place: branch.name })}
      subtitle={tr('In {timeZone}. Its items are booked on these days.', {
        timeZone: hours.timeZone,
      })}
      footer={
        <View style={{ gap: 8 }}>
          <Button
            label={tr('Save')}
            block
            size="lg"
            onPress={() => void submit()}
            loading={busy}
            testID={`${testID}-save`}
          />
          {own ? (
            <Button
              label={tr('Same as the organization’s')}
              variant="ghost"
              block
              disabled={busy}
              onPress={() => void save(null)}
              testID={`${testID}-same`}
            />
          ) : null}
        </View>
      }
    >
      <View style={{ gap: 16 }}>
        <View style={{ gap: 6 }}>
          <Text variant="label">{tr('Days')}</Text>
          <DayPicker
            days={days}
            onChange={setDays}
            label={tr('Days')}
            weekStart={weekStart}
            testID={`${testID}-day`}
          />
        </View>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <TimeField
              label={tr('From')}
              value={start}
              onChange={setStart}
              testID={`${testID}-start`}
            />
          </View>
          <View style={{ flex: 1 }}>
            <TimeField label={tr('To')} value={end} onChange={setEnd} testID={`${testID}-end`} />
          </View>
        </View>
        {error ? (
          <Text variant="caption" color="danger">
            {error}
          </Text>
        ) : null}
      </View>
    </Sheet>
  );
}
