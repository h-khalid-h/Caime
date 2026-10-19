/**
 * The fields an organization's team keeps for each customer (M16 H3), for its owner and admins
 * on the setup screen: a file number, an insurance, how they found it. The team fills them in
 * from a customer's conversation; nobody else sees them.
 */
import type { OrgView } from '@caime/core/api';
import {
  CUSTOMER_FIELDS_MAX,
  type CustomerField,
  type CustomerFieldKind,
  FIELD_CHOICES_MAX,
  FIELD_LABEL_CHARS,
} from '@caime/core/customers';
import { listed, msg, tr, trn } from '@caime/core/i18n';
import ListPlus from 'lucide-react-native/icons/list-plus';
import Trash from 'lucide-react-native/icons/trash';
import { useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { ChoiceChips } from '@/ui/Chip';
import { IconButton } from '@/ui/IconButton';
import { ListRow, SectionTitle } from '@/ui/ListRow';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { toast } from '@/ui/Toast';

const KIND_LABELS: Record<CustomerFieldKind, string> = {
  text: msg('Words'),
  number: msg('A number'),
  date: msg('A day'),
  choice: msg('One of a few'),
};

type Draft = { id?: string; label: string; kind: CustomerFieldKind; choices?: string[] };

export function OrgCustomerFields({ org, refresh }: { org: OrgView; refresh: () => void }) {
  const t = useTheme();
  const kept = org.customerFields ?? [];
  const [open, setOpen] = useState(false);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  // The field being written: its place in the drafts, or null for a new one.
  const [at, setAt] = useState<number | null>(null);
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState<CustomerFieldKind>('text');
  const [choices, setChoices] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!org.customerFields) return null;

  const clear = () => {
    setAt(null);
    setLabel('');
    setKind('text');
    setChoices('');
  };
  const begin = () => {
    setDrafts(kept.map((f: CustomerField) => ({ ...f })));
    clear();
    setError(null);
    setOpen(true);
  };
  const pick = (i: number) => {
    const d = drafts[i];
    if (!d) return;
    setAt(i);
    setLabel(d.label);
    setKind(d.kind);
    setChoices((d.choices ?? []).join('\n'));
  };
  /** The drafts with the one being written kept too (null when it can't be yet). */
  const withTyped = (): Draft[] | null => {
    if (!label.trim()) return drafts;
    const list = choices
      .split('\n')
      .map((c) => c.trim())
      .filter(Boolean)
      .slice(0, FIELD_CHOICES_MAX);
    if (kind === 'choice' && list.length === 0) {
      setError(tr('A choice needs its choices.'));
      return null;
    }
    const next: Draft = {
      id: at === null ? undefined : drafts[at]?.id,
      label: label.trim(),
      kind,
      ...(kind === 'choice' ? { choices: list } : {}),
    };
    return at === null ? [...drafts, next] : drafts.map((d, i) => (i === at ? next : d));
  };
  const keep = () => {
    const next = withTyped();
    if (!next) return;
    setDrafts(next);
    setError(null);
    clear();
  };
  const drop = (i: number) => {
    setDrafts(drafts.filter((_, j) => j !== i));
    if (at === i) clear();
    else if (at !== null && at > i) setAt(at - 1);
  };
  const save = async () => {
    const list = withTyped();
    if (!list) return;
    setBusy(true);
    setError(null);
    try {
      const res = await endpoints.saveCustomerFields(org.id, list);
      refresh();
      setOpen(false);
      toast(
        res.fields.length
          ? trn(
              res.fields.length,
              'One field kept for each customer',
              '{n} fields kept for each customer',
            )
          : tr('No customer fields now'),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <SectionTitle>{tr('Customer fields')}</SectionTitle>
      <View
        style={{
          marginHorizontal: 16,
          borderRadius: t.radii.lg,
          borderWidth: 1,
          borderColor: t.c.border,
          backgroundColor: t.c.surface,
          overflow: 'hidden',
        }}
      >
        <ListRow
          icon={ListPlus}
          title={
            kept.length
              ? listed(kept.map((f) => f.label))
              : tr('What your team keeps for each customer')
          }
          subtitle={tr(
            'Filled in from a customer’s conversation, by your team, for your team alone',
          )}
          chevron
          onPress={begin}
          testID="org-customer-fields"
        />
      </View>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={tr('Customer fields')}
        subtitle={tr('A file number, an insurance, how they found you: one row each')}
        footer={
          <Button
            label={tr('Save')}
            block
            size="lg"
            loading={busy}
            onPress={() => void save()}
            testID="customer-fields-save"
          />
        }
      >
        <View style={{ gap: 12 }}>
          {drafts.length ? (
            <View
              style={{
                borderRadius: t.radii.md,
                borderWidth: 1,
                borderColor: t.c.border,
                overflow: 'hidden',
              }}
            >
              {drafts.map((d, i) => (
                <ListRow
                  key={d.id ?? `new-${i}`}
                  title={d.label}
                  subtitle={tr(KIND_LABELS[d.kind])}
                  selected={at === i}
                  onPress={() => pick(i)}
                  right={
                    <IconButton
                      icon={Trash}
                      label={tr('Remove {field}', { field: d.label })}
                      onPress={() => drop(i)}
                      testID={`customer-field-remove-${i}`}
                    />
                  }
                  testID={`customer-field-draft-${i}`}
                />
              ))}
            </View>
          ) : null}
          <TextField
            label={tr('Field')}
            value={label}
            onChangeText={setLabel}
            maxLength={FIELD_LABEL_CHARS}
            placeholder={tr('File number')}
            testID="customer-field-label"
          />
          <ChoiceChips<CustomerFieldKind>
            label={tr('What it holds')}
            value={kind}
            onChange={setKind}
            wrap
            options={(Object.keys(KIND_LABELS) as CustomerFieldKind[]).map((k) => ({
              value: k,
              label: tr(KIND_LABELS[k]),
              testID: `customer-field-kind-${k}`,
            }))}
          />
          {kind === 'choice' ? (
            <TextField
              label={tr('Its choices, one a line')}
              value={choices}
              onChangeText={setChoices}
              multiline
              testID="customer-field-choices-input"
            />
          ) : null}
          <Button
            label={at === null ? tr('Add it') : tr('Done')}
            variant="secondary"
            disabled={!label.trim() || (at === null && drafts.length >= CUSTOMER_FIELDS_MAX)}
            onPress={keep}
            testID="customer-field-keep"
          />
          {error ? (
            <Text variant="caption" color="danger">
              {error}
            </Text>
          ) : null}
        </View>
      </Sheet>
    </>
  );
}
