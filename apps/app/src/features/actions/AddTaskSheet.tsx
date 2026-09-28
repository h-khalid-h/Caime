import { formatDue } from '@caime/core/format';
import { firstFutureWhen } from '@caime/core/when';
import { onlineManager } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { type Chosen, instantOf } from '@/features/when/when';
import { useUserClock } from '@/lib/time';
import { useMe } from '@/state/session';
import { useTaskOutbox } from '@/state/taskOutbox';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { IconButton } from '@/ui/IconButton';
import { Calendar, X } from '@/ui/icons';
import { lazyPart } from '@/ui/Lazy';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { toast } from '@/ui/Toast';

/** Choosing a day, loaded the first time it's opened. */
const WhenSheet = lazyPart(() => import('@/features/when/WhenSheet').then((m) => m.WhenSheet));

/**
 * "Call the bank tomorrow at 10" becomes a task due tomorrow at 10:00, in your time zone; or its
 * day and time are picked, from the days people most often mean or a calendar.
 */
export function AddTaskSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const me = useMe();
  const { timeZone, locale } = useUserClock();
  const [title, setTitle] = useState('');
  const [useDate, setUseDate] = useState(true);
  // A day picked by hand wins over one written in the title.
  const [picked, setPicked] = useState<Chosen | null>(null);
  const [choosing, setChoosing] = useState(false);
  const when = useMemo(
    () =>
      title.trim()
        ? firstFutureWhen(title, { now: new Date(), timeZone, locale, workweek: me.workweek })
        : undefined,
    [title, timeZone, locale, me.workweek],
  );
  const due = picked
    ? { at: instantOf(picked, timeZone).toISOString(), hasTime: Boolean(picked.time) }
    : when && useDate
      ? { at: when.at, hasTime: Boolean(when.time) }
      : null;
  // On the list at once, online or not; sent when it can be (PRD §49).
  const save = () => {
    if (!title.trim()) return;
    const written = when && useDate ? when : undefined;
    useTaskOutbox.getState().add({
      title: title.trim(),
      dueAt: picked ? instantOf(picked, timeZone).toISOString() : (written?.at ?? null),
      dueHasTime: picked ? Boolean(picked.time) : Boolean(written?.time),
    });
    setTitle('');
    setPicked(null);
    setUseDate(true);
    onClose();
    toast(onlineManager.isOnline() ? 'Added' : 'Added. It’s saved when you’re back online.');
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="New action"
      footer={<Button label="Add" block size="lg" onPress={save} disabled={!title.trim()} />}
    >
      <TextField
        placeholder="What needs doing? Try “renew passport by Friday”"
        value={title}
        onChangeText={setTitle}
        autoFocus
        onSubmitEditing={save}
        returnKeyType="done"
        accessibilityLabel="What needs doing"
      />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {due ? (
          <>
            <Chip
              icon={Calendar}
              label={`Due ${formatDue(due.at, new Date(), timeZone, locale, due.hasTime)}`}
              selected
              onPress={() => setChoosing(true)}
              accessibilityLabel={`Due ${formatDue(due.at, new Date(), timeZone, locale, due.hasTime)}. Change the day`}
              testID="task-due"
            />
            <IconButton
              icon={X}
              label="No due date"
              onPress={() => {
                setPicked(null);
                setUseDate(false);
              }}
              testID="task-due-clear"
            />
            {!picked && when ? (
              <Text variant="caption" color="textTertiary">
                From “{when.text}”
              </Text>
            ) : null}
          </>
        ) : (
          <Chip
            icon={Calendar}
            label="Add a due date"
            onPress={() => setChoosing(true)}
            testID="task-due-add"
          />
        )}
      </View>
      {choosing ? (
        <WhenSheet
          open
          onClose={() => setChoosing(false)}
          title="Due"
          value={picked ?? (when && useDate ? { date: when.date, time: when.time } : null)}
          onChange={(c) => {
            setPicked(c);
            setUseDate(true);
          }}
          testID="task-when"
        />
      ) : null}
    </Sheet>
  );
}
