import type { PersonView } from '@caime/core/api';
import { tr } from '@caime/core/i18n';
import { relationshipLabel, SPHERE_DEFS } from '@caime/core/taxonomy';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import Lock from 'lucide-react-native/icons/lock';
import { useEffect, useState } from 'react';
import { Switch, View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { type FormState, initialForm, toDraft } from '@/features/relationships/form';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { RelationshipChip } from '@/ui/Chip';
import { lazyPart } from '@/ui/Lazy';
import { ListRow } from '@/ui/ListRow';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { toast } from '@/ui/Toast';

// The form itself loads with the sheet's first paint; the picker's module stays out of the
// startup chunk, which every lazy sheet sharing it statically would put it in.
const RelationshipForm = lazyPart(() =>
  import('@/features/relationships/RelationshipPicker').then((m) => m.RelationshipForm),
);

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
        toast(tr('You’re connected with {name}', { name }));
        router.navigate({ pathname: '/c/[id]', params: { id: res.conversationId } });
      } else toast(tr('Request sent to {name}', { name }));
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
        title={tr('How do you know {name}?', { name })}
        footer={
          <Button
            label={tr('Done')}
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
      title={tr('Connect with {name}', { name })}
      footer={
        <Button
          label={tr('Send request')}
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
          title={label ? tr('How you know them') : tr('How do you know {name}?', { name })}
          subtitle={label ? undefined : tr('Optional. {name} never sees your label.', { name })}
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
            <Text variant="bodyStrong">{tr('Show {name} the context', { name })}</Text>
            <Text variant="caption" color="textSecondary">
              They’ll see “{tr(SPHERE_DEFS[draft.sphere].label)}
              {draft.orgName ? ` · ${draft.orgName}` : ''}”, not your label, so they know who’s
              asking.
            </Text>
          </View>
          <Switch
            value={shareContext}
            onValueChange={setShareContext}
            trackColor={{ true: t.c.primary, false: t.c.borderStrong }}
            accessibilityLabel={tr('Show the context')}
          />
        </View>
      ) : null}
      <TextField
        label={tr('Add a note (optional)')}
        placeholder={tr('Hi {name}, it’s…', { name })}
        value={note}
        onChangeText={setNote}
        maxLength={280}
        multiline
      />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Lock size={12} color={t.c.textTertiary} />
        <Text variant="caption" color="textTertiary" style={{ flex: 1 }}>
          {tr('{name} can accept, decline or ignore. Declining is silent.', { name })}
        </Text>
      </View>
    </Sheet>
  );
}
