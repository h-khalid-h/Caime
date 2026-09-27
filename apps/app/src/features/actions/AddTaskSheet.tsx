import { formatDue } from '@caishy/core/format';
import { firstFutureWhen } from '@caishy/core/when';
import { onlineManager } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useUserClock } from '@/lib/time';
import { useMe } from '@/state/session';
import { useTaskOutbox } from '@/state/taskOutbox';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { Calendar } from '@/ui/icons';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { toast } from '@/ui/Toast';

/** "Call the bank tomorrow at 10" becomes a task due tomorrow at 10:00, in your time zone. */
export function AddTaskSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const me = useMe();
  const { timeZone, locale } = useUserClock();
  const [title, setTitle] = useState('');
  const [useDate, setUseDate] = useState(true);
  const when = useMemo(
    () =>
      title.trim()
        ? firstFutureWhen(title, { now: new Date(), timeZone, locale, workweek: me.workweek })
        : undefined,
    [title, timeZone, locale, me.workweek],
  );
  // On the list at once, online or not; sent when it can be (PRD §49).
  const save = () => {
    if (!title.trim()) return;
    const due = when && useDate ? when : undefined;
    useTaskOutbox.getState().add({
      title: title.trim(),
      dueAt: due?.at ?? null,
      dueHasTime: Boolean(due?.time),
    });
    setTitle('');
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
      {when ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Chip
            icon={Calendar}
            label={`Due ${formatDue(when.at, new Date(), timeZone, locale)}`}
            selected={useDate}
            onPress={() => setUseDate((u) => !u)}
          />
          <Text variant="caption" color="textTertiary">
            {useDate ? `From “${when.text}”` : 'No due date'}
          </Text>
        </View>
      ) : null}
    </Sheet>
  );
}
