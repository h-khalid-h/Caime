/**
 * A host's bookings (R51, R58), for whoever sets them: an organization's owner and admins in
 * its setup, a person in Settings. The hours (which days, from when to when, the grid, how soon
 * and how far ahead) and the catalog of what can be booked in them: each item a name, a price
 * or none, minutes or days, how many at once, how many in one booking, who may book it, and,
 * for an organization, who on the team does it. One component for both, so a clinic and a
 * consultant set up the same thing the same way.
 */
import type { BookingResponse } from '@caime/core/api';
import type {
  BookingAudience,
  BookingHours,
  BookingItem,
  BookingUnit,
  OrderingSettings,
} from '@caime/core/booking';
import {
  BOOKING_CAPACITY_MAX,
  BOOKING_DAYS_MAX,
  BOOKING_ITEMS_MAX,
  DAY_SHORT,
  describeHours,
  itemPhotoPath,
  SLOT_MINUTES,
} from '@caime/core/booking';
import {
  type CatalogCollection,
  COLLECTIONS_MAX,
  grouped,
  SLUG_MAX,
  slugError,
  slugify,
} from '@caime/core/catalog';
import { formatAmount } from '@caime/core/format';
import { msg, tr, trn } from '@caime/core/i18n';
import {
  PAYMENT_KIND_LABELS,
  PAYMENT_KINDS,
  PAYMENT_METHODS_MAX,
  type PaymentKind,
  type PaymentMethod,
  paymentUrlError,
} from '@caime/core/payments';
import type { Sphere } from '@caime/core/taxonomy';
import { useState } from 'react';
import { View } from 'react-native';
import { uploadFile } from '@/api/upload';
import { photoToUpload, pickFromLibrary } from '@/lib/photos';
import { useUserClock } from '@/lib/time';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { IconButton } from '@/ui/IconButton';
import {
  CalendarCheck,
  HandCoins,
  ImageIcon,
  Layers,
  Minus,
  Plus,
  ShoppingBag,
  Tag,
} from '@/ui/icons';
import { ListRow, SectionTitle } from '@/ui/ListRow';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { TimeField } from '@/ui/TimeField';
import { toast } from '@/ui/Toast';
import { ItemPhoto } from './ItemPhoto';

const LEADS: Array<{ value: number; label: string }> = [
  { value: 0, label: msg('Any time') },
  { value: 60, label: msg('An hour ahead') },
  { value: 120, label: msg('2 hours ahead') },
  { value: 1440, label: msg('A day ahead') },
];
const HORIZONS: Array<{ value: number; label: string }> = [
  { value: 7, label: msg('A week') },
  { value: 14, label: msg('2 weeks') },
  { value: 30, label: msg('A month') },
  { value: 60, label: msg('2 months') },
];
/** A person's audiences beyond everyone and their connections: the spheres a rate is for. */
const PERSON_SPHERES: Array<{ sphere: Sphere; label: string }> = [
  { sphere: 'family', label: msg('Family') },
  { sphere: 'friend', label: msg('Friends') },
  { sphere: 'work', label: msg('Work') },
  { sphere: 'customer', label: msg('Customers') },
];

export interface BookingHostInfo {
  kind: 'org' | 'person';
  name: string;
  /** The default currency of a price. */
  currency: string | null;
  /** The team, for an organization: who may be named as doing an item. */
  team?: Array<{ id: string; name: string }>;
  /** Whose catalog, for its items' photos (R63). */
  ref?: { kind: 'org' | 'person'; id: string };
}

/** "Haircut · 45 min · EGP 200 · Everyone": an item in one line. */
export function itemLine(item: BookingItem, locale: string, host: BookingHostInfo): string {
  return [
    item.unit === 'minutes'
      ? tr('{m} min', { m: item.minutes ?? 0 })
      : item.unit === 'days'
        ? tr('Per day')
        : tr('By the piece'),
    item.price ? formatAmount(item.price.value, item.price.currency, locale) : tr('Free'),
    audienceLabel(item.audience, host.kind),
  ].join(' · ');
}

export function audienceLabel(audience: BookingItem['audience'], kind: 'org' | 'person'): string {
  if (audience === 'public') return tr('Everyone');
  if (audience === 'connections') return kind === 'org' ? tr('Customers') : tr('Connections');
  return audience.map((s) => tr(PERSON_SPHERES.find((p) => p.sphere === s)?.label ?? s)).join(', ');
}

const newId = () => `i${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

function Stepper({
  label,
  value,
  min,
  max,
  onChange,
  testID,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
  testID?: string;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Text variant="label" style={{ flex: 1 }}>
        {label}
      </Text>
      <IconButton
        icon={Minus}
        label={tr('Fewer')}
        disabled={value <= min}
        onPress={() => onChange(Math.max(min, value - 1))}
        testID={testID ? `${testID}-less` : undefined}
      />
      <Text variant="bodyStrong" style={{ minWidth: 28, textAlign: 'center' }} testID={testID}>
        {value}
      </Text>
      <IconButton
        icon={Plus}
        label={tr('More')}
        disabled={value >= max}
        onPress={() => onChange(Math.min(max, value + 1))}
        testID={testID ? `${testID}-more` : undefined}
      />
    </View>
  );
}

export function BookingSetup({
  host,
  offer,
  save,
  testID = 'booking',
}: {
  host: BookingHostInfo;
  /** What the host offers: hours, catalog, orders (R60) and collections (R61), as saved. */
  offer: BookingResponse;
  /** Saves it whole; throws with a message the person can read. */
  save: (next: BookingResponse) => Promise<void>;
  testID?: string;
}) {
  const { booking: hours, items, ordering, collections } = offer;
  const { timeZone, locale } = useUserClock();
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState<number[]>([]);
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('17:00');
  const [slot, setSlot] = useState<BookingHours['slotMinutes']>(30);
  const [lead, setLead] = useState(120);
  const [horizon, setHorizon] = useState(30);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<BookingItem | null>(null);
  // Ordering (R60): how orders are had, and a line customers read first.
  const [ordersOpen, setOrdersOpen] = useState(false);
  const [ways, setWays] = useState<Array<'pickup' | 'delivery'>>(['pickup']);
  const [note, setNote] = useState('');
  const editOrders = () => {
    setWays(ordering?.fulfilment ?? ['pickup']);
    setNote(ordering?.note ?? '');
    setError(null);
    setOrdersOpen(true);
  };
  const saveOrdering = async (next: OrderingSettings | null) => {
    setBusy(true);
    setError(null);
    try {
      await save({ ...offer, ordering: next });
      setOrdersOpen(false);
      toast(next ? tr('Orders are on') : tr('Orders are off'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const edit = () => {
    const b = hours;
    const first = b?.days[0];
    setDays(b ? b.days.map((d) => d.weekday) : [1, 2, 3, 4, 5]);
    setStart(first?.start ?? '09:00');
    setEnd(first?.end ?? '17:00');
    setSlot(b?.slotMinutes ?? 30);
    setLead(b?.leadMinutes ?? 120);
    setHorizon(b?.horizonDays ?? 30);
    setError(null);
    setOpen(true);
  };
  const saveHours = async (next: BookingHours | null) => {
    setBusy(true);
    setError(null);
    try {
      await save({ ...offer, booking: next });
      setOpen(false);
      toast(
        next
          ? host.kind === 'org'
            ? tr('Customers can book from your open slots now')
            : tr('People you allow can book from your open slots now')
          : tr('Bookings are off'),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const submit = () => {
    if (!days.length) return setError(tr('Pick at least one day.'));
    if (start >= end) return setError(tr('The day has to end after it starts.'));
    return saveHours({
      timeZone: hours?.timeZone ?? timeZone,
      slotMinutes: slot,
      days: [...days].sort().map((weekday) => ({ weekday, start, end })),
      leadMinutes: lead,
      horizonDays: horizon,
    });
  };
  const saveItems = async (next: BookingItem[]) => {
    await save({ ...offer, items: next });
  };
  // Ways to be paid (R62): set here with the rest; none left turns them off.
  const [way, setWay] = useState<PaymentMethod | null>(null);
  const methods = offer.payments?.methods ?? [];
  const savePayments = async (next: PaymentMethod[]) => {
    await save({
      ...offer,
      payments: next.length ? { methods: next, note: offer.payments?.note ?? null } : null,
    });
  };
  // Collections (R61): a shelf removed leaves its items in none.
  const [shelf, setShelf] = useState<CatalogCollection | null>(null);
  const saveCollections = async (next: CatalogCollection[]) => {
    const kept = new Set(next.map((c) => c.id));
    await save({
      ...offer,
      collections: next,
      items: items.map((i) =>
        i.collectionId && !kept.has(i.collectionId) ? { ...i, collectionId: null } : i,
      ),
    });
  };

  return (
    <>
      <SectionTitle>{tr('Bookings')}</SectionTitle>
      <ListRow
        icon={CalendarCheck}
        title={hours ? describeHours(hours) : tr('Bookings are off')}
        subtitle={
          hours
            ? host.kind === 'org'
              ? tr(
                  'Customers, and your AI agent, book from the open slots; your team confirms each one.',
                )
              : tr('People you allow book from the open slots; you confirm each one.')
            : tr('Set bookable hours and people book from the open slots in them.')
        }
        chevron
        onPress={edit}
        testID={`${testID}-hours`}
      />
      <ListRow
        icon={ShoppingBag}
        title={
          ordering
            ? tr('Orders: {ways}', {
                ways: ordering.fulfilment
                  .map((w) => (w === 'pickup' ? tr('Pickup') : tr('Delivery')))
                  .join(', '),
              })
            : tr('Orders are off')
        }
        subtitle={
          ordering
            ? tr('What you sell by the piece is ordered on an Order card; you confirm each one.')
            : tr('Sell by the piece: a dish, a cake, a bag of coffee. Turn orders on to take them.')
        }
        chevron
        onPress={editOrders}
        testID={`${testID}-orders`}
      />
      {grouped(items, collections).map((g) => (
        <View key={g.collection?.id ?? 'loose'}>
          {g.collection && collections.length ? (
            <Text
              variant="overline"
              color="textTertiary"
              style={{ paddingHorizontal: 16, paddingTop: 8 }}
              accessibilityRole="header"
            >
              {g.collection.name}
            </Text>
          ) : null}
          {g.items.map((item) => (
            <ListRow
              key={item.id}
              icon={Tag}
              title={item.name}
              subtitle={itemLine(item, locale, host)}
              chevron
              onPress={() => setEditing(item)}
              testID={`${testID}-item-${item.id}`}
            />
          ))}
        </View>
      ))}
      {items.length < BOOKING_ITEMS_MAX ? (
        <ListRow
          icon={Plus}
          title={tr('Add something to book or order')}
          subtitle={
            items.length
              ? trn(items.length, '{n} item in your catalog', '{n} items in your catalog')
              : tr(
                  'A haircut, a consultation, a room: its length, price and who may book it. Without one, bookings are for whatever people write.',
                )
          }
          onPress={() =>
            setEditing({
              id: newId(),
              name: '',
              price: null,
              unit: 'minutes',
              minutes: hours?.slotMinutes ?? 30,
              capacity: 1,
              maxQuantity: 1,
              audience: host.kind === 'org' ? 'connections' : 'connections',
              providers: null,
              askTopic: false,
              slug: '',
              description: null,
              collectionId: null,
            })
          }
          testID={`${testID}-add-item`}
        />
      ) : null}
      <SectionTitle>{tr('Ways to be paid')}</SectionTitle>
      {methods.map((m) => (
        <ListRow
          key={m.id}
          icon={HandCoins}
          title={m.label}
          subtitle={[tr(PAYMENT_KIND_LABELS[m.kind]), audienceLabel(m.audience, host.kind)].join(
            ' · ',
          )}
          chevron
          onPress={() => setWay(m)}
          testID={`${testID}-way-${m.id}`}
        />
      ))}
      {methods.length < PAYMENT_METHODS_MAX ? (
        <ListRow
          icon={Plus}
          title={tr('Add a way to be paid')}
          subtitle={tr(
            'A bank account, a payment link of your own, a wallet number, or cash. A Pay card shows them to whoever pays; nothing is paid through Caime.',
          )}
          onPress={() =>
            setWay({
              id: newId(),
              kind: 'bank',
              label: '',
              details: null,
              url: null,
              audience: 'connections',
            })
          }
          testID={`${testID}-add-way`}
        />
      ) : null}
      <SectionTitle>{tr('Collections')}</SectionTitle>
      {collections.map((c) => (
        <ListRow
          key={c.id}
          icon={Layers}
          title={c.name}
          subtitle={[
            trn(items.filter((i) => i.collectionId === c.id).length, '{n} item', '{n} items'),
            audienceLabel(c.audience, host.kind),
          ].join(' · ')}
          chevron
          onPress={() => setShelf(c)}
          testID={`${testID}-collection-${c.id}`}
        />
      ))}
      {collections.length < COLLECTIONS_MAX ? (
        <ListRow
          icon={Plus}
          title={tr('Add a collection')}
          subtitle={tr(
            'Group what you offer: treatments, products, rooms. A public one has a page of its own.',
          )}
          onPress={() =>
            setShelf({
              id: newId(),
              slug: '',
              name: '',
              description: null,
              audience: 'public',
            })
          }
          testID={`${testID}-add-collection`}
        />
      ) : null}
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={tr('Bookable hours')}
        subtitle={
          host.kind === 'org'
            ? tr('In {timeZone}. A booking is an appointment card your team confirms.', {
                timeZone: hours?.timeZone ?? timeZone,
              })
            : tr('In {timeZone}. A booking is an appointment card you confirm.', {
                timeZone: hours?.timeZone ?? timeZone,
              })
        }
        footer={
          <View style={{ gap: 8 }}>
            <Button
              label={tr('Save')}
              block
              size="lg"
              onPress={submit}
              loading={busy}
              testID={`${testID}-save`}
            />
            {hours ? (
              <Button
                label={tr('Turn bookings off')}
                variant="ghost"
                block
                onPress={() => void saveHours(null)}
                testID={`${testID}-off`}
              />
            ) : null}
          </View>
        }
      >
        <View style={{ gap: 16 }}>
          <View style={{ gap: 6 }}>
            <Text variant="label">{tr('Days')}</Text>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {DAY_SHORT.map((d, i) => (
                <Chip
                  key={d}
                  label={tr(d)}
                  selected={days.includes(i)}
                  onPress={() =>
                    setDays((all) => (all.includes(i) ? all.filter((x) => x !== i) : [...all, i]))
                  }
                  testID={`${testID}-day-${i}`}
                />
              ))}
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <TimeField
                label={tr('From')}
                value={start}
                onChange={setStart}
                testID={`${testID}-start`}
              />
            </View>
            <View style={{ flex: 1 }}>
              <TimeField label={tr('To')} value={end} onChange={setEnd} testID={`${testID}-end`} />
            </View>
          </View>
          <View style={{ gap: 6 }}>
            <Text variant="label">{tr('Slots every')}</Text>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {SLOT_MINUTES.map((m) => (
                <Chip
                  key={m}
                  label={tr('{m} min', { m })}
                  selected={slot === m}
                  role="radio"
                  onPress={() => setSlot(m)}
                  testID={`${testID}-slot-${m}`}
                />
              ))}
            </View>
            <Text variant="caption" color="textTertiary">
              {tr('The grid a day is cut into; each item in your catalog has a length of its own.')}
            </Text>
          </View>
          <View style={{ gap: 6 }}>
            <Text variant="label">{tr('Bookable from')}</Text>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {LEADS.map((l) => (
                <Chip
                  key={l.value}
                  label={tr(l.label)}
                  selected={lead === l.value}
                  role="radio"
                  onPress={() => setLead(l.value)}
                />
              ))}
            </View>
          </View>
          <View style={{ gap: 6 }}>
            <Text variant="label">{tr('Up to')}</Text>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {HORIZONS.map((h) => (
                <Chip
                  key={h.value}
                  label={tr(h.label)}
                  selected={horizon === h.value}
                  role="radio"
                  onPress={() => setHorizon(h.value)}
                />
              ))}
            </View>
          </View>
          {error ? (
            <Text variant="bodyStrong" color="danger" testID={`${testID}-error`}>
              {error}
            </Text>
          ) : null}
        </View>
      </Sheet>
      <Sheet
        open={ordersOpen}
        onClose={() => setOrdersOpen(false)}
        title={tr('Orders')}
        subtitle={tr('An order is a card you confirm; nothing is paid through Caime.')}
        footer={
          <View style={{ gap: 8 }}>
            <Button
              label={tr('Save')}
              block
              size="lg"
              loading={busy}
              onPress={() => {
                if (!ways.length) return setError(tr('Pick how orders are had.'));
                void saveOrdering({ fulfilment: ways, note: note.trim() || null });
              }}
              testID={`${testID}-orders-save`}
            />
            {ordering ? (
              <Button
                label={tr('Turn orders off')}
                variant="ghost"
                block
                onPress={() => void saveOrdering(null)}
                testID={`${testID}-orders-off`}
              />
            ) : null}
          </View>
        }
      >
        <View style={{ gap: 16 }}>
          <View style={{ gap: 6 }}>
            <Text variant="label">{tr('How they’re had')}</Text>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {(['pickup', 'delivery'] as const).map((w) => (
                <Chip
                  key={w}
                  label={w === 'pickup' ? tr('Pickup') : tr('Delivery')}
                  selected={ways.includes(w)}
                  onPress={() =>
                    setWays((all) => (all.includes(w) ? all.filter((x) => x !== w) : [...all, w]))
                  }
                  testID={`${testID}-orders-${w}`}
                />
              ))}
            </View>
          </View>
          <TextField
            label={tr('A line customers read first (optional)')}
            placeholder={tr('Ready in about 20 minutes')}
            value={note}
            onChangeText={setNote}
            maxLength={300}
            testID={`${testID}-orders-note`}
          />
          {error ? (
            <Text variant="bodyStrong" color="danger">
              {error}
            </Text>
          ) : null}
        </View>
      </Sheet>
      {editing ? (
        <ItemEditor
          host={host}
          item={editing}
          collections={collections}
          isNew={!items.some((i) => i.id === editing.id)}
          onClose={() => setEditing(null)}
          onSave={async (item) => {
            const next = items.some((i) => i.id === item.id)
              ? items.map((i) => (i.id === item.id ? item : i))
              : [...items, item];
            await saveItems(next);
            setEditing(null);
            toast(tr('Saved'));
          }}
          onRemove={async () => {
            await saveItems(items.filter((i) => i.id !== editing.id));
            setEditing(null);
            toast(tr('Removed'));
          }}
          testID={`${testID}-item`}
        />
      ) : null}
      {way ? (
        <WayEditor
          host={host}
          way={way}
          isNew={!methods.some((m) => m.id === way.id)}
          onClose={() => setWay(null)}
          onSave={async (w) => {
            await savePayments(
              methods.some((m) => m.id === w.id)
                ? methods.map((m) => (m.id === w.id ? w : m))
                : [...methods, w],
            );
            setWay(null);
            toast(tr('Saved'));
          }}
          onRemove={async () => {
            await savePayments(methods.filter((m) => m.id !== way.id));
            setWay(null);
            toast(tr('Removed'));
          }}
          testID={`${testID}-way`}
        />
      ) : null}
      {shelf ? (
        <CollectionEditor
          host={host}
          collection={shelf}
          isNew={!collections.some((c) => c.id === shelf.id)}
          onClose={() => setShelf(null)}
          onSave={async (c) => {
            await saveCollections(
              collections.some((x) => x.id === c.id)
                ? collections.map((x) => (x.id === c.id ? c : x))
                : [...collections, c],
            );
            setShelf(null);
            toast(tr('Saved'));
          }}
          onRemove={async () => {
            await saveCollections(collections.filter((x) => x.id !== shelf.id));
            setShelf(null);
            toast(tr('Removed'));
          }}
          testID={`${testID}-collection`}
        />
      ) : null}
    </>
  );
}

/**
 * Who sees or books something (R58, R61): everyone, connections (an organization's customers),
 * or, for a person, the spheres they choose. One picker for items and collections.
 */
function AudiencePicker({
  host,
  audience,
  onChange,
  noun,
  testID,
}: {
  host: BookingHostInfo;
  audience: BookingAudience;
  onChange: (next: BookingAudience) => void;
  noun: 'item' | 'collection' | 'way';
  testID: string;
}) {
  const toggleSphere = (s: Sphere) => {
    const list = Array.isArray(audience) ? audience : [];
    const next = list.includes(s) ? list.filter((x) => x !== s) : [...list, s];
    onChange(next.length ? next : 'connections');
  };
  return (
    <View style={{ gap: 6 }}>
      <Text variant="label">{noun === 'item' ? tr('Who may book it') : tr('Who sees it')}</Text>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <Chip
          label={tr('Everyone')}
          selected={audience === 'public'}
          role="radio"
          onPress={() => onChange('public')}
          testID={`${testID}-public`}
        />
        <Chip
          label={host.kind === 'org' ? tr('Customers') : tr('Connections')}
          selected={audience === 'connections'}
          role="radio"
          onPress={() => onChange('connections')}
          testID={`${testID}-connections`}
        />
        {host.kind === 'person'
          ? PERSON_SPHERES.map((p) => (
              <Chip
                key={p.sphere}
                label={tr(p.label)}
                selected={Array.isArray(audience) && audience.includes(p.sphere)}
                onPress={() => toggleSphere(p.sphere)}
                testID={`${testID}-${p.sphere}`}
              />
            ))
          : null}
      </View>
      <Text variant="caption" color="textTertiary">
        {audience === 'public'
          ? noun === 'item'
            ? tr('Listed on your public page with its price; anyone can sign up and book it.')
            : noun === 'way'
              ? tr(
                  'Your page says you take it, never its details; a Pay card shows them to the payer.',
                )
              : tr(
                  'A page of its own, listed on yours; what’s in it shows to whom each item allows.',
                )
          : host.kind === 'org'
            ? tr('Anyone who writes to you on Caime.')
            : tr('Only the people you choose see it.')}
      </Text>
    </View>
  );
}

/** The address under the host's (R61): kept as typed when it's fine, else made from the name. */
function AddressField({
  slug,
  name,
  onChange,
  testID,
}: {
  slug: string;
  name: string;
  onChange: (slug: string) => void;
  testID: string;
}) {
  const shown = slug || slugify(name);
  const why = shown ? slugError(shown) : null;
  return (
    <TextField
      label={tr('Address')}
      placeholder={slugify(name) || 'haircut'}
      value={slug}
      onChangeText={(v) => onChange(v.toLowerCase().replace(/\s+/g, '-'))}
      autoCapitalize="none"
      maxLength={SLUG_MAX}
      hint={
        why === 'reserved'
          ? tr('That address is one of Caime’s own words.')
          : why
            ? tr('Use letters and digits, joined by hyphens.')
            : tr('The end of its link, when it’s public: …/{slug}', { slug: shown || '…' })
      }
      testID={`${testID}-address`}
    />
  );
}

/** One way to be paid (R62): what it is, what the payer needs, and who may see it. */
function WayEditor({
  host,
  way,
  isNew,
  onClose,
  onSave,
  onRemove,
  testID,
}: {
  host: BookingHostInfo;
  way: PaymentMethod;
  isNew: boolean;
  onClose: () => void;
  onSave: (w: PaymentMethod) => Promise<void>;
  onRemove: () => Promise<void>;
  testID: string;
}) {
  const [kind, setKind] = useState<PaymentKind>(way.kind);
  const [label, setLabel] = useState(way.label);
  const [details, setDetails] = useState(way.details ?? '');
  const [url, setUrl] = useState(way.url ?? '');
  const [audience, setAudience] = useState<BookingAudience>(way.audience);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'save' | 'remove' | null>(null);
  const submit = async () => {
    const name = label.trim() || tr(PAYMENT_KIND_LABELS[kind]);
    const link = url.trim();
    if (kind === 'link') {
      const why = paymentUrlError(link);
      if (why) return setError(tr(why));
    }
    if ((kind === 'bank' || kind === 'wallet') && !details.trim())
      return setError(tr('Say what the payer needs: an account or a number.'));
    setBusy('save');
    setError(null);
    try {
      await onSave({
        id: way.id,
        kind,
        label: name.slice(0, 60),
        details: kind === 'cash' || kind === 'link' ? null : details.trim() || null,
        url: kind === 'link' ? link : null,
        audience,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  return (
    <Sheet
      open
      onClose={onClose}
      title={isNew ? tr('A way to be paid') : way.label}
      subtitle={tr('Nothing is paid through Caime: this is what the payer reads.')}
      footer={
        <View style={{ gap: 8 }}>
          <Button
            label={tr('Save')}
            block
            size="lg"
            onPress={() => void submit()}
            loading={busy === 'save'}
            testID={`${testID}-save`}
          />
          {!isNew ? (
            <Button
              label={tr('Remove')}
              variant="ghost"
              block
              loading={busy === 'remove'}
              onPress={() => {
                setBusy('remove');
                void onRemove().finally(() => setBusy(null));
              }}
              testID={`${testID}-remove`}
            />
          ) : null}
        </View>
      }
    >
      <View style={{ gap: 16 }}>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {PAYMENT_KINDS.map((k) => (
            <Chip
              key={k}
              label={tr(PAYMENT_KIND_LABELS[k])}
              selected={kind === k}
              role="radio"
              onPress={() => setKind(k)}
              testID={`${testID}-${k}`}
            />
          ))}
        </View>
        <TextField
          label={tr('Name')}
          placeholder={tr(PAYMENT_KIND_LABELS[kind])}
          value={label}
          onChangeText={setLabel}
          maxLength={60}
          testID={`${testID}-label`}
        />
        {kind === 'link' ? (
          <TextField
            label={tr('Your payment link')}
            placeholder="https://"
            value={url}
            onChangeText={setUrl}
            autoCapitalize="none"
            keyboardType="url"
            maxLength={500}
            testID={`${testID}-url`}
          />
        ) : kind !== 'cash' ? (
          <TextField
            label={kind === 'bank' ? tr('Account or IBAN') : tr('What the payer needs')}
            value={details}
            onChangeText={setDetails}
            maxLength={300}
            multiline
            testID={`${testID}-details`}
          />
        ) : null}
        <AudiencePicker
          host={host}
          audience={audience}
          onChange={setAudience}
          noun="way"
          testID={testID}
        />
        {error ? (
          <Text variant="bodyStrong" color="danger" testID={`${testID}-error`}>
            {error}
          </Text>
        ) : null}
      </View>
    </Sheet>
  );
}

function CollectionEditor({
  host,
  collection,
  isNew,
  onClose,
  onSave,
  onRemove,
  testID,
}: {
  host: BookingHostInfo;
  collection: CatalogCollection;
  isNew: boolean;
  onClose: () => void;
  onSave: (c: CatalogCollection) => Promise<void>;
  onRemove: () => Promise<void>;
  testID: string;
}) {
  const [name, setName] = useState(collection.name);
  const [description, setDescription] = useState(collection.description ?? '');
  const [slug, setSlug] = useState(collection.slug);
  const [audience, setAudience] = useState<BookingAudience>(collection.audience);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'save' | 'remove' | null>(null);
  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) return setError(tr('Name it.'));
    setBusy('save');
    setError(null);
    try {
      await onSave({
        ...collection,
        name: trimmed,
        description: description.trim() || null,
        slug: slug.trim() || slugify(trimmed),
        audience,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  return (
    <Sheet
      open
      onClose={onClose}
      title={isNew ? tr('A collection') : collection.name}
      subtitle={tr('Items join it from their own page.')}
      footer={
        <View style={{ gap: 8 }}>
          <Button
            label={tr('Save')}
            block
            size="lg"
            onPress={() => void submit()}
            loading={busy === 'save'}
            testID={`${testID}-save`}
          />
          {!isNew ? (
            <Button
              label={tr('Remove')}
              variant="ghost"
              block
              loading={busy === 'remove'}
              onPress={() => {
                setBusy('remove');
                void onRemove().finally(() => setBusy(null));
              }}
              testID={`${testID}-remove`}
            />
          ) : null}
        </View>
      }
    >
      <View style={{ gap: 16 }}>
        <TextField
          label={tr('Name')}
          placeholder={tr('Treatments')}
          value={name}
          onChangeText={setName}
          autoFocus={isNew}
          maxLength={60}
          testID={`${testID}-name`}
        />
        <TextField
          label={tr('A line about it (optional)')}
          value={description}
          onChangeText={setDescription}
          maxLength={300}
          multiline
          testID={`${testID}-description`}
        />
        <AddressField slug={slug} name={name} onChange={setSlug} testID={testID} />
        <AudiencePicker
          host={host}
          audience={audience}
          onChange={setAudience}
          noun="collection"
          testID={testID}
        />
        {error ? (
          <Text variant="bodyStrong" color="danger" testID={`${testID}-error`}>
            {error}
          </Text>
        ) : null}
      </View>
    </Sheet>
  );
}

function ItemEditor({
  host,
  item,
  collections,
  isNew,
  onClose,
  onSave,
  onRemove,
  testID,
}: {
  host: BookingHostInfo;
  item: BookingItem;
  collections: CatalogCollection[];
  isNew: boolean;
  onClose: () => void;
  onSave: (item: BookingItem) => Promise<void>;
  onRemove: () => Promise<void>;
  testID: string;
}) {
  const [name, setName] = useState(item.name);
  const [paid, setPaid] = useState(item.price !== null);
  const [amount, setAmount] = useState(item.price ? String(item.price.value) : '');
  const [currency, setCurrency] = useState<string | null>(item.price?.currency ?? host.currency);
  const [unit, setUnit] = useState<BookingUnit>(item.unit);
  const [minutes, setMinutes] = useState<BookingItem['minutes']>(item.minutes ?? 30);
  const [capacity, setCapacity] = useState(item.capacity);
  const [maxQuantity, setMaxQuantity] = useState(item.maxQuantity);
  const [audience, setAudience] = useState<BookingItem['audience']>(item.audience);
  const [providers, setProviders] = useState<string[] | null>(item.providers);
  const [askTopic, setAskTopic] = useState(item.askTopic);
  // Its page (R61): a line about it, its address, its collection.
  const [description, setDescription] = useState(item.description ?? '');
  const [slug, setSlug] = useState(item.slug);
  const [collectionId, setCollectionId] = useState<string | null>(item.collectionId);
  // Its photo (R63): the one it has, or one just uploaded (shown by the file's own address).
  const [photoFileId, setPhotoFileId] = useState<string | null>(item.photoFileId ?? null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(
    host.ref ? itemPhotoPath(host.ref, item) : null,
  );
  const [photoBusy, setPhotoBusy] = useState(false);
  const pickPhoto = async () => {
    const res = await pickFromLibrary({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.9,
    });
    if (res.canceled || !res.assets[0]) return;
    setPhotoBusy(true);
    setError(null);
    try {
      const file = await uploadFile(await photoToUpload(res.assets[0], 'item.jpg'));
      setPhotoFileId(file.id);
      setPhotoPreview(file.thumbUrl ?? file.url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPhotoBusy(false);
    }
  };
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'save' | 'remove' | null>(null);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) return setError(tr('Name it.'));
    // A plain number (a comma as the decimal mark too) and a three-letter currency code: the
    // picker the cards use would pull its list into the startup chunk from here.
    const value = paid ? Number(amount.trim().replace(',', '.')) : null;
    if (paid && (value === null || !Number.isFinite(value) || value < 0))
      return setError(tr('Enter a price, or make it free.'));
    const code = (currency ?? '').trim().toUpperCase();
    if (paid && !/^[A-Z]{3}$/.test(code)) return setError(tr('Use a currency code like EGP.'));
    setBusy('save');
    setError(null);
    try {
      await onSave({
        id: item.id,
        name: trimmed,
        price: paid && value !== null ? { value, currency: code } : null,
        unit,
        minutes: unit === 'minutes' ? (minutes ?? 30) : null,
        capacity,
        maxQuantity: Math.min(
          maxQuantity,
          unit === 'minutes' ? capacity : unit === 'days' ? BOOKING_DAYS_MAX : BOOKING_CAPACITY_MAX,
        ),
        audience,
        // Something ordered names nobody to do it.
        providers: host.kind === 'org' && unit !== 'each' && providers?.length ? providers : null,
        askTopic,
        slug: slug.trim() || slugify(trimmed),
        description: description.trim() || null,
        collectionId,
        photoFileId,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={isNew ? tr('Something to book') : item.name}
      subtitle={
        host.kind === 'org'
          ? tr('Prices are {name}’s; nothing is paid through Caime.', { name: host.name })
          : tr('Prices are yours; nothing is paid through Caime.')
      }
      footer={
        <View style={{ gap: 8 }}>
          <Button
            label={tr('Save')}
            block
            size="lg"
            onPress={() => void submit()}
            loading={busy === 'save'}
            testID={`${testID}-save`}
          />
          {!isNew ? (
            <Button
              label={tr('Remove')}
              variant="ghost"
              block
              loading={busy === 'remove'}
              onPress={() => {
                setBusy('remove');
                void onRemove().finally(() => setBusy(null));
              }}
              testID={`${testID}-remove`}
            />
          ) : null}
        </View>
      }
    >
      <View style={{ gap: 16 }}>
        <TextField
          label={tr('What')}
          placeholder={tr('Haircut')}
          value={name}
          onChangeText={setName}
          autoFocus={isNew}
          testID={`${testID}-name`}
        />
        <View style={{ gap: 8 }}>
          {photoFileId ? <ItemPhoto path={photoPreview} size={160} wide label={name} /> : null}
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Chip
              label={photoFileId ? tr('Change the photo') : tr('Add a photo')}
              icon={ImageIcon}
              onPress={photoBusy ? undefined : () => void pickPhoto()}
              testID={`${testID}-photo`}
            />
            {photoFileId ? (
              <Chip
                label={tr('Take the photo off')}
                onPress={() => {
                  setPhotoFileId(null);
                  setPhotoPreview(null);
                }}
                testID={`${testID}-photo-off`}
              />
            ) : null}
          </View>
        </View>
        <TextField
          label={tr('A line about it (optional)')}
          value={description}
          onChangeText={setDescription}
          maxLength={300}
          multiline
          testID={`${testID}-description`}
        />
        {collections.length ? (
          <View style={{ gap: 6 }}>
            <Text variant="label">{tr('Collection')}</Text>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              <Chip
                label={tr('None')}
                selected={collectionId === null}
                role="radio"
                onPress={() => setCollectionId(null)}
              />
              {collections.map((c) => (
                <Chip
                  key={c.id}
                  label={c.name}
                  selected={collectionId === c.id}
                  role="radio"
                  onPress={() => setCollectionId(c.id)}
                  testID={`${testID}-in-${c.id}`}
                />
              ))}
            </View>
          </View>
        ) : null}
        <View style={{ gap: 6 }}>
          <Text variant="label">{tr('Price')}</Text>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Chip label={tr('Free')} selected={!paid} role="radio" onPress={() => setPaid(false)} />
            <Chip
              label={tr('Paid')}
              selected={paid}
              role="radio"
              onPress={() => setPaid(true)}
              testID={`${testID}-paid`}
            />
          </View>
          {paid ? (
            <TextField
              placeholder="200"
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              inputMode="decimal"
              testID={`${testID}-price`}
              trailing={
                <TextField
                  value={currency ?? ''}
                  onChangeText={(v) => setCurrency(v.toUpperCase())}
                  placeholder="EGP"
                  autoCapitalize="characters"
                  maxLength={3}
                  accessibilityLabel={tr('Currency')}
                  style={{ width: 72 }}
                  testID={`${testID}-currency`}
                />
              }
            />
          ) : null}
        </View>
        <View style={{ gap: 6 }}>
          <Text variant="label">{tr('Booked by the')}</Text>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Chip
              label={tr('Minutes')}
              selected={unit === 'minutes'}
              role="radio"
              onPress={() => setUnit('minutes')}
            />
            <Chip
              label={tr('Days')}
              selected={unit === 'days'}
              role="radio"
              onPress={() => setUnit('days')}
              testID={`${testID}-days`}
            />
            <Chip
              label={tr('The piece')}
              selected={unit === 'each'}
              role="radio"
              onPress={() => {
                setUnit('each');
                setProviders(null);
                // A shop sells more than one at a time: ten an order unless set otherwise.
                if (maxQuantity === 1) setMaxQuantity(10);
              }}
              testID={`${testID}-each`}
            />
          </View>
          {unit === 'minutes' ? (
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {SLOT_MINUTES.map((m) => (
                <Chip
                  key={m}
                  label={tr('{m} min', { m })}
                  selected={minutes === m}
                  role="radio"
                  onPress={() => setMinutes(m)}
                  testID={`${testID}-minutes-${m}`}
                />
              ))}
            </View>
          ) : unit === 'days' ? (
            <Text variant="caption" color="textTertiary">
              {tr('A stay: one booking takes whole days from the day it starts.')}
            </Text>
          ) : (
            <Text variant="caption" color="textTertiary">
              {tr('Ordered on an Order card, never a time: a dish, a cake, a bag of coffee.')}
            </Text>
          )}
        </View>
        {unit !== 'each' ? (
          <Stepper
            label={unit === 'days' ? tr('Rooms, or places, at once') : tr('How many at once')}
            value={capacity}
            min={1}
            max={BOOKING_CAPACITY_MAX}
            onChange={(n) => {
              setCapacity(n);
              if (unit === 'minutes' && maxQuantity > n) setMaxQuantity(n);
            }}
            testID={`${testID}-capacity`}
          />
        ) : null}
        <Stepper
          label={
            unit === 'days'
              ? tr('Days in one booking, up to')
              : unit === 'each'
                ? tr('In one order, up to')
                : tr('Places in one booking, up to')
          }
          value={maxQuantity}
          min={1}
          max={
            unit === 'minutes'
              ? capacity
              : unit === 'days'
                ? BOOKING_DAYS_MAX
                : BOOKING_CAPACITY_MAX
          }
          onChange={setMaxQuantity}
          testID={`${testID}-max`}
        />
        <AudiencePicker
          host={host}
          audience={audience}
          onChange={setAudience}
          noun="item"
          testID={testID}
        />
        {host.kind === 'org' && unit !== 'each' && host.team?.length ? (
          <View style={{ gap: 6 }}>
            <Text variant="label">{tr('Who does it')}</Text>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              <Chip
                label={tr('Anyone on the team')}
                selected={!providers?.length}
                role="radio"
                onPress={() => setProviders(null)}
              />
              {host.team.map((m) => (
                <Chip
                  key={m.id}
                  label={m.name}
                  selected={Boolean(providers?.includes(m.id))}
                  onPress={() =>
                    setProviders((p) => {
                      const list = p ?? [];
                      const next = list.includes(m.id)
                        ? list.filter((x) => x !== m.id)
                        : [...list, m.id];
                      return next.length ? next : null;
                    })
                  }
                  testID={`${testID}-provider-${m.id}`}
                />
              ))}
            </View>
            <Text variant="caption" color="textTertiary">
              {tr(
                'Decided when you confirm a booking: whoever is free with the fewest that day. Customers never see who.',
              )}
            </Text>
          </View>
        ) : null}
        <AddressField slug={slug} name={name} onChange={setSlug} testID={testID} />
        <Chip
          label={tr('They write what it’s for')}
          selected={askTopic}
          onPress={() => setAskTopic((v) => !v)}
          testID={`${testID}-topic`}
        />
        {error ? (
          <Text variant="bodyStrong" color="danger" testID={`${testID}-error`}>
            {error}
          </Text>
        ) : null}
      </View>
    </Sheet>
  );
}
