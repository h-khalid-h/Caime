import type { ConversationView, CustomKitOfferView } from '@caime/core/api';
import { type BookingItem, grouped, isBooked, isOrdered, itemPhotoPath } from '@caime/core/booking';
import { prepareCustomFields } from '@caime/core/custom-kits';
import { formatAmount, roundAmount } from '@caime/core/format';
import { msg, tr } from '@caime/core/i18n';
import { uuidv4 } from '@caime/core/ids';
import { CARD_KITS, type CardKitId, isCardKit, prepareKitFields } from '@caime/core/kit-cards';
import { KITS, type KitDef, type KitField, kitsFor } from '@caime/core/kits';
import { SPACE_KIND_DEFS } from '@caime/core/spaces';
import { zonedParts } from '@caime/core/time';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Calendar from 'lucide-react-native/icons/calendar';
import MapPin from 'lucide-react-native/icons/map-pin';
import Minus from 'lucide-react-native/icons/minus';
import Plus from 'lucide-react-native/icons/plus';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { useMyBooking, useSlots } from '@/api/hooks';
import { qk } from '@/api/keys';
import { ItemPhoto } from '@/features/booking/ItemPhoto';
import { CurrencyField } from '@/features/geo/CurrencyField';
import { type Chosen, instantOf } from '@/features/when/when';
import { useUserClock } from '@/lib/time';
import { loadReaders, type Readers, useReaders } from '@/lib/useReaders';
import { applyMessageToInbox, upsertMessage } from '@/state/cache';
import { useLiveShares } from '@/state/liveShares';
import { useMe } from '@/state/session';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { IconButton } from '@/ui/IconButton';
import { lazyPart } from '@/ui/Lazy';
import { Segmented } from '@/ui/Segmented';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { exampleAmount, parseNumber } from './amounts';
import { SlotPicker } from './SlotPicker';

/** Choosing a day, loaded the first time it's opened. */
const WhenSheet = lazyPart(() => import('@/features/when/WhenSheet').then((m) => m.WhenSheet));

export type KitChoice = CardKitId | 'poll' | 'location';

/**
 * What a card's form opens with when something sent the person to it (R61): the item an
 * address or a sheet chose. Nothing is sent until they send it.
 */
export interface KitStart {
  itemId?: string;
  /** A Pay card (R62): which way, how much, what for. */
  direction?: 'ask' | 'send';
  amount?: { value: number; currency: string | null };
  note?: string;
  /** The card it answers (Pay on an order): sent as a reply to it. */
  replyToId?: string;
}

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
 * What a typed value means, for the preview under the field and for sending. Caime's own cards
 * look ahead (a meeting, a due date); an organization's own may say when something was, too.
 */
function readField(
  readers: Readers | null,
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
      // Read once the readers are here (they load as the form opens).
      if (!readers) return {};
      const when = anyTense
        ? readers.parseWhen(raw, clock)[0]
        : readers.firstFutureWhen(raw, clock);
      if (!when) return { shown: tr('Say a day, and a time if there is one: “Friday 3pm”') };
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
      const found = typed === null ? readers?.extractAmounts(raw)[0] : undefined;
      const value = typed ?? found?.value;
      if (!value || !Number.isFinite(value))
        return {
          shown: tr('Write an amount: “{exampleAmount}”', {
            exampleAmount: exampleAmount(clock.locale),
          }),
        };
      const currency = found?.currency ?? extra.currency ?? null;
      // Shown as it will be kept (core roundAmount: a dinar to its thousandth, a yen whole).
      const kept = roundAmount(value, currency);
      return {
        value: { value: kept, currency },
        shown: formatAmount(kept, currency, clock.locale),
      };
    }
    default:
      return { value: raw };
  }
}

const PLACEHOLDERS: Partial<Record<KitField['type'], string>> = {
  datetime: msg('Friday 3pm'),
  date: msg('October 15'),
};

export function KitForm({
  conversation,
  kit,
  custom = null,
  start = null,
  onClose,
}: {
  conversation: ConversationView;
  kit: KitChoice | null;
  /** What the form starts with (R61). */
  start?: KitStart | null;
  /** Or one of the organization's own kinds of card, made by one of its apps (PRD §74). */
  custom?: CustomKitOfferView | null;
  onClose: () => void;
}) {
  const t = useTheme();
  const qc = useQueryClient();
  const me = useMe();
  const { timeZone, locale } = useUserClock();
  const clock: Clock = { now: new Date(), timeZone, locale, workweek: me.workweek };
  const readers = useReaders();
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
  // An appointment with a host that takes bookings (R51, R58): one of its open slots, picked,
  // never typed, for an item of its catalog where it has one; without bookings, the day and time
  // are written as for any card. The host is the organization, or the other person if they take
  // bookings I may make, else me, filling my own diary for them.
  const appointment = kit === 'appointment';
  // An order (R60) is taken from the same catalog: the items sold by the piece, by the host
  // that takes orders.
  const ordering = kit === 'order_status';
  const catalog = appointment || ordering;
  const direct = conversation.kind === 'direct' && !conversation.business;
  // Read afresh when the form opens: a copy of the organization or the profile kept from before
  // the hours were set would say there's nothing to book.
  const orgHandle = catalog && conversation.business ? conversation.business.org.handle : '';
  const orgQ = useQuery({
    queryKey: qk.org(orgHandle),
    queryFn: () => endpoints.orgByHandle(orgHandle),
    enabled: Boolean(orgHandle),
    staleTime: 0,
  });
  const otherId = catalog && direct ? (conversation.other?.userId ?? '') : '';
  const otherQ = useQuery({
    queryKey: qk.person(otherId),
    queryFn: () => endpoints.person(otherId),
    enabled: Boolean(otherId),
    staleTime: 0,
  });
  const theirsOffered = ordering ? otherQ.data?.ordering : otherQ.data?.booking;
  const mineQ = useMyBooking(catalog && direct && otherQ.isSuccess && !theirsOffered);
  const host = useMemo(() => {
    if (!catalog) return null;
    const fits = (i: BookingItem) => (ordering ? isOrdered(i) : isBooked(i));
    // An organization's slots are asked for at once (the server says if it takes none); its
    // catalog arrives with its view.
    if (conversation.business) {
      const org = orgQ.data?.org;
      if (ordering)
        return org?.ordering
          ? {
              ref: { kind: 'org' as const, id: org.id },
              items: org.bookingItems.filter(fits),
              collections: org.collections,
              ways: org.ordering.fulfilment,
              note: org.ordering.note,
            }
          : null;
      return {
        ref: { kind: 'org' as const, id: conversation.business.org.id },
        items: (org?.bookingItems ?? []).filter(fits),
        collections: org?.collections ?? [],
        ways: [],
        note: null,
      };
    }
    const p = otherQ.data;
    if (conversation.other && ordering && p?.ordering)
      return {
        ref: { kind: 'person' as const, id: conversation.other.userId },
        items: p.ordering.items,
        collections: p.collections,
        ways: p.ordering.settings.fulfilment,
        note: p.ordering.settings.note,
      };
    if (conversation.other && !ordering && p?.booking)
      return {
        ref: { kind: 'person' as const, id: conversation.other.userId },
        items: p.booking.items,
        collections: p.collections,
        ways: [],
        note: null,
      };
    const mine = mineQ.data;
    if (direct && mine && (ordering ? mine.ordering : mine.booking))
      return {
        ref: { kind: 'person' as const, id: me.id },
        items: mine.items.filter(fits),
        collections: mine.collections,
        ways: mine.ordering?.fulfilment ?? [],
        note: mine.ordering?.note ?? null,
      };
    return null;
  }, [catalog, ordering, conversation, orgQ.data, otherQ.data, mineQ.data, direct, me.id]);
  // What's in the order (R60): an item's id and how many; none to begin with.
  const [cart, setCart] = useState<Record<string, number>>({});
  const [way, setWay] = useState<'pickup' | 'delivery' | null>(null);
  const orderTotal = useMemo(() => {
    if (!host || !ordering) return null;
    const priced = host.items.filter((i) => (cart[i.id] ?? 0) > 0 && i.price);
    const currencies = new Set(priced.map((i) => i.price?.currency));
    if (!priced.length || currencies.size !== 1) return null;
    const value = priced.reduce((sum, i) => sum + (i.price?.value ?? 0) * (cart[i.id] ?? 0), 0);
    return formatAmount(Math.round(value * 100) / 100, priced[0]?.price?.currency ?? null, locale);
  }, [host, ordering, cart, locale]);
  const [itemId, setItemId] = useState<string | null>(null);
  // What the form opens with (R61, R62), each time it opens: the item chosen, or a Pay card's
  // way, amount and note. A Pay card asks to be paid unless it says otherwise.
  useEffect(() => {
    if (!kit) return;
    if (start?.itemId) {
      if (kit === 'order_status') setCart({ [start.itemId]: 1 });
      if (kit === 'appointment') setItemId(start.itemId);
    }
    if (kit === 'payment_request') {
      setPicked((p) => ({ ...p, direction: start?.direction ?? 'ask' }));
      if (start?.amount) {
        setTexts((x) => ({
          ...x,
          amount: String(start.amount?.value ?? ''),
          ...(start.note ? { note: start.note } : {}),
        }));
        setCurrencies((c) => ({ ...c, amount: start.amount?.currency ?? null }));
      } else if (start?.note) setTexts((x) => ({ ...x, note: start.note ?? '' }));
    }
  }, [kit, start]);
  const item: BookingItem | null =
    host?.items.find((i) => i.id === itemId) ??
    (host && host.items.length === 1 ? (host.items[0] ?? null) : null);
  const [quantity, setQuantity] = useState(1);
  const slotWindow = useMemo(() => {
    const start = new Date();
    start.setMinutes(0, 0, 0);
    return {
      from: start.toISOString(),
      to: new Date(start.getTime() + 60 * 86_400_000).toISOString(),
    };
  }, []);
  // With a catalog, the slots are an item's: nothing to pick from until one is chosen.
  const slotsQ = useSlots(
    appointment && host && (item || host.items.length === 0) ? host.ref : null,
    slotWindow.from,
    slotWindow.to,
    item?.id ?? null,
    quantity,
  );
  const slots = slotsQ.data ?? null;
  const [slot, setSlot] = useState<string | null>(null);
  const price = item?.price
    ? formatAmount(item.price.value * quantity, item.price.currency, locale)
    : null;
  // Location: where the device says this person is, once, when they ask.
  const [spot, setSpot] = useState<{ lat: number; lng: number; accuracy?: number } | null>(null);
  const [locating, setLocating] = useState(false);
  // Or live, for a while: it follows them until then, while Caime is open (R29).
  const [liveFor, setLiveFor] = useState<'0' | '15' | '60' | '480'>('0');

  const close = () => {
    setTexts({});
    setPicked({});
    // A card's currency and days are its own: the next one starts from the defaults.
    setCurrencies({});
    setPickedDays({});
    setChoosing(null);
    setOptions(['', '']);
    setMultiple(false);
    setError(null);
    setSpot(null);
    setLiveFor('0');
    setSlot(null);
    setItemId(null);
    setQuantity(1);
    setCart({});
    setWay(null);
    onClose();
  };

  const locate = async () => {
    setLocating(true);
    setError(null);
    try {
      const Location = await import('expo-location');
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setError('Caime can’t see where you are. Allow it in your settings, or type a place.');
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
      setError(tr('Couldn’t find where you are just now. Try again, or type a place.'));
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
      const picking = Boolean(ordering && host?.items.length);
      for (const field of def.fields) {
        // From the catalog (R60), the server writes the number, what was ordered and the total.
        if (picking && ['reference', 'summary', 'amount'].includes(field.key)) continue;
        if (field.type === 'items') {
          const lines = options.map((o) => o.trim()).filter(Boolean);
          if (lines.length) fields[field.key] = lines;
          continue;
        }
        if (field.type === 'options') {
          if (picked[field.key] !== undefined) fields[field.key] = picked[field.key];
          continue;
        }
        // Booked from a catalog (R58): the item is what it's for, or the topic they wrote.
        const text =
          field.key === 'title' && item
            ? item.askTopic && (texts.title ?? '').trim()
              ? (texts.title ?? '')
              : item.name
            : (texts[field.key] ?? '');
        const read = readField(
          readers ?? (await loadReaders()),
          field,
          text,
          clock,
          Boolean(custom),
          extraFor(field),
        );
        if (text.trim() && read.value === undefined)
          return setError(`${tr(field.label)}: ${read.shown ?? 'that doesn’t look right.'}`);
        if (read.value !== undefined) fields[field.key] = read.value;
      }
      if (appointment && host?.items.length && !item) return setError(tr('Pick what it’s for.'));
      const lines = Object.entries(cart)
        .filter(([, n]) => n > 0)
        .map(([itemId, quantity]) => ({ itemId, quantity }));
      if (picking && !lines.length) return setError(tr('Pick something to order.'));
      if (slots?.slots.length) {
        if (!slot) return setError('Pick a time.');
        fields.start = { at: slot, hasTime: true };
      }
      const checked = custom ? prepareCustomFields(custom, fields) : prepareKitFields(kit, fields);
      if (!checked.ok) return setError(checked.error);
      body = {
        kind: 'kit',
        payload: custom
          ? { kit: 'custom', app: custom.app.id, key: custom.key, fields: checked.fields }
          : {
              kit,
              fields: checked.fields,
              ...(appointment && item ? { booking: { itemId: item.id, quantity } } : {}),
              ...(picking ? { order: { lines, fulfilment: way ?? host?.ways[0] ?? null } } : {}),
            },
      };
    }
    setBusy(true);
    setError(null);
    try {
      const { message } = await endpoints.send(conversation.id, {
        clientId: uuidv4(),
        ...body,
        ...(start?.replyToId ? { replyToId: start.replyToId } : {}),
      });
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
      // Taken meanwhile (R58): the open slots are asked again, so the next pick is a real one.
      if (slots) void slotsQ.refetch();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={def !== null}
      onClose={close}
      title={custom ? def?.name : def ? tr(def.name) : undefined}
      subtitle={custom ? def?.description : def ? tr(def.description) : undefined}
      footer={
        <Button
          label={tr('Send')}
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
              ? tr('Only this moment is shared, never where you go after.')
              : tr(
                  'Where you are follows here until then, while Caime is open. Stop it any time; only the latest point is kept.',
                )}
          </Text>
          {spot ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <MapPin size={18} color={t.c.success} />
              <Text variant="body" style={{ flex: 1 }} testID="location-found">
                {spot.accuracy
                  ? tr('Found you, within {accuracy} m.', { accuracy: spot.accuracy })
                  : tr('Found you.')}
              </Text>
              <Button label={tr('Clear')} size="sm" variant="ghost" onPress={() => setSpot(null)} />
            </View>
          ) : null}
          {spot ? (
            <Segmented
              label={tr('How long to share it')}
              value={liveFor}
              onChange={setLiveFor}
              options={[
                { value: '0', label: tr('Just now') },
                { value: '15', label: '15 min' },
                { value: '60', label: '1 hour' },
                { value: '480', label: '8 hours' },
              ]}
            />
          ) : (
            <Button
              label={tr('Use where I am now')}
              icon={MapPin}
              variant="secondary"
              loading={locating}
              onPress={() => void locate()}
              testID="location-here"
            />
          )}
          <TextField
            label={spot ? tr('Name it (optional)') : tr('Or type a place')}
            placeholder={spot ? tr('Home, the office…') : tr('Café Riche, Downtown')}
            value={texts.label ?? ''}
            onChangeText={(v) => setTexts((s) => ({ ...s, label: v }))}
            testID="location-label"
          />
        </View>
      ) : kit === 'poll' ? (
        <View style={{ gap: 12 }}>
          <TextField
            label={tr('Question')}
            value={texts.question ?? ''}
            onChangeText={(v) => setTexts((s) => ({ ...s, question: v }))}
            autoFocus
          />
          {options.map((o, i) => (
            <TextField
              // biome-ignore lint/suspicious/noArrayIndexKey: options are positional while typed
              key={i}
              label={tr('Option {i}', { i: i + 1 })}
              value={o}
              onChangeText={(v) => setOptions((all) => all.map((x, j) => (j === i ? v : x)))}
            />
          ))}
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {options.length < 12 ? (
              <Chip
                label={tr('Add an option')}
                icon={Plus}
                onPress={() => setOptions((all) => [...all, ''])}
              />
            ) : null}
            <Chip
              label={tr('People can pick more than one')}
              selected={multiple}
              onPress={() => setMultiple((v) => !v)}
            />
          </View>
        </View>
      ) : def ? (
        <View style={{ gap: 12 }}>
          {ordering && host?.items.length ? (
            <View style={{ gap: 10 }} testID="order-picker">
              {host.note ? (
                <Text variant="caption" color="textSecondary" auto>
                  {host.note}
                </Text>
              ) : null}
              {grouped(host.items, host.collections).flatMap((g) => [
                g.collection ? (
                  <Text
                    key={`shelf-${g.collection.id}`}
                    variant="overline"
                    color="textTertiary"
                    accessibilityRole="header"
                  >
                    {g.collection.name}
                  </Text>
                ) : null,
                ...g.items.map((i) => {
                  const n = cart[i.id] ?? 0;
                  return (
                    <View
                      key={i.id}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
                      testID={`order-item-${i.id}`}
                    >
                      <ItemPhoto path={itemPhotoPath(host.ref, i)} size={44} />
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text variant="bodyStrong" auto>
                          {i.name}
                        </Text>
                        {i.description ? (
                          <Text variant="caption" color="textSecondary" auto numberOfLines={2}>
                            {i.description}
                          </Text>
                        ) : null}
                        <Text variant="caption" color="textTertiary">
                          {i.price
                            ? formatAmount(i.price.value, i.price.currency, locale)
                            : tr('Free')}
                        </Text>
                      </View>
                      <IconButton
                        icon={Minus}
                        label={tr('Fewer')}
                        disabled={n <= 0}
                        onPress={() => setCart((c) => ({ ...c, [i.id]: Math.max(0, n - 1) }))}
                        testID={`order-less-${i.id}`}
                      />
                      <Text
                        variant="bodyStrong"
                        style={{ minWidth: 24, textAlign: 'center' }}
                        testID={`order-count-${i.id}`}
                      >
                        {n}
                      </Text>
                      <IconButton
                        icon={Plus}
                        label={tr('More')}
                        disabled={n >= i.maxQuantity}
                        onPress={() =>
                          setCart((c) => ({ ...c, [i.id]: Math.min(i.maxQuantity, n + 1) }))
                        }
                        testID={`order-more-${i.id}`}
                      />
                    </View>
                  );
                }),
              ])}
              {host.ways.length > 1 ? (
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  {host.ways.map((w) => (
                    <Chip
                      key={w}
                      label={w === 'pickup' ? tr('Pickup') : tr('Delivery')}
                      selected={(way ?? host.ways[0]) === w}
                      role="radio"
                      onPress={() => setWay(w)}
                      testID={`order-way-${w}`}
                    />
                  ))}
                </View>
              ) : null}
              <Text variant="caption" color="textSecondary" testID="order-total">
                {orderTotal
                  ? tr('{price}, not paid through Caime', { price: orderTotal })
                  : tr('Pick what you’d like.')}
              </Text>
            </View>
          ) : null}
          {def.fields.map((field, i) =>
            ordering &&
            host?.items.length &&
            ['reference', 'summary', 'amount'].includes(field.key) ? null : field.type ===
              'items' ? (
              <View key={field.key} style={{ gap: 8 }}>
                <Text variant="label">{tr(field.label)}</Text>
                {options.map((o, j) => (
                  <TextField
                    // biome-ignore lint/suspicious/noArrayIndexKey: items are positional while typed
                    key={j}
                    accessibilityLabel={tr('Item {j}', { j: j + 1 })}
                    placeholder={j === 0 ? tr('Milk') : j === 1 ? tr('Bread') : ''}
                    value={o}
                    onChangeText={(v) => setOptions((all) => all.map((x, k) => (k === j ? v : x)))}
                    testID={`checklist-item-input-${j}`}
                  />
                ))}
                {options.length < 100 ? (
                  <Chip
                    label={tr('Add an item')}
                    icon={Plus}
                    onPress={() => setOptions((all) => [...all, ''])}
                  />
                ) : null}
              </View>
            ) : field.type === 'options' ? (
              <View key={field.key} style={{ gap: 6 }}>
                <Text variant="label">{tr(field.label)}</Text>
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  {(field.choices ?? []).map((c) => (
                    <Chip
                      key={String(c.value)}
                      label={tr(c.label)}
                      selected={picked[field.key] === c.value}
                      // A Pay card's way is one or the other, never none (R62).
                      role={field.key === 'direction' ? 'radio' : undefined}
                      onPress={() =>
                        setPicked((s) => {
                          const next = { ...s };
                          if (next[field.key] === c.value && field.key !== 'direction')
                            delete next[field.key];
                          else next[field.key] = c.value;
                          return next;
                        })
                      }
                      testID={`kit-${field.key}-${c.value}`}
                    />
                  ))}
                </View>
              </View>
            ) : field.key === 'title' && host && host.items.length ? (
              <View key={field.key} style={{ gap: 10 }}>
                <View style={{ gap: 6 }}>
                  <Text variant="label">{tr(field.label)}</Text>
                  {grouped(host.items, host.collections).map((g) => (
                    <View key={g.collection?.id ?? 'loose'} style={{ gap: 6 }}>
                      {g.collection ? (
                        <Text variant="overline" color="textTertiary" accessibilityRole="header">
                          {g.collection.name}
                        </Text>
                      ) : null}
                      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                        {g.items.map((i) => (
                          <Chip
                            key={i.id}
                            label={
                              i.price
                                ? `${i.name} · ${formatAmount(i.price.value, i.price.currency, locale)}`
                                : i.name
                            }
                            selected={item?.id === i.id}
                            role="radio"
                            onPress={() => {
                              setItemId(i.id);
                              setQuantity(1);
                              setSlot(null);
                            }}
                            testID={`book-item-${i.id}`}
                          />
                        ))}
                      </View>
                    </View>
                  ))}
                  {item?.description ? (
                    <Text variant="caption" color="textSecondary" auto>
                      {item.description}
                    </Text>
                  ) : null}
                  {item ? (
                    <Text variant="caption" color="textTertiary" testID="book-item-line">
                      {[
                        item.unit === 'minutes'
                          ? tr('{m} min', { m: item.minutes ?? 0 })
                          : tr('Per day'),
                        price ? tr('{price}, not paid through Caime', { price }) : tr('Free'),
                      ].join(' · ')}
                    </Text>
                  ) : null}
                </View>
                {item && item.maxQuantity > 1 ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Text variant="label" style={{ flex: 1 }}>
                      {item.unit === 'days' ? tr('Days') : tr('For how many')}
                    </Text>
                    <IconButton
                      icon={Minus}
                      label={tr('Fewer')}
                      disabled={quantity <= 1}
                      onPress={() => {
                        setQuantity((n) => Math.max(1, n - 1));
                        setSlot(null);
                      }}
                      testID="book-quantity-less"
                    />
                    <Text
                      variant="bodyStrong"
                      style={{ minWidth: 28, textAlign: 'center' }}
                      testID="book-quantity"
                    >
                      {quantity}
                    </Text>
                    <IconButton
                      icon={Plus}
                      label={tr('More')}
                      disabled={quantity >= item.maxQuantity}
                      onPress={() => {
                        setQuantity((n) => Math.min(item.maxQuantity, n + 1));
                        setSlot(null);
                      }}
                      testID="book-quantity-more"
                    />
                  </View>
                ) : null}
                {item?.askTopic ? (
                  <TextField
                    label={tr('What it’s for')}
                    placeholder={tr('A question about…')}
                    value={texts.title ?? ''}
                    onChangeText={(v) => setTexts((s) => ({ ...s, title: v }))}
                    testID="book-topic"
                  />
                ) : null}
              </View>
            ) : field.key === 'start' && slots?.slots.length ? (
              <SlotPicker
                key={field.key}
                slots={slots.slots}
                slotMinutes={slots.slotMinutes ?? 0}
                value={slot}
                onChange={setSlot}
                timeZone={timeZone}
                locale={locale}
              />
            ) : (
              <TextField
                key={field.key}
                label={
                  field.required
                    ? tr(field.label)
                    : tr('{label} (optional)', { label: tr(field.label) })
                }
                testID={`kit-field-${field.key}`}
                placeholder={
                  field.placeholder ??
                  (field.type === 'amount'
                    ? exampleAmount(clock.locale)
                    : tr(PLACEHOLDERS[field.type] ?? ''))
                }
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
                      label={tr('Choose {field}', { field: tr(field.label).toLowerCase() })}
                      onPress={() => setChoosing(field)}
                      testID={`kit-when-${field.key}`}
                    />
                  ) : undefined
                }
                hint={
                  readField(
                    readers,
                    field,
                    texts[field.key] ?? '',
                    clock,
                    Boolean(custom),
                    extraFor(field),
                  ).shown
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
