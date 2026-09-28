import type { PersonView } from '@caime/core/api';
import { relationshipLabel, SPHERE_DEFS } from '@caime/core/taxonomy';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Switch, View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import {
  type FormState,
  initialForm,
  RelationshipForm,
  toDraft,
} from '@/features/relationships/RelationshipPicker';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { RelationshipChip } from '@/ui/Chip';
import { Lock } from '@/ui/icons';
import { ListRow } from '@/ui/ListRow';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { toast } from '@/ui/Toast';

/**
 * Send a connection request, in one sheet. Two separate things, kept separate on purpose: how
 * *I* see them (private, applied when they accept) and the context *they* see (optional).
 */
export function ConnectSheet({
  open,
  onClose,
  person,
  onSent,
}: {
  open: boolean;
  onClose: () => void;
  person: Pick<PersonView, 'id' | 'displayName'>;
  onSent?: () => void;
}) {
  const t = useTheme();
  const [step, setStep] = useState<'details' | 'classify'>('details');
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(() => initialForm());
  const [note, setNote] = useState('');
  const [shareContext, setShareContext] = useState(true);
  const [busy, setBusy] = useState(false);
  const name = person.displayName.split(' ')[0] ?? person.displayName;
  useEffect(() => {
    if (open) {
      setStep('details');
      setForm(initialForm());
      setNote('');
    }
  }, [open]);
  const draft = toDraft(form);

  const send = async () => {
    setBusy(true);
    try {
      const res = await endpoints.requestConnection({
        toUserId: person.id,
        note: note.trim() || null,
        relationship: draft ?? undefined,
        context:
          draft && shareContext ? { sphere: draft.sphere, orgName: draft.orgName } : undefined,
      });
      onClose();
      onSent?.();
      // Where they know them from is offered the next time they're asked.
      if (draft?.orgName) void qc.invalidateQueries({ queryKey: qk.taxonomy });
      if (res.status === 'connected' && res.conversationId) {
        toast(`You’re connected with ${name}`);
        router.navigate({ pathname: '/c/[id]', params: { id: res.conversationId } });
      } else toast(`Request sent to ${name}`);
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  if (step === 'classify')
    return (
      <Sheet
        open={open}
        onClose={onClose}
        title={`How do you know ${name}?`}
        footer={
          <Button
            label="Done"
            size="lg"
            block
            disabled={!form.sphere}
            onPress={() => setStep('details')}
            testID="relationship-save"
          />
        }
      >
        <RelationshipForm name={name} value={form} onChange={setForm} />
      </Sheet>
    );

  const label = draft ? relationshipLabel(draft) : null;
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`Connect with ${name}`}
      footer={
        <Button
          label="Send request"
          size="lg"
          block
          loading={busy}
          onPress={send}
          testID="connect-send"
        />
      }
    >
      <View style={{ marginHorizontal: -20 }}>
        <ListRow
          title={label ? 'How you know them' : `How do you know ${name}?`}
          subtitle={label ? undefined : `Optional. ${name} never sees your label.`}
          right={
            label && draft ? (
              <RelationshipChip label={label} sphere={draft.sphere} size="md" />
            ) : null
          }
          chevron
          onPress={() => setStep('classify')}
          testID="connect-classify"
        />
      </View>
      {draft ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong">Show {name} the context</Text>
            <Text variant="caption" color="textSecondary">
              They’ll see “{SPHERE_DEFS[draft.sphere].label}
              {draft.orgName ? ` · ${draft.orgName}` : ''}”, not your label, so they know who’s
              asking.
            </Text>
          </View>
          <Switch
            value={shareContext}
            onValueChange={setShareContext}
            trackColor={{ true: t.c.primary, false: t.c.borderStrong }}
            accessibilityLabel="Show the context"
          />
        </View>
      ) : null}
      <TextField
        label="Add a note (optional)"
        placeholder={`Hi ${name}, it’s…`}
        value={note}
        onChangeText={setNote}
        maxLength={280}
        multiline
      />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Lock size={12} color={t.c.textTertiary} />
        <Text variant="caption" color="textTertiary" style={{ flex: 1 }}>
          {name} can accept, decline or ignore. Declining is silent.
        </Text>
      </View>
    </Sheet>
  );
}
