import { formatDue } from '@caishy/core/format';
import { firstFutureWhen } from '@caishy/core/when';
import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { useUserClock } from '@/lib/time';
import { useMe } from '@/state/session';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { Calendar } from '@/ui/icons';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { toast } from '@/ui/Toast';

/** "Call the bank tomorrow at 10" becomes a task due tomorrow at 10:00, in your time zone. */
export function AddTaskSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const me = useMe();
  const { timeZone, locale } = useUserClock();
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [useDate, setUseDate] = useState(true);
  const when = useMemo(
    () =>
      title.trim()
        ? firstFutureWhen(title, { now: new Date(), timeZone, locale, workweek: me.workweek })
        : undefined,
    [title, timeZone, locale, me.workweek],
  );
  const save = async () => {
    if (!title.trim()) return;
    setBusy(true);
    try {
      const due = when && useDate ? when : undefined;
      await endpoints.createTask({
        title: title.trim(),
        dueAt: due?.at ?? null,
        dueHasTime: Boolean(due?.time),
      });
      setTitle('');
      onClose();
      toast('Added');
      void qc.invalidateQueries({ queryKey: ['tasks'] });
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="New action"
      footer={
        <Button
          label="Add"
          block
          size="lg"
          onPress={save}
          loading={busy}
          disabled={!title.trim()}
        />
      }
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
