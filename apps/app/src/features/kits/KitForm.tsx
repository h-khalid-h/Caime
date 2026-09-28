import type { ConversationView, CustomKitOfferView } from '@caishy/core/api';
import { prepareCustomFields } from '@caishy/core/custom-kits';
import { formatAmount } from '@caishy/core/format';
import { uuidv4 } from '@caishy/core/ids';
import { extractAmounts } from '@caishy/core/intelligence';
import { CARD_KITS, type CardKitId, isCardKit, prepareKitFields } from '@caishy/core/kit-cards';
import { KITS, type KitDef, type KitField, kitsFor } from '@caishy/core/kits';
import { SPACE_KIND_DEFS } from '@caishy/core/spaces';
import { zonedParts } from '@caishy/core/time';
import { firstFutureWhen, parseWhen } from '@caishy/core/when';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { CurrencyField } from '@/features/geo/CurrencyField';
import { WhenSheet } from '@/features/when/WhenSheet';
import { type Chosen, instantOf } from '@/features/when/when';
import { useUserClock } from '@/lib/time';
import { applyMessageToInbox, upsertMessage } from '@/state/cache';
import { useLiveShares } from '@/state/liveShares';
import { useMe } from '@/state/session';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { IconButton } from '@/ui/IconButton';
import { Calendar, MapPin, Plus } from '@/ui/icons';
import { Segmented } from '@/ui/Segmented';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { parseNumber } from './amounts';

export type KitChoice = CardKitId | 'poll' | 'location';

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
  const offered = new Set<string>([...CARD_KITS, 'poll', 'location']);
  return kitsFor({
    spheres: sphere ? [sphere] : [],
    // One customer, one organization: its cards are one-to-one cards.
    isGroup: conversation.kind !== 'direct' && !business,
    viewerIsMinor,
  }).filter(
    (k) =>
      offered.has(k.id) &&
      // With someone under 18 in it, no card about money (R29): the server refuses them too.
      !(conversation.hasMinor && k.adultsOnly && isCardKit(k.id)),
  );
}

type Clock = { now: Date; timeZone: string; locale: string; workweek: number[] };

/** A day picked for a field, and how it reads there (typing over it drops the pick). */
type Picked = { chosen: Chosen; shown: string };

/**
 * What a typed value means, for the preview under the field and for sending. Caishy's own cards
 * look ahead (a meeting, a due date); an organization's own may say when something was, too.
 */
function readField(
  field: KitField,
  text: string,
  clock: Clock,
  anyTense = false,
  extra: { currency?: string | null; picked?: Picked } = {},
): { value?: unknown; shown?: string } {
  const raw = text.trim();
  if (!raw) return {};
  switch (field.type) {
    case 'datetime':
    case 'date': {
      const pick = extra.picked && extra.picked.shown === raw ? extra.picked.chosen : null;
      if (pick)
        return field.type === 'date'
          ? { value: pick.date, shown: raw }
          : {
              value: {
                at: instantOf(pick, clock.timeZone).toISOString(),
                hasTime: Boolean(pick.time),
              },
              shown: raw,
            };
      const when = anyTense ? parseWhen(raw, clock)[0] : firstFutureWhen(raw, clock);
      if (!when) return { shown: 'Say a day, and a time if there is one: “Friday 3pm”' };
      const at = new Date(when.at);
      const shown = new Intl.DateTimeFormat(clock.locale, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        // Another year says which, so a date that rolled on to next year shows it did.
        ...(when.date.slice(0, 4) !== String(zonedParts(clock.now, clock.timeZone).year)
          ? { year: 'numeric' as const }
          : {}),
        ...(field.type === 'datetime' && when.time ? { hour: 'numeric', minute: '2-digit' } : {}),
        timeZone: clock.timeZone,
      }).format(at);
      return field.type === 'date'
        ? { value: when.date, shown }
        : { value: { at: when.at, hasTime: Boolean(when.time) }, shown };
    }
    case 'amount': {
      // Typed on the number keypad in the person's own way, in the currency beside it; or
      // written with its currency ("EGP 1,200"), which says which.
      const typed = parseNumber(raw, clock.locale);
      const found = typed === null ? extractAmounts(raw)[0] : undefined;
      const value = typed ?? found?.value;
      if (!value || !Number.isFinite(value)) return { shown: 'Write an amount: “1,200”' };
      const currency = found?.currency ?? extra.currency ?? null;
      return { value: { value, currency }, shown: formatAmount(value, currency, clock.locale) };
    }
    default:
      return { value: raw };
  }
}

const PLACEHOLDERS: Partial<Record<KitField['type'], string>> = {
  datetime: 'Friday 3pm',
  date: 'October 15',
  amount: '1,200',
};

export function KitForm({
  conversation,
  kit,
  custom = null,
  onClose,
}: {
  conversation: ConversationView;
  kit: KitChoice | null;
  /** Or one of the organization's own kinds of card, made by one of its apps (PRD §74). */
  custom?: CustomKitOfferView | null;
  onClose: () => void;
}) {
  const t = useTheme();
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
  // An amount's currency: the organization's for its team, else where the person lives.
  const defaultCurrency =
    (conversation.business?.thread ? conversation.business.org.currency : null) ?? me.currency;
  const [currencies, setCurrencies] = useState<Record<string, string | null>>({});
  const [pickedDays, setPickedDays] = useState<Record<string, Picked>>({});
  const [choosing, setChoosing] = useState<KitField | null>(null);
  const extraFor = (field: KitField) => ({
    currency: currencies[field.key] ?? defaultCurrency,
    picked: pickedDays[field.key],
  });
  // Location: where the device says this person is, once, when they ask.
  const [spot, setSpot] = useState<{ lat: number; lng: number; accuracy?: number } | null>(null);
  const [locating, setLocating] = useState(false);
  // Or live, for a while: it follows them until then, while Caishy is open (R29).
  const [liveFor, setLiveFor] = useState<'0' | '15' | '60' | '480'>('0');

  const close = () => {
    setTexts({});
    setPicked({});
    setOptions(['', '']);
    setMultiple(false);
    setError(null);
    setSpot(null);
    setLiveFor('0');
    onClose();
  };

  const locate = async () => {
    setLocating(true);
    setError(null);
    try {
      const Location = await import('expo-location');
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setError('Caishy can’t see where you are. Allow it in your settings, or type a place.');
        return;
      }
      const { coords } = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const round = (n: number) => Math.round(n * 1e6) / 1e6;
      setSpot({
        lat: round(coords.latitude),
        lng: round(coords.longitude),
        ...(coords.accuracy ? { accuracy: Math.round(coords.accuracy) } : {}),
      });
    } catch {
      setError('Couldn’t find where you are just now. Try again, or type a place.');
    } finally {
      setLocating(false);
    }
  };

  const def: Pick<KitDef, 'name' | 'description' | 'fields'> | null =
    custom ?? (kit ? KITS[kit] : null);
  const send = async () => {
    if (!def) return;
    let body: { kind: 'kit' | 'poll' | 'location'; payload: unknown };
    if (kit === 'location') {
      const label = (texts.label ?? '').trim();
      if (!spot && !label) return setError('Share where you are, or type a place.');
      body = {
        kind: 'location',
        payload: {
          ...(spot ?? {}),
          ...(label ? { label } : {}),
          ...(spot && liveFor !== '0' ? { live: { minutes: Number(liveFor) } } : {}),
        },
      };
    } else if (kit === 'poll') {
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
      for (const field of def.fields) {
        if (field.type === 'items') {
          const lines = options.map((o) => o.trim()).filter(Boolean);
          if (lines.length) fields[field.key] = lines;
          continue;
        }
        if (field.type === 'options') {
          if (picked[field.key] !== undefined) fields[field.key] = picked[field.key];
          continue;
        }
        const read = readField(
          field,
          texts[field.key] ?? '',
          clock,
          Boolean(custom),
          extraFor(field),
        );
        if ((texts[field.key] ?? '').trim() && read.value === undefined)
          return setError(`${field.label}: ${read.shown ?? 'that doesn’t look right.'}`);
        if (read.value !== undefined) fields[field.key] = read.value;
      }
      const checked = custom ? prepareCustomFields(custom, fields) : prepareKitFields(kit, fields);
      if (!checked.ok) return setError(checked.error);
      body = {
        kind: 'kit',
        payload: custom
          ? { kit: 'custom', app: custom.app.id, key: custom.key, fields: checked.fields }
          : { kit, fields: checked.fields },
      };
    }
    setBusy(true);
    setError(null);
    try {
      const { message } = await endpoints.send(conversation.id, { clientId: uuidv4(), ...body });
      upsertMessage(qc, message);
      applyMessageToInbox(qc, message, { mine: true, reading: true });
      const live = (message.payload as { live?: { until: string } }).live;
      if (message.kind === 'location' && live)
        useLiveShares
          .getState()
          .start(message.id, { conversationId: conversation.id, until: live.until });
      close();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={def !== null}
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
      {kit === 'location' ? (
        <View style={{ gap: 12 }}>
          <Text variant="caption" color="textSecondary">
            {liveFor === '0' || !spot
              ? 'Only this moment is shared, never where you go after.'
              : 'Where you are follows here until then, while Caishy is open. Stop it any time; only the latest point is kept.'}
          </Text>
          {spot ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <MapPin size={18} color={t.c.success} />
              <Text variant="body" style={{ flex: 1 }} testID="location-found">
                {spot.accuracy ? `Found you, within ${spot.accuracy} m.` : 'Found you.'}
              </Text>
              <Button label="Clear" size="sm" variant="ghost" onPress={() => setSpot(null)} />
            </View>
          ) : null}
          {spot ? (
            <Segmented
              label="How long to share it"
              value={liveFor}
              onChange={setLiveFor}
              options={[
                { value: '0', label: 'Just now' },
                { value: '15', label: '15 min' },
                { value: '60', label: '1 hour' },
                { value: '480', label: '8 hours' },
              ]}
            />
          ) : (
            <Button
              label="Use where I am now"
              icon={MapPin}
              variant="secondary"
              loading={locating}
              onPress={() => void locate()}
              testID="location-here"
            />
          )}
          <TextField
            label={spot ? 'Name it (optional)' : 'Or type a place'}
            placeholder={spot ? 'Home, the office…' : 'Café Riche, Downtown'}
            value={texts.label ?? ''}
            onChangeText={(v) => setTexts((s) => ({ ...s, label: v }))}
            testID="location-label"
          />
        </View>
      ) : kit === 'poll' ? (
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
            field.type === 'items' ? (
              <View key={field.key} style={{ gap: 8 }}>
                <Text variant="label">{field.label}</Text>
                {options.map((o, j) => (
                  <TextField
                    // biome-ignore lint/suspicious/noArrayIndexKey: items are positional while typed
                    key={j}
                    accessibilityLabel={`Item ${j + 1}`}
                    placeholder={j === 0 ? 'Milk' : j === 1 ? 'Bread' : ''}
                    value={o}
                    onChangeText={(v) => setOptions((all) => all.map((x, k) => (k === j ? v : x)))}
                    testID={`checklist-item-input-${j}`}
                  />
                ))}
                {options.length < 100 ? (
                  <Chip
                    label="Add an item"
                    icon={Plus}
                    onPress={() => setOptions((all) => [...all, ''])}
                  />
                ) : null}
              </View>
            ) : field.type === 'options' ? (
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
                {...(field.type === 'amount'
                  ? { keyboardType: 'decimal-pad' as const, inputMode: 'decimal' as const }
                  : {})}
                trailing={
                  field.type === 'amount' ? (
                    <CurrencyField
                      value={currencies[field.key] ?? defaultCurrency}
                      onChange={(code) => setCurrencies((c) => ({ ...c, [field.key]: code }))}
                      locale={locale}
                      testID={`kit-currency-${field.key}`}
                    />
                  ) : field.type === 'date' || field.type === 'datetime' ? (
                    <IconButton
                      icon={Calendar}
                      label={`Choose ${field.label.toLowerCase()}`}
                      onPress={() => setChoosing(field)}
                      testID={`kit-when-${field.key}`}
                    />
                  ) : undefined
                }
                hint={
                  readField(field, texts[field.key] ?? '', clock, Boolean(custom), extraFor(field))
                    .shown
                }
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
      {choosing ? (
        <WhenSheet
          open
          onClose={() => setChoosing(null)}
          title={choosing.label}
          value={pickedDays[choosing.key]?.chosen ?? null}
          time={choosing.type === 'datetime' ? 'optional' : 'none'}
          future={!custom}
          onChange={(chosen) => {
            const shown = dayText(chosen, clock);
            setPickedDays((d) => ({ ...d, [choosing.key]: { chosen, shown } }));
            setTexts((s) => ({ ...s, [choosing.key]: shown }));
          }}
          testID={`kit-when-${choosing.key}-sheet`}
        />
      ) : null}
    </Sheet>
  );
}

/** How a picked day (and time) reads in the field: "Thu 15 Oct, 15:00". */
function dayText(c: Chosen, clock: Clock): string {
  return new Intl.DateTimeFormat(clock.locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(c.date.slice(0, 4) !== String(zonedParts(clock.now, clock.timeZone).year)
      ? { year: 'numeric' as const }
      : {}),
    ...(c.time ? { hour: 'numeric' as const, minute: '2-digit' as const } : {}),
    timeZone: clock.timeZone,
  }).format(instantOf(c, clock.timeZone));
}
