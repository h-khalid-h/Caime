/**
 * Saving a message, or one file of it, to a collection of one's own (PRD §69): the one saved to
 * last, another one there is (found by name once there are many), or a new one. What's saved
 * stays only as long as the message does.
 */
import { SAVED_DEFAULT } from '@caishy/core/automations';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { endpoints } from '@/api/endpoints';
import { useSaved } from '@/api/hooks';
import { qk } from '@/api/keys';
import { Button } from '@/ui/Button';
import { lazyPart } from '@/ui/Lazy';
import { Sheet } from '@/ui/Sheet';
import { toast } from '@/ui/Toast';

/** Choosing where it's kept, loaded as the sheet opens (the two sheets that use it share it). */
const CollectionPicker = lazyPart(() =>
  import('@/features/saved/CollectionPicker').then((m) => m.CollectionPicker),
);

export function SaveSheet({
  messageId,
  assetId,
  onClose,
}: {
  messageId: string;
  /** One file or link of it, rather than all of it. */
  assetId?: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const saved = useSaved();
  // Newest first, as the server lists them; the default one is always offered.
  const listed = saved.data?.collections ?? [];
  const collections = listed.some((c) => c.name === SAVED_DEFAULT)
    ? listed
    : [...listed, { name: SAVED_DEFAULT, count: 0 }];
  // The one saved to last, until another is chosen.
  const [picked, setPicked] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const target = picked === undefined ? (collections[0]?.name ?? SAVED_DEFAULT) : picked;
  const save = async () => {
    if (!target) return;
    setBusy(true);
    try {
      const res = await endpoints.saveMessage(messageId, {
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
          label={target ? `Save to ${target}` : 'Save'}
          block
          size="lg"
          loading={busy}
          disabled={!target}
          onPress={() => void save()}
          testID="save-confirm"
        />
      }
    >
      <CollectionPicker
        label="Where to keep it"
        value={target}
        onChange={setPicked}
        collections={collections}
        placeholder="Receipts"
        testID="save-sheet"
      />
    </Sheet>
  );
}
