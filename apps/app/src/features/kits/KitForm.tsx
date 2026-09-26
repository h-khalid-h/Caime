import type { ConversationView } from '@caishy/core/api';
import { formatAmount } from '@caishy/core/format';
import { uuidv4 } from '@caishy/core/ids';
import { extractAmounts } from '@caishy/core/intelligence';
import { CARD_KITS, type CardKitId, prepareKitFields } from '@caishy/core/kit-cards';
import { KITS, type KitDef, type KitField, kitsFor } from '@caishy/core/kits';
import { SPACE_KIND_DEFS } from '@caishy/core/spaces';
import { firstFutureWhen } from '@caishy/core/when';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { useUserClock } from '@/lib/time';
import { applyMessageToInbox, upsertMessage } from '@/state/cache';
import { useMe } from '@/state/session';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { Plus } from '@/ui/icons';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';

export type KitChoice = CardKitId | 'poll';

/**
 * The kits this conversation offers, most specific to the relationship first (core kits.ts). In
 * a space, the space's kind stands in for the relationship: a team space offers work cards.
 */
export function kitsOffered(conversation: ConversationView, viewerIsMinor: boolean): KitDef[] {
  // With an organization, the relationship is a customer's: tickets, appointments, orders (R15).
  const business = conversation.kind === 'business';
  const sphere = business
    ? 'customer'
    : (conversation.other?.relationship?.sphere ??
      (conversation.space ? SPACE_KIND_DEFS[conversation.space.kind].sphere : undefined));
  const offered = new Set<string>([...CARD_KITS, 'poll']);
  return kitsFor({
    spheres: sphere ? [sphere] : [],
    // One customer, one organization: its cards are one-to-one cards.
    isGroup: conversation.kind !== 'direct' && !business,
    viewerIsMinor,
  }).filter((k) => offered.has(k.id));
}

type Clock = { now: Date; timeZone: string; locale: string; workweek: number[] };

/** What a typed value means, for the preview under the field and for sending. */
function readField(
  field: KitField,
  text: string,
  clock: Clock,
): { value?: unknown; shown?: string } {
  const raw = text.trim();
  if (!raw) return {};
  switch (field.type) {
    case 'datetime':
    case 'date': {
      const when = firstFutureWhen(raw, clock);
      if (!when) return { shown: 'Say a day, and a time if there is one: “Friday 3pm”' };
      const at = new Date(when.at);
      const shown = new Intl.DateTimeFormat(clock.locale, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        ...(field.type === 'datetime' && when.time ? { hour: 'numeric', minute: '2-digit' } : {}),
        timeZone: clock.timeZone,
      }).format(at);
      return field.type === 'date'
        ? { value: when.date, shown }
        : { value: { at: when.at, hasTime: Boolean(when.time) }, shown };
    }
    case 'amount': {
      const found = extractAmounts(raw)[0];
      const value = found?.value ?? Number(raw.replace(/[^\d.]/g, ''));
      if (!value || !Number.isFinite(value)) return { shown: 'Write an amount: “EGP 1,200”' };
      const currency = found?.currency ?? null;
      return { value: { value, currency }, shown: formatAmount(value, currency, clock.locale) };
    }
    default:
      return { value: raw };
  }
}

const PLACEHOLDERS: Partial<Record<KitField['type'], string>> = {
  datetime: 'Friday 3pm',
  date: 'October 15',
  amount: 'EGP 1,200',
};

export function KitForm({
  conversation,
  kit,
  onClose,
}: {
  conversation: ConversationView;
  kit: KitChoice | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const me = useMe();
  const { timeZone, locale } = useUserClock();
  const clock: Clock = { now: new Date(), timeZone, locale, workweek: me.workweek };
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [picked, setPicked] = useState<Record<string, number | string>>({});
  const [options, setOptions] = useState<string[]>(['', '']);
  const [multiple, setMultiple] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const close = () => {
    setTexts({});
    setPicked({});
    setOptions(['', '']);
    setMultiple(false);
    setError(null);
    onClose();
  };

  const send = async () => {
    if (!kit) return;
    let body: { kind: 'kit' | 'poll'; payload: unknown };
    if (kit === 'poll') {
      const question = (texts.question ?? '').trim();
      const choices = options.map((o) => o.trim()).filter(Boolean);
      if (!question) return setError('Ask a question.');
      if (choices.length < 2) return setError('Add at least two options.');
      body = {
        kind: 'poll',
        payload: {
          question,
          options: choices.map((text, i) => ({ id: String.fromCharCode(97 + i), text })),
          multiple,
        },
      };
    } else {
      const fields: Record<string, unknown> = {};
      for (const field of KITS[kit].fields) {
        if (field.type === 'options') {
          if (picked[field.key] !== undefined) fields[field.key] = picked[field.key];
          continue;
        }
        const read = readField(field, texts[field.key] ?? '', clock);
        if ((texts[field.key] ?? '').trim() && read.value === undefined)
          return setError(`${field.label}: ${read.shown ?? 'that doesn’t look right.'}`);
        if (read.value !== undefined) fields[field.key] = read.value;
      }
      const checked = prepareKitFields(kit, fields);
      if (!checked.ok) return setError(checked.error);
      body = { kind: 'kit', payload: { kit, fields: checked.fields } };
    }
    setBusy(true);
    setError(null);
    try {
      const { message } = await endpoints.send(conversation.id, { clientId: uuidv4(), ...body });
      upsertMessage(qc, message);
      applyMessageToInbox(qc, message, { mine: true, reading: true });
      close();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const def = kit && kit !== 'poll' ? KITS[kit] : kit === 'poll' ? KITS.poll : null;
  return (
    <Sheet
      open={kit !== null}
      onClose={close}
      title={def?.name}
      subtitle={def?.description}
      footer={
        <Button
          label="Send"
          block
          size="lg"
          onPress={() => void send()}
          loading={busy}
          testID="kit-send"
        />
      }
    >
      {kit === 'poll' ? (
        <View style={{ gap: 12 }}>
          <TextField
            label="Question"
            value={texts.question ?? ''}
            onChangeText={(v) => setTexts((s) => ({ ...s, question: v }))}
            autoFocus
          />
          {options.map((o, i) => (
            <TextField
              // biome-ignore lint/suspicious/noArrayIndexKey: options are positional while typed
              key={i}
              label={`Option ${i + 1}`}
              value={o}
              onChangeText={(v) => setOptions((all) => all.map((x, j) => (j === i ? v : x)))}
            />
          ))}
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {options.length < 12 ? (
              <Chip
                label="Add an option"
                icon={Plus}
                onPress={() => setOptions((all) => [...all, ''])}
              />
            ) : null}
            <Chip
              label="People can pick more than one"
              selected={multiple}
              onPress={() => setMultiple((v) => !v)}
            />
          </View>
        </View>
      ) : def ? (
        <View style={{ gap: 12 }}>
          {def.fields.map((field, i) =>
            field.type === 'options' ? (
              <View key={field.key} style={{ gap: 6 }}>
                <Text variant="label">{field.label}</Text>
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  {(field.choices ?? []).map((c) => (
                    <Chip
                      key={String(c.value)}
                      label={c.label}
                      selected={picked[field.key] === c.value}
                      onPress={() =>
                        setPicked((s) => {
                          const next = { ...s };
                          if (next[field.key] === c.value) delete next[field.key];
                          else next[field.key] = c.value;
                          return next;
                        })
                      }
                    />
                  ))}
                </View>
              </View>
            ) : (
              <TextField
                key={field.key}
                label={field.required ? field.label : `${field.label} (optional)`}
                placeholder={field.placeholder ?? PLACEHOLDERS[field.type]}
                value={texts[field.key] ?? ''}
                onChangeText={(v) => setTexts((s) => ({ ...s, [field.key]: v }))}
                multiline={field.type === 'longtext'}
                autoFocus={i === 0}
                hint={readField(field, texts[field.key] ?? '', clock).shown}
              />
            ),
          )}
        </View>
      ) : null}
      {error ? (
        <Text variant="caption" color="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </Sheet>
  );
}
