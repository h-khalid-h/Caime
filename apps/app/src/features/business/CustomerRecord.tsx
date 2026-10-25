/**
 * What the team keeps about a customer (M16 H3), in their conversation's details: tags, the
 * organization's fields and a note, for the team alone; the customer never sees it. Loaded
 * only for the team, when the details open.
 */
import type { CustomerField } from '@caime/core/customers';
import { CUSTOMER_NOTE_CHARS, CUSTOMER_TAGS_MAX, sameTag, TAG_CHARS } from '@caime/core/customers';
import { finds } from '@caime/core/fold';
import { formatWhen } from '@caime/core/format';
import { tr } from '@caime/core/i18n';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Plus from 'lucide-react-native/icons/plus';
import X from 'lucide-react-native/icons/x';
import { useRef, useState } from 'react';
import { type TextInput, View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { useEmptied } from '@/lib/emptied';
import { useNow, useUserClock } from '@/lib/time';
import { putAnswer } from '@/state/cache';
import { useMe } from '@/state/session';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { Chip, ChoiceChips } from '@/ui/Chip';
import { DateField } from '@/ui/DateField';
import { ListRow, SectionTitle } from '@/ui/ListRow';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { toast } from '@/ui/Toast';

type Change = { note?: string | null; tags?: string[]; fields?: Record<string, string> };

export function CustomerRecord({
  orgId,
  customerId,
  name,
}: {
  orgId: string;
  customerId: string;
  name: string;
}) {
  const t = useTheme();
  const qc = useQueryClient();
  const me = useMe();
  const now = useNow();
  const { timeZone, locale } = useUserClock();
  const key = qk.customerRecord(orgId, customerId);
  const q = useQuery({ queryKey: key, queryFn: () => endpoints.customerRecord(orgId, customerId) });
  const [adding, setAdding] = useState(false);
  const [tag, setTag] = useState('');
  const tagBox = useRef<TextInput>(null);
  const { empty: emptyTag, echoes: echoesTag } = useEmptied(tagBox);
  // The tags the team uses, offered while one is being added.
  const inUse = useQuery({
    queryKey: qk.customerTags(orgId),
    queryFn: () => endpoints.customerTags(orgId),
    enabled: adding,
  }).data?.tags;
  // The note as it's being written; null while it's as kept.
  const [note, setNote] = useState<string | null>(null);
  const [field, setField] = useState<CustomerField | null>(null);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const record = q.data?.record;
  const fields = q.data?.fields ?? [];
  if (!record) return null;

  const save = async (change: Change): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      putAnswer(qc, key, await endpoints.saveCustomerRecord(orgId, customerId, change));
      return true;
    } catch (e) {
      setError((e as Error).message);
      toast((e as Error).message, { tone: 'danger' });
      return false;
    } finally {
      setBusy(false);
    }
  };
  const addTag = async (raw: string) => {
    const next = raw.trim();
    if (!next || record.tags.some((x) => sameTag(x, next))) {
      emptyTag(setTag);
      return;
    }
    if (await save({ tags: [...record.tags, next] })) emptyTag(setTag);
  };
  const openField = (f: CustomerField) => {
    setValue(record.fields[f.id] ?? '');
    setError(null);
    setField(f);
  };
  const saveField = async (f: CustomerField, v: string) => {
    if (await save({ fields: { [f.id]: v } })) setField(null);
  };
  const offered = (inUse ?? [])
    .map((x) => x.tag)
    .filter((x) => !record.tags.some((mine) => sameTag(mine, x)))
    .filter((x) => !tag.trim() || finds(tag, x))
    .slice(0, 8);
  const shownNote = note ?? record.note ?? '';

  return (
    <View testID="customer-record">
      <SectionTitle>{tr('What your team keeps about {name}', { name })}</SectionTitle>
      <Text
        variant="caption"
        color="textTertiary"
        style={{ paddingHorizontal: 16, paddingBottom: 8 }}
      >
        {tr('Your team’s alone: {name} never sees it.', { name })}
      </Text>
      {/* Tags: each one a button that takes it off, then one to add. */}
      <View
        style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 16 }}
        testID="customer-tags"
      >
        {record.tags.map((x) => (
          <Chip
            key={x}
            label={x}
            icon={X}
            size="sm"
            tone="accent"
            onPress={() => void save({ tags: record.tags.filter((y) => y !== x) })}
            accessibilityLabel={tr('Take off the tag {tag}', { tag: x })}
            testID={`customer-tag-${x}`}
          />
        ))}
        {record.tags.length < CUSTOMER_TAGS_MAX ? (
          <Chip
            label={tr('Add a tag')}
            icon={Plus}
            size="sm"
            onPress={() => setAdding(!adding)}
            testID="customer-tag-add"
          />
        ) : null}
      </View>
      {adding ? (
        <View style={{ paddingHorizontal: 16, paddingTop: 8, gap: 6 }}>
          <TextField
            value={tag}
            ref={tagBox}
            onChangeText={(v) => {
              if (!echoesTag(tag, v)) setTag(v);
            }}
            placeholder={tr('VIP, new patient, wholesale…')}
            maxLength={TAG_CHARS}
            accessibilityLabel={tr('A tag')}
            returnKeyType="done"
            onSubmitEditing={() => void addTag(tag)}
            testID="customer-tag-input"
          />
          {offered.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {offered.map((x) => (
                <Chip
                  key={x}
                  label={x}
                  size="sm"
                  onPress={() => void addTag(x)}
                  accessibilityLabel={tr('Tag {name} as {tag}', { name, tag: x })}
                  testID={`customer-tag-offer-${x}`}
                />
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
      {/* The organization's fields, each opened to be filled in. */}
      {fields.length ? (
        <View
          style={{
            marginHorizontal: 16,
            marginTop: 12,
            borderRadius: t.radii.lg,
            borderWidth: 1,
            borderColor: t.c.border,
            backgroundColor: t.c.surface,
            overflow: 'hidden',
          }}
        >
          {fields.map((f) => (
            <ListRow
              key={f.id}
              title={f.label}
              subtitle={record.fields[f.id] ?? tr('Not filled in')}
              chevron
              onPress={() => openField(f)}
              testID={`customer-field-${f.id}`}
            />
          ))}
        </View>
      ) : null}
      <View style={{ paddingHorizontal: 16, paddingTop: 12, gap: 8 }}>
        <TextField
          label={tr('Note')}
          value={shownNote}
          onChangeText={setNote}
          multiline
          maxLength={CUSTOMER_NOTE_CHARS}
          placeholder={tr('What the team should know: preferences, history, what was promised.')}
          testID="customer-note"
        />
        {note !== null && note !== (record.note ?? '') ? (
          <Button
            label={tr('Save the note')}
            size="sm"
            loading={busy}
            onPress={() =>
              void save({ note: note.trim() || null }).then((ok) => ok && setNote(null))
            }
            testID="customer-note-save"
          />
        ) : null}
        {record.updatedAt && record.updatedBy ? (
          <Text variant="caption" color="textTertiary">
            {tr('Changed {when}: {name}', {
              when: formatWhen(record.updatedAt, now, timeZone, locale),
              name: record.updatedBy.userId === me.id ? tr('You') : record.updatedBy.displayName,
            })}
          </Text>
        ) : null}
      </View>

      <Sheet
        open={field !== null}
        onClose={() => setField(null)}
        title={field?.label ?? ''}
        subtitle={tr('Kept for {name}, by your team', { name })}
        footer={
          <View style={{ gap: 8 }}>
            <Button
              label={tr('Save')}
              block
              size="lg"
              loading={busy}
              onPress={() => field && void saveField(field, value)}
              testID="customer-field-save"
            />
            {field && record.fields[field.id] ? (
              <Button
                label={tr('Clear it')}
                variant="ghost"
                block
                disabled={busy}
                onPress={() => void saveField(field, '')}
                testID="customer-field-clear"
              />
            ) : null}
          </View>
        }
      >
        {field?.kind === 'choice' ? (
          <ChoiceChips
            label={field.label}
            value={value || null}
            onChange={setValue}
            wrap
            options={(field.choices ?? []).map((c) => ({ value: c, label: c }))}
            testID="customer-field-choices"
          />
        ) : field?.kind === 'date' ? (
          <DateField
            label={field.label}
            value={value || null}
            onChange={(d) => setValue(d ?? '')}
            error={error}
            testID="customer-field-date"
          />
        ) : field ? (
          <TextField
            label={field.label}
            value={value}
            onChangeText={setValue}
            keyboardType={field.kind === 'number' ? 'decimal-pad' : 'default'}
            error={error}
            autoFocus
            testID="customer-field-value"
          />
        ) : null}
      </Sheet>
    </View>
  );
}
