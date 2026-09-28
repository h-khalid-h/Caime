/**
 * Choosing when (an action's due date, a card's date, the end of a mute): the days people most
 * often mean at a tap, any day from the phone's or browser's own calendar, and a time on it when
 * it needs one. Days and times are the person's, in their time zone.
 */
import { useState } from 'react';
import { View } from 'react-native';
import { useUserClock } from '@/lib/time';
import { useMe } from '@/state/session';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { DateField } from '@/ui/DateField';
import { formatDay } from '@/ui/dates';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { TimeField } from '@/ui/TimeField';
import { type Chosen, instantOf, quickPicks, todayWhere } from './when';

export function WhenSheet({
  open,
  onClose,
  title,
  value,
  onChange,
  time = 'optional',
  future = true,
  testID,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  value: Chosen | null;
  onChange: (value: Chosen) => void;
  /** Whether a time goes with the day: never, if they want one, or always. */
  time?: 'none' | 'optional' | 'required';
  /** Only days from today on (a due date, a mute's end). */
  future?: boolean;
  testID?: string;
}) {
  const me = useMe();
  const { timeZone, locale } = useUserClock();
  const today = todayWhere(timeZone);
  const [date, setDate] = useState<string | null>(value?.date ?? null);
  const [at, setAt] = useState<string | null>(
    time === 'none' ? null : (value?.time ?? (time === 'required' ? '09:00' : null)),
  );
  const [error, setError] = useState<string | null>(null);
  const picks = quickPicks(timeZone, me.workweek);
  const done = () => {
    if (!date) return setError('Choose a day.');
    if (future && date < today) return setError('Choose today or a day after.');
    const chosen = { date, time: time === 'none' ? null : at };
    if (future && chosen.time && instantOf(chosen, timeZone).getTime() < Date.now())
      return setError('That time has passed. Choose a later one.');
    onChange(chosen);
    onClose();
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <Button
          label="Done"
          size="lg"
          block
          onPress={done}
          testID={testID ? `${testID}-done` : undefined}
        />
      }
    >
      <View style={{ gap: 16 }}>
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel="Days"
          style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}
        >
          {picks.map((p) => (
            <Chip
              key={p.label}
              label={p.label}
              role="radio"
              selected={date === p.chosen.date}
              accessibilityLabel={`${p.label}, ${formatDay(p.chosen.date, locale)}`}
              onPress={() => {
                setDate(p.chosen.date);
                setError(null);
              }}
            />
          ))}
        </View>
        <DateField
          label="Day"
          value={date}
          onChange={(d) => {
            setDate(d);
            setError(null);
          }}
          min={future ? today : undefined}
          error={error}
          testID={testID ? `${testID}-day` : undefined}
        />
        {time === 'none' ? null : at === null ? (
          <Button
            label="Add a time"
            variant="secondary"
            onPress={() => setAt('09:00')}
            testID={testID ? `${testID}-add-time` : undefined}
          />
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
            <TimeField
              label="Time"
              value={at}
              onChange={(v) => {
                setAt(v);
                setError(null);
              }}
              testID={testID ? `${testID}-time` : undefined}
            />
            {time === 'optional' ? (
              <Button label="No time" variant="ghost" onPress={() => setAt(null)} />
            ) : null}
          </View>
        )}
        {date ? (
          <Text variant="caption" color="textSecondary">
            {formatDay(date, locale)}
          </Text>
        ) : null}
      </View>
    </Sheet>
  );
}
