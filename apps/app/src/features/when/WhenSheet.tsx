/**
 * Choosing when (an action's due date, a card's date, the end of a mute): the days people most
 * often mean at a tap, any day from the phone's or browser's own calendar, and a time on it when
 * it needs one. Days and times are the person's, in their time zone.
 */

import { zonedParts } from '@caishy/core/time';
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

/** The next whole hour where the person is ("15:00" at 14:20), for a time that must be later. */
function nextHour(timeZone: string, now = new Date()): string {
  const hour = (zonedParts(now, timeZone).hour + 1) % 24;
  return `${String(hour).padStart(2, '0')}:00`;
}

interface WhenProps {
  value: Chosen | null;
  onChange: (value: Chosen) => void;
  /** Whether a time goes with the day: never, if they want one, or always. */
  time?: 'none' | 'optional' | 'required';
  /** Only days from today on (a due date, a mute's end). */
  future?: boolean;
  testID?: string;
}

/** The choice itself, and its Done: shared by the sheet and the picker shown inside another. */
function useWhen({ value, onChange, time = 'optional', future = true, testID }: WhenProps) {
  const me = useMe();
  const { timeZone, locale } = useUserClock();
  const today = todayWhere(timeZone);
  const [date, setDate] = useState<string | null>(value?.date ?? null);
  // A time it must have starts at the next whole hour where they are, one that's still to come
  // today; one they add starts at nine.
  const [at, setAt] = useState<string | null>(
    time === 'none' ? null : (value?.time ?? (time === 'required' ? nextHour(timeZone) : null)),
  );
  // What's wrong, under the part that's wrong: the day, or its time.
  const [error, setError] = useState<{ on: 'day' | 'time'; text: string } | null>(null);
  const picks = quickPicks(timeZone, me.workweek);
  /** Why the day (and time) can't be chosen, if it can't. */
  const problem = (chosen: Chosen | null): { on: 'day' | 'time'; text: string } | null => {
    if (!chosen) return { on: 'day', text: 'Choose a day.' };
    if (future && chosen.date < today) return { on: 'day', text: 'Choose today or a day after.' };
    if (future && chosen.time && instantOf(chosen, timeZone).getTime() < Date.now())
      return { on: 'time', text: 'That time has passed. Choose a later one.' };
    return null;
  };
  /** Whether it was a day (and time) that can be chosen, and so was. */
  const done = (): boolean => {
    const chosen = date ? { date, time: time === 'none' ? null : at } : null;
    const wrong = problem(chosen);
    setError(wrong);
    if (wrong || !chosen) return false;
    onChange(chosen);
    return true;
  };
  const body = (
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
        error={error?.on === 'day' ? error.text : null}
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
            error={error?.on === 'time' ? error.text : null}
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
  );
  return { body, done };
}

export function WhenSheet({
  open,
  onClose,
  title,
  onClear,
  clearLabel = 'No date',
  ...props
}: WhenProps & {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Takes the day away, offered when there's one (an action's due date). */
  onClear?: () => void;
  clearLabel?: string;
}) {
  const { body, done } = useWhen(props);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <View style={{ gap: 8 }}>
          <Button
            label="Done"
            size="lg"
            block
            onPress={() => {
              if (done()) onClose();
            }}
            testID={props.testID ? `${props.testID}-done` : undefined}
          />
          {onClear && props.value ? (
            <Button
              label={clearLabel}
              variant="ghost"
              block
              onPress={() => {
                onClear();
                onClose();
              }}
              testID={props.testID ? `${props.testID}-clear` : undefined}
            />
          ) : null}
        </View>
      }
    >
      {body}
    </Sheet>
  );
}

/**
 * The same choice inside a sheet that's already open (a mute's end, in the conversation's
 * actions): iOS shows one sheet at a time from a screen, so one never replaces another.
 */
export function WhenPicker({ onCancel, ...props }: WhenProps & { onCancel: () => void }) {
  const { body, done } = useWhen(props);
  return (
    <View style={{ gap: 16 }}>
      {body}
      <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'flex-end' }}>
        <Button label="Back" variant="ghost" onPress={onCancel} />
        <Button
          label="Done"
          onPress={() => void done()}
          testID={props.testID ? `${props.testID}-done` : undefined}
        />
      </View>
    </View>
  );
}
