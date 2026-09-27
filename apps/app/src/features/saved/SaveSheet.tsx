/**
 * Saving a message, or one file of it, to a collection of one's own (PRD §69): the one saved to
 * last, another one there is, or a new one. What's saved stays only as long as the message does.
 */
import type { MessageView } from '@caishy/core/api';
import { COLLECTION_MAX, collectionName, SAVED_DEFAULT } from '@caishy/core/automations';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { useSaved } from '@/api/hooks';
import { qk } from '@/api/keys';
import { Choice } from '@/features/settings/SettingsPage';
import { Button } from '@/ui/Button';
import { Sheet } from '@/ui/Sheet';
import { TextField } from '@/ui/TextField';
import { toast } from '@/ui/Toast';

/** The choice that means "a collection not made yet": no name kept starts with a space. */
const NEW = ' new';

export function SaveSheet({
  message,
  assetId,
  onClose,
}: {
  message: MessageView;
  /** One file or link of it, rather than all of it. */
  assetId?: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const saved = useSaved();
  // Newest first, as the server lists them; the default one is always offered.
  const names = [
    ...new Set([...(saved.data?.collections ?? []).map((c) => c.name), SAVED_DEFAULT]),
  ].slice(0, 12);
  const [picked, setPicked] = useState<string | null>(null);
  const [fresh, setFresh] = useState('');
  const [busy, setBusy] = useState(false);
  const choice = picked ?? names[0] ?? SAVED_DEFAULT;
  const target = choice === NEW ? collectionName(fresh) : choice;
  const save = async () => {
    setBusy(true);
    try {
      const res = await endpoints.saveMessage(message.id, {
        collection: target,
        ...(assetId ? { assetId } : {}),
      });
      toast(res.existing ? `Already in ${res.collection}` : `Saved to ${res.collection}`);
      void qc.invalidateQueries({ queryKey: qk.saved });
      onClose();
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet
      open
      onClose={onClose}
      title="Save"
      subtitle="Kept for you, as long as the message is there"
      footer={
        <Button
          label={`Save to ${target}`}
          block
          size="lg"
          loading={busy}
          disabled={choice === NEW && !fresh.trim()}
          onPress={() => void save()}
          testID="save-confirm"
        />
      }
    >
      <View style={{ gap: 12 }} testID="save-sheet">
        <View style={{ marginHorizontal: -20 }}>
          <Choice<string>
            label="Where to keep it"
            value={choice}
            onChange={setPicked}
            options={[
              ...names.map((n) => ({ value: n, label: n })),
              { value: NEW, label: 'A new collection' },
            ]}
          />
        </View>
        {choice === NEW ? (
          <TextField
            label="Its name"
            value={fresh}
            onChangeText={setFresh}
            placeholder="Receipts"
            maxLength={COLLECTION_MAX}
            autoFocus
            onSubmitEditing={() => {
              if (fresh.trim() && !busy) void save();
            }}
            testID="save-new-name"
          />
        ) : null}
      </View>
    </Sheet>
  );
}
