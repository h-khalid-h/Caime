import { tr } from '@caime/core/i18n';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { Button } from '@/ui/Button';
import { Text } from '@/ui/Text';
import { toast } from '@/ui/Toast';

/** What Cai's line about something it kept carries (M16 G13): the action it made. */
export interface KeptPayload {
  taskId: string;
}

/**
 * Under Cai's (or a friend's) line saying it kept something as one of the reader's actions
 * (M16 G13): Undo takes it out again, Open goes to Actions. Loaded with the first such line.
 */
export default function KeptAction({ kept }: { kept: KeptPayload }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [undone, setUndone] = useState(false);
  if (undone)
    return (
      <Text
        variant="caption"
        color="textSecondary"
        style={{ marginStart: 12, marginTop: 4 }}
        testID="kept-undone"
      >
        {tr('Taken out of your actions')}
      </Text>
    );
  const undo = async () => {
    setBusy(true);
    try {
      await endpoints.deleteTask(kept.taskId);
      setUndone(true);
      void qc.invalidateQueries({ queryKey: qk.allTasks });
      void qc.invalidateQueries({ queryKey: qk.attentionHome });
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <View
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginStart: 12, marginTop: 6 }}
      testID="kept-action"
    >
      <Button
        label={tr('Open Actions')}
        size="sm"
        variant="secondary"
        onPress={() => router.navigate('/actions')}
        testID="kept-open"
      />
      <Button
        label={tr('Undo')}
        size="sm"
        variant="ghost"
        loading={busy}
        onPress={() => void undo()}
        testID="kept-undo"
      />
    </View>
  );
}
