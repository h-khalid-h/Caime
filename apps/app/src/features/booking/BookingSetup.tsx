/**
 * A host's bookings (R51, R58), for whoever sets them: an organization's owner and admins in
 * its setup, a person in Settings. The hours (which days, from when to when, the grid, how soon
 * and how far ahead) and the catalog of what can be booked in them: each item a name, a price
 * or none, minutes or days, how many at once, how many in one booking, who may book it, and,
 * for an organization, who on the team does it. One component for both, so a clinic and a
 * consultant set up the same thing the same way.
 */

import type { BookingResponse, BookingSaveBody } from '@caime/core/api';
import type {
  BookingAudience,
  BookingDay,
  BookingHours,
  BookingItem,
  BookingUnit,
  ClosedDays,
  OrderingSettings,
  PlaceHours,
  SharedResource,
} from '@caime/core/booking';
import {
  BOOKING_CAPACITY_MAX,
  BOOKING_DAYS_MAX,
  BOOKING_ITEMS_MAX,
  CLOSED_MAX,
  describeHours,
  itemPhotoPath,
  RESOURCES_MAX,
  SLOT_MINUTES,
  STOCK_MAX,
  stockLine,
} from '@caime/core/booking';
import {
  type CatalogCollection,
  COLLECTIONS_MAX,
  grouped,
  moveItem,
  moveOne,
  SLUG_MAX,
  slugError,
  slugify,
} from '@caime/core/catalog';
import type { PayKindHint } from '@caime/core/countries';
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
import Boxes from 'lucide-react-native/icons/boxes';
import CalendarCheck from 'lucide-react-native/icons/calendar-check';
import CalendarOff from 'lucide-react-native/icons/calendar-off';
import HandCoins from 'lucide-react-native/icons/hand-coins';
import ImageIcon from 'lucide-react-native/icons/image';
import Layers from 'lucide-react-native/icons/layers';
import MapPin from 'lucide-react-native/icons/map-pin';
import Plus from 'lucide-react-native/icons/plus';
import ShoppingBag from 'lucide-react-native/icons/shopping-bag';
import Tag from 'lucide-react-native/icons/tag';
import { useState } from 'react';
import { View } from 'react-native';
import { uploadFile } from '@/api/upload';
import { photoToUpload, pickFromLibrary } from '@/lib/photos';
import { useUserClock } from '@/lib/time';
import { Button } from '@/ui/Button';
import { Chip, ChoiceChips } from '@/ui/Chip';
import { DateField } from '@/ui/DateField';
import { dayOf, formatDay } from '@/ui/dates';
import { ListRow, SectionTitle } from '@/ui/ListRow';
import { Sheet } from '@/ui/Sheet';
import { SpherePicker } from '@/ui/SpherePicker';
import { Stepper } from '@/ui/Stepper';
import { SwitchRow } from '@/ui/SwitchRow';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { toast } from '@/ui/Toast';
import { BranchHours } from './BranchHours';
import { draftsOf, ItemOptionsEditor, type OptionDraft, optionsFrom } from './ItemOptionsEditor';
import { ItemPhoto } from './ItemPhoto';
import { WeekHours, weekHoursError } from './WeekHours';

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
/** Whoever on the team is free: the providers' choice that names nobody (an id is a uuid). */
const ANYONE = 'anyone';
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
  /** The host's own time zone and days worked (R76): where its hours start from. */
  timeZone: string;
  workweek: number[];
  /** The first day of its week, for the days as listed. */
  weekStart: number;
  /** The ways people are paid where it is (R76), offered when a way is added. */
  payKinds: PayKindHint[];
  /** The team, for an organization: who may be named as doing an item. */
  team?: Array<{ id: string; name: string }>;
  /** Whose catalog, for its items' photos (R63). */
  ref?: { kind: 'org' | 'person'; id: string };
  /** An organization's places its customers may see (R92): where an item may be done. */
  branches?: Array<{ id: string; name: string }>;
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
    // Its count as its host reads it (R60): "12 in stock".
    stockLine(item.stock, true),
    audienceLabel(item.audience, host.kind),
  ]
    .filter(Boolean)
    .join(' · ');
}

export function audienceLabel(audience: BookingItem['audience'], kind: 'org' | 'person'): string {
  if (audience === 'public') return tr('Everyone');
  if (audience === 'connections') return kind === 'org' ? tr('Customers') : tr('Connections');
  return audience.map((s) => tr(PERSON_SPHERES.find((p) => p.sphere === s)?.label ?? s)).join(', ');
}

const newId = () => `i${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

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
  save: (next: BookingSaveBody) => Promise<void>;
  testID?: string;
}) {
  const { booking: hours, items, ordering, collections } = offer;
  // The offer as saved, each count left out but one changed here (R60): an order may have taken
  // one since this was read, and a count sent back as it was read would undo it.
  const send = (next: BookingResponse, change?: { id: string; stock: number | null }) =>
    save({
      ...next,
      items: next.items.map(({ stock: _read, ...i }) =>
        change && i.id === change.id ? { ...i, stock: change.stock } : i,
      ),
    });
  const { locale } = useUserClock();
  // Hours are the host's: an organization's own zone, else the person's (R76).
  const timeZone = host.timeZone;
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState<BookingDay[]>([]);
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
      await send({ ...offer, ordering: next });
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
    // Fresh hours start on the days the host works (R76), nine to five.
    setDays(
      b
        ? b.days.map((d) => ({ ...d }))
        : host.workweek.map((weekday) => ({ weekday, start: '09:00', end: '17:00' })),
    );
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
      await send({ ...offer, booking: next });
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
    const wrong = weekHoursError(days);
    if (wrong) return setError(wrong);
    return saveHours({
      timeZone: hours?.timeZone ?? timeZone,
      slotMinutes: slot,
      days,
      leadMinutes: lead,
      horizonDays: horizon,
      // What items share (R58), a branch's own days (R92) and closed days (C2a) stay as they are.
      ...(hours?.resources?.length ? { resources: hours.resources } : {}),
      ...(hours?.placeHours?.length ? { placeHours: hours.placeHours } : {}),
      ...(hours?.closed?.length ? { closed: hours.closed } : {}),
    });
  };
  const saveItems = async (next: BookingItem[], change?: { id: string; stock: number | null }) => {
    await send({ ...offer, items: next }, change);
  };
  // Ways to be paid (R62): set here with the rest; none left turns them off.
  const [way, setWay] = useState<PaymentMethod | null>(null);
  const methods = offer.payments?.methods ?? [];
  const savePayments = async (next: PaymentMethod[]) => {
    await send({
      ...offer,
      payments: next.length ? { methods: next, note: offer.payments?.note ?? null } : null,
    });
  };
  // Shared resources (R58): kept with the hours; one removed leaves its items sharing nothing.
  const resources = hours?.resources ?? [];
  const [shared, setShared] = useState<SharedResource | null>(null);
  const saveResources = async (next: SharedResource[]) => {
    if (!hours) return;
    const kept = new Set(next.map((r) => r.id));
    await send({
      ...offer,
      booking: { ...hours, resources: next },
      items: items.map((i) =>
        i.resourceId && !kept.has(i.resourceId) ? { ...i, resourceId: null } : i,
      ),
    });
  };
  // Closed days (C2a): kept with the hours, in the order they come, at every branch.
  const closed = hours?.closed ?? [];
  const [closing, setClosing] = useState<{ index: number | null; days: ClosedDays } | null>(null);
  const saveClosed = async (next: ClosedDays[]) => {
    if (!hours) return;
    const { closed: _was, ...base } = hours;
    const sorted = [...next].sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
    await send({ ...offer, booking: sorted.length ? { ...base, closed: sorted } : base });
  };
  // A branch's own days (R92): none kept, it opens when the organization does.
  const [branch, setBranch] = useState<{ id: string; name: string } | null>(null);
  const saveBranchDays = async (placeId: string, own: Omit<PlaceHours, 'placeId'> | null) => {
    if (!hours) return;
    const rest = (hours.placeHours ?? []).filter((p) => p.placeId !== placeId);
    const placeHours = own ? [...rest, { placeId, ...own }] : rest;
    const { placeHours: _was, ...base } = hours;
    await send({ ...offer, booking: placeHours.length ? { ...base, placeHours } : base });
  };
  // Collections (R61): a shelf removed leaves its items in none.
  const [shelf, setShelf] = useState<CatalogCollection | null>(null);
  const saveCollections = async (next: CatalogCollection[]) => {
    const kept = new Set(next.map((c) => c.id));
    await send({
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
        title={hours ? describeHours(hours, host.weekStart) : tr('Bookings are off')}
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
      {hours
        ? resources.map((r) => (
            <ListRow
              key={r.id}
              icon={Boxes}
              title={r.name}
              subtitle={[
                trn(r.capacity, 'One at a time', '{n} at a time'),
                trn(
                  items.filter((i) => i.resourceId === r.id).length,
                  'Shared by {n} item',
                  'Shared by {n} items',
                ),
              ].join(' · ')}
              chevron
              onPress={() => setShared(r)}
              testID={`${testID}-resource-${r.id}`}
            />
          ))
        : null}
      {hours && resources.length < RESOURCES_MAX ? (
        <ListRow
          icon={Plus}
          title={tr('Add something shared')}
          subtitle={tr(
            'Chairs, rooms or a table that several items use: a time is open only while one is free.',
          )}
          onPress={() => setShared({ id: newId(), name: '', capacity: 1 })}
          testID={`${testID}-add-resource`}
        />
      ) : null}
      {hours
        ? (host.branches ?? []).map((b) => {
            const own = hours.placeHours?.find((p) => p.placeId === b.id);
            return (
              <ListRow
                key={b.id}
                icon={MapPin}
                title={tr('Hours at {place}', { place: b.name })}
                subtitle={
                  own
                    ? [
                        own.days.length
                          ? describeHours({ ...hours, days: own.days }, host.weekStart)
                          : tr('The organization’s hours'),
                        own.staff?.length
                          ? trn(own.staff.length, 'One person works here', '{n} people work here')
                          : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')
                    : tr('Same as the organization’s')
                }
                chevron
                onPress={() => setBranch(b)}
                testID={`${testID}-branch-${b.id}`}
              />
            );
          })
        : null}
      {hours
        ? closed.map((c, i) => (
            <ListRow
              key={`${c.from}-${c.to}`}
              icon={CalendarOff}
              title={closedLabel(c, locale)}
              subtitle={c.note || tr('Closed')}
              chevron
              onPress={() => setClosing({ index: i, days: c })}
              testID={`${testID}-closed-${i}`}
            />
          ))
        : null}
      {hours && closed.length < CLOSED_MAX ? (
        <ListRow
          icon={Plus}
          title={tr('Add closed days')}
          subtitle={tr('A holiday or a week away: nobody books a time on those days.')}
          onPress={() => {
            const today = dayOf(new Date());
            setClosing({ index: null, days: { from: today, to: today } });
          }}
          testID={`${testID}-add-closed`}
        />
      ) : null}
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
              ? trn(items.length, '{n} item in your catalogue', '{n} items in your catalogue')
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
          {open ? (
            <WeekHours days={days} onChange={setDays} weekStart={host.weekStart} testID={testID} />
          ) : null}
          <View style={{ gap: 6 }}>
            <Text variant="label">{tr('Slots every')}</Text>
            <ChoiceChips
              wrap
              flush
              label={tr('Slots every')}
              value={String(slot)}
              onChange={(m) => setSlot(SLOT_MINUTES.find((x) => String(x) === m) ?? slot)}
              options={SLOT_MINUTES.map((m) => ({ value: String(m), label: tr('{m} min', { m }) }))}
              testID={`${testID}-slot`}
            />
            <Text variant="caption" color="textTertiary">
              {tr(
                'The grid a day is cut into; each item in your catalogue has a length of its own.',
              )}
            </Text>
          </View>
          <View style={{ gap: 6 }}>
            <Text variant="label">{tr('Bookable from')}</Text>
            <ChoiceChips
              wrap
              flush
              label={tr('Bookable from')}
              value={String(lead)}
              onChange={(v) => setLead(Number(v))}
              options={LEADS.map((l) => ({ value: String(l.value), label: tr(l.label) }))}
              testID={`${testID}-lead`}
            />
          </View>
          <View style={{ gap: 6 }}>
            <Text variant="label">{tr('Up to')}</Text>
            <ChoiceChips
              wrap
              flush
              label={tr('Up to')}
              value={String(horizon)}
              onChange={(v) => setHorizon(Number(v))}
              options={HORIZONS.map((h) => ({ value: String(h.value), label: tr(h.label) }))}
              testID={`${testID}-horizon`}
            />
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
            <ChoiceChips
              multiple
              wrap
              flush
              label={tr('How they’re had')}
              value={ways}
              onChange={setWays}
              options={[
                { value: 'pickup' as const, label: tr('Pickup') },
                { value: 'delivery' as const, label: tr('Delivery') },
              ]}
              testID={`${testID}-orders`}
            />
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
      {branch && hours ? (
        <BranchHours
          branch={branch}
          hours={hours}
          weekStart={host.weekStart}
          team={host.team ?? []}
          onClose={() => setBranch(null)}
          onSave={async (own) => {
            await saveBranchDays(branch.id, own);
            setBranch(null);
          }}
          testID={`${testID}-branch-hours`}
        />
      ) : null}
      {closing ? (
        <ClosedEditor
          days={closing.days}
          isNew={closing.index === null}
          locale={locale}
          onClose={() => setClosing(null)}
          onSave={async (c) => {
            await saveClosed(
              closing.index === null
                ? [...closed, c]
                : closed.map((x, i) => (i === closing.index ? c : x)),
            );
            setClosing(null);
            toast(tr('Saved'));
          }}
          onRemove={async () => {
            await saveClosed(closed.filter((_, i) => i !== closing.index));
            setClosing(null);
            toast(tr('Removed'));
          }}
          testID={`${testID}-closed`}
        />
      ) : null}
      {shared ? (
        <ResourceEditor
          resource={shared}
          isNew={!resources.some((r) => r.id === shared.id)}
          onClose={() => setShared(null)}
          onSave={async (r) => {
            await saveResources(
              resources.some((x) => x.id === r.id)
                ? resources.map((x) => (x.id === r.id ? r : x))
                : [...resources, r],
            );
            setShared(null);
            toast(tr('Saved'));
          }}
          onRemove={async () => {
            await saveResources(resources.filter((x) => x.id !== shared.id));
            setShared(null);
            toast(tr('Removed'));
          }}
          testID={`${testID}-resource`}
        />
      ) : null}
      {editing ? (
        <ItemEditor
          host={host}
          item={editing}
          collections={collections}
          resources={resources}
          isNew={!items.some((i) => i.id === editing.id)}
          move={{
            earlier: moveItem(items, collections, editing.id, -1) !== null,
            later: moveItem(items, collections, editing.id, 1) !== null,
            onMove: async (by) => {
              const next = moveItem(items, collections, editing.id, by);
              if (next) await saveItems(next);
            },
          }}
          onClose={() => setEditing(null)}
          onSave={async (item, stock) => {
            const next = items.some((i) => i.id === item.id)
              ? items.map((i) => (i.id === item.id ? item : i))
              : [...items, item];
            await saveItems(next, stock === undefined ? undefined : { id: item.id, stock });
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
          move={{
            earlier: moveOne(methods, way.id, -1) !== null,
            later: moveOne(methods, way.id, 1) !== null,
            onMove: async (by) => {
              const next = moveOne(methods, way.id, by);
              if (next) await savePayments(next);
            },
          }}
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
          move={{
            earlier: moveOne(collections, shelf.id, -1) !== null,
            later: moveOne(collections, shelf.id, 1) !== null,
            onMove: async (by) => {
              const next = moveOne(collections, shelf.id, by);
              if (next) await saveCollections(next);
            },
          }}
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
  // "Some of them" is chosen before any sphere is: the audience stays connections until one is.
  const [some, setSome] = useState(Array.isArray(audience));
  const who = noun === 'item' ? tr('Who may book it') : tr('Who sees it');
  return (
    <View style={{ gap: 6 }}>
      <Text variant="label">{who}</Text>
      <ChoiceChips
        wrap
        flush
        label={who}
        value={Array.isArray(audience) || some ? 'some' : audience}
        onChange={(v) => {
          setSome(v === 'some');
          if (v !== 'some') onChange(v);
          else if (!Array.isArray(audience)) onChange('connections');
        }}
        options={[
          { value: 'public' as const, label: tr('Everyone'), testID: `${testID}-public` },
          {
            value: 'connections' as const,
            label: host.kind === 'org' ? tr('Customers') : tr('Connections'),
            testID: `${testID}-connections`,
          },
          ...(host.kind === 'person'
            ? [
                {
                  value: 'some' as const,
                  label: tr('Only some of your people'),
                  testID: `${testID}-some`,
                },
              ]
            : []),
        ]}
        testID={`${testID}-audience`}
      />
      {host.kind === 'person' && (some || Array.isArray(audience)) ? (
        <SpherePicker
          multiple
          plural
          wrap
          flush
          label={tr('Which of them')}
          value={Array.isArray(audience) ? audience : []}
          onChange={(next) => onChange(next.length ? next : 'connections')}
          spheres={PERSON_SPHERES.map((p) => p.sphere)}
          optionTestID={(sphere) => `${testID}-${sphere}`}
          testID={`${testID}-spheres`}
        />
      ) : null}
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
  move,
  onClose,
  onSave,
  onRemove,
  testID,
}: {
  host: BookingHostInfo;
  way: PaymentMethod;
  isNew: boolean;
  move: Move;
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
          {!isNew ? <MoveButtons move={move} testID={testID} /> : null}
          {!isNew ? (
            <Button
              label={tr('Remove')}
              variant="ghost"
              block
              loading={busy === 'remove'}
              onPress={() => {
                setBusy('remove');
                setError(null);
                void onRemove()
                  .catch((e: Error) => setError(e.message))
                  .finally(() => setBusy(null));
              }}
              testID={`${testID}-remove`}
            />
          ) : null}
        </View>
      }
    >
      <View style={{ gap: 16 }}>
        {isNew && host.payKinds.length ? (
          <View style={{ gap: 6 }}>
            <Text variant="label">{tr('Common where you are')}</Text>
            <ChoiceChips
              wrap
              flush
              label={tr('Common where you are')}
              value={
                host.payKinds.find((h) => h.kind === kind && tr(h.label) === label)?.label ?? null
              }
              onChange={(key) => {
                const hint = host.payKinds.find((h) => h.label === key);
                if (!hint) return;
                setKind(hint.kind);
                setLabel(tr(hint.label));
              }}
              options={host.payKinds.map((hint) => ({
                value: hint.label,
                label: tr(hint.label),
                testID: `${testID}-hint-${hint.label}`,
              }))}
              testID={`${testID}-hints`}
            />
          </View>
        ) : null}
        <ChoiceChips
          wrap
          flush
          label={tr('Kind')}
          value={kind}
          onChange={setKind}
          options={PAYMENT_KINDS.map((k) => ({ value: k, label: tr(PAYMENT_KIND_LABELS[k]) }))}
          testID={testID}
        />
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

/** Where something sits in the host's order (R61): one place up or down, and whether it can. */
interface Move {
  earlier: boolean;
  later: boolean;
  onMove: (by: -1 | 1) => Promise<void>;
}

/**
 * One place up or down (R61): where the host's pages, this list and the card's picker show it.
 * Saved at once; the sheet stays open to move it again.
 */
function MoveButtons({ move, testID }: { move: Move; testID: string }) {
  const [busy, setBusy] = useState<-1 | 1 | null>(null);
  if (!move.earlier && !move.later) return null;
  const go = (by: -1 | 1) => {
    setBusy(by);
    void move
      .onMove(by)
      .catch((e: Error) => toast(e.message, { tone: 'danger' }))
      .finally(() => setBusy(null));
  };
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <View style={{ flex: 1 }}>
        <Button
          label={tr('Move up')}
          variant="secondary"
          block
          disabled={!move.earlier || busy !== null}
          loading={busy === -1}
          onPress={() => go(-1)}
          testID={`${testID}-up`}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Button
          label={tr('Move down')}
          variant="secondary"
          block
          disabled={!move.later || busy !== null}
          loading={busy === 1}
          onPress={() => go(1)}
          testID={`${testID}-down`}
        />
      </View>
    </View>
  );
}

/** Something several items share (R58): its name, and how many there are. */
/** "4 October 2026", or "4 October 2026 to 5 October 2026": a closure as the setup lists it. */
function closedLabel(c: ClosedDays, locale?: string): string {
  return c.from === c.to
    ? formatDay(c.from, locale)
    : tr('{from} to {to}', { from: formatDay(c.from, locale), to: formatDay(c.to, locale) });
}

/** Days closed whatever the week says (C2a): a holiday, a week away, with the team's word for it. */
function ClosedEditor({
  days,
  isNew,
  locale,
  onClose,
  onSave,
  onRemove,
  testID,
}: {
  days: ClosedDays;
  isNew: boolean;
  locale?: string;
  onClose: () => void;
  onSave: (c: ClosedDays) => Promise<void>;
  onRemove: () => Promise<void>;
  testID: string;
}) {
  const [from, setFrom] = useState<string | null>(days.from);
  const [to, setTo] = useState<string | null>(days.to);
  const [note, setNote] = useState(days.note ?? '');
  const [busy, setBusy] = useState<'save' | 'remove' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const today = dayOf(new Date());
  const submit = async () => {
    if (!from || !to) return setError(tr('Choose the first and the last day.'));
    if (to < from) return setError(tr('A closure ends on the day it starts or later.'));
    setBusy('save');
    setError(null);
    try {
      await onSave({ from, to, ...(note.trim() ? { note: note.trim() } : {}) });
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
      title={isNew ? tr('Closed days') : closedLabel(days, locale)}
      subtitle={tr('Nobody books a time on these days.')}
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
                setError(null);
                void onRemove()
                  .catch((e: Error) => setError(e.message))
                  .finally(() => setBusy(null));
              }}
              testID={`${testID}-remove`}
            />
          ) : null}
        </View>
      }
    >
      <View style={{ gap: 16 }}>
        <DateField
          label={tr('First day closed')}
          value={from}
          onChange={(day) => {
            setFrom(day);
            // A last day before the first moves with it.
            if (day && (!to || to < day)) setTo(day);
          }}
          min={isNew ? today : undefined}
          testID={`${testID}-from`}
        />
        <DateField
          label={tr('Last day closed')}
          value={to}
          onChange={setTo}
          min={from ?? undefined}
          testID={`${testID}-to`}
        />
        <TextField
          label={tr('What it is')}
          placeholder={tr('A holiday')}
          value={note}
          onChangeText={setNote}
          maxLength={80}
          testID={`${testID}-note`}
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

function ResourceEditor({
  resource,
  isNew,
  onClose,
  onSave,
  onRemove,
  testID,
}: {
  resource: SharedResource;
  isNew: boolean;
  onClose: () => void;
  onSave: (r: SharedResource) => Promise<void>;
  onRemove: () => Promise<void>;
  testID: string;
}) {
  const [name, setName] = useState(resource.name);
  const [capacity, setCapacity] = useState(resource.capacity);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'save' | 'remove' | null>(null);
  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) return setError(tr('Name it.'));
    setBusy('save');
    setError(null);
    try {
      await onSave({ ...resource, name: trimmed, capacity });
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
      title={isNew ? tr('Something shared') : resource.name}
      subtitle={tr('Items take one from their own page.')}
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
                setError(null);
                void onRemove()
                  .catch((e: Error) => setError(e.message))
                  .finally(() => setBusy(null));
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
          placeholder={tr('Chairs')}
          value={name}
          onChangeText={setName}
          autoFocus={isNew}
          maxLength={60}
          testID={`${testID}-name`}
        />
        <Stepper
          label={tr('How many there are')}
          value={capacity}
          min={1}
          max={BOOKING_CAPACITY_MAX}
          onChange={setCapacity}
          testID={`${testID}-capacity`}
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
  move,
  onClose,
  onSave,
  onRemove,
  testID,
}: {
  host: BookingHostInfo;
  collection: CatalogCollection;
  isNew: boolean;
  move: Move;
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
          {!isNew ? <MoveButtons move={move} testID={testID} /> : null}
          {!isNew ? (
            <Button
              label={tr('Remove')}
              variant="ghost"
              block
              loading={busy === 'remove'}
              onPress={() => {
                setBusy('remove');
                setError(null);
                void onRemove()
                  .catch((e: Error) => setError(e.message))
                  .finally(() => setBusy(null));
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
  resources,
  isNew,
  move,
  onClose,
  onSave,
  onRemove,
  testID,
}: {
  host: BookingHostInfo;
  item: BookingItem;
  collections: CatalogCollection[];
  resources: SharedResource[];
  isNew: boolean;
  move: Move;
  onClose: () => void;
  /** The item, and its count where it was changed (R60): a number, null for not counted. */
  onSave: (item: BookingItem, stock?: number | null) => Promise<void>;
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
  // Its options (R60), for something ordered by the piece: a size, extras.
  const [options, setOptions] = useState<OptionDraft[]>(() => draftsOf(item.options));
  // How many are left (R60), for something ordered by the piece; counted or not.
  const [counted, setCounted] = useState(item.stock !== undefined);
  const [left, setLeft] = useState(item.stock !== undefined ? String(item.stock) : '');
  // Its page (R61): a line about it, its address, its collection.
  const [description, setDescription] = useState(item.description ?? '');
  const [slug, setSlug] = useState(item.slug);
  const [collectionId, setCollectionId] = useState<string | null>(item.collectionId);
  // What it shares with other items (R58), for something held at a time.
  const [resourceId, setResourceId] = useState<string | null>(item.resourceId ?? null);
  // Where it's done (R92): one of an organization's branches, or wherever.
  const [placeId, setPlaceId] = useState<string | null>(item.placeId ?? null);
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
      setPhotoPreview(file.previewUrl ?? file.url);
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
    const count = Number(left.trim());
    const counting = unit === 'each' && counted;
    if (counting && (!/^\d+$/.test(left.trim()) || count > STOCK_MAX))
      return setError(tr('Say how many are left, or stop counting.'));
    const chosen = unit === 'each' ? optionsFrom(options, paid) : [];
    if (typeof chosen === 'string') return setError(chosen);
    // Sent only when it changed (an order may have taken one since this was opened).
    const stock = counting
      ? count === item.stock
        ? undefined
        : count
      : item.stock !== undefined
        ? null
        : undefined;
    setBusy('save');
    setError(null);
    try {
      await onSave(
        {
          id: item.id,
          name: trimmed,
          price: paid && value !== null ? { value, currency: code } : null,
          unit,
          minutes: unit === 'minutes' ? (minutes ?? 30) : null,
          capacity,
          maxQuantity: Math.min(
            maxQuantity,
            unit === 'minutes'
              ? capacity
              : unit === 'days'
                ? BOOKING_DAYS_MAX
                : BOOKING_CAPACITY_MAX,
          ),
          audience,
          // Something ordered names nobody to do it.
          providers: host.kind === 'org' && unit !== 'each' && providers?.length ? providers : null,
          askTopic,
          slug: slug.trim() || slugify(trimmed),
          description: description.trim() || null,
          collectionId,
          // Something ordered by the piece holds no time, so it shares nothing.
          resourceId:
            unit !== 'each' && resources.some((r) => r.id === resourceId) ? resourceId : null,
          placeId:
            unit !== 'each' && (host.branches ?? []).some((b) => b.id === placeId) ? placeId : null,
          photoFileId,
          ...(chosen.length ? { options: chosen } : {}),
        },
        stock,
      );
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
          {!isNew ? <MoveButtons move={move} testID={testID} /> : null}
          {!isNew ? (
            <Button
              label={tr('Remove')}
              variant="ghost"
              block
              loading={busy === 'remove'}
              onPress={() => {
                setBusy('remove');
                setError(null);
                void onRemove()
                  .catch((e: Error) => setError(e.message))
                  .finally(() => setBusy(null));
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
            <ChoiceChips
              wrap
              flush
              label={tr('Collection')}
              value={collectionId ?? 'none'}
              onChange={(v) => setCollectionId(v === 'none' ? null : v)}
              options={[
                { value: 'none', label: tr('None'), testID: `${testID}-no-collection` },
                ...collections.map((c) => ({
                  value: c.id,
                  label: c.name,
                  testID: `${testID}-in-${c.id}`,
                })),
              ]}
              testID={`${testID}-collection-of`}
            />
          </View>
        ) : null}
        {host.branches?.length && unit !== 'each' ? (
          <View style={{ gap: 6 }}>
            <Text variant="label">{tr('Where')}</Text>
            <ChoiceChips
              wrap
              flush
              label={tr('Where')}
              value={placeId ?? 'none'}
              onChange={(v) => setPlaceId(v === 'none' ? null : v)}
              options={[
                { value: 'none', label: tr('Wherever'), testID: `${testID}-anywhere` },
                ...host.branches.map((b) => ({
                  value: b.id,
                  label: b.name,
                  testID: `${testID}-at-${b.id}`,
                })),
              ]}
              testID={`${testID}-where`}
            />
          </View>
        ) : null}
        {resources.length && unit !== 'each' ? (
          <View style={{ gap: 6 }}>
            <Text variant="label">{tr('Takes one of')}</Text>
            <ChoiceChips
              wrap
              flush
              label={tr('Takes one of')}
              value={resourceId ?? 'none'}
              onChange={(v) => setResourceId(v === 'none' ? null : v)}
              options={[
                { value: 'none', label: tr('Nothing shared'), testID: `${testID}-no-resource` },
                ...resources.map((r) => ({
                  value: r.id,
                  label: r.name,
                  testID: `${testID}-uses-${r.id}`,
                })),
              ]}
              testID={`${testID}-resource-of`}
            />
          </View>
        ) : null}
        <View style={{ gap: 6 }}>
          <Text variant="label">{tr('Price')}</Text>
          <ChoiceChips
            wrap
            flush
            label={tr('Price')}
            value={paid ? 'paid' : 'free'}
            onChange={(v) => setPaid(v === 'paid')}
            options={[
              { value: 'free', label: tr('Free'), testID: `${testID}-free` },
              { value: 'paid', label: tr('Paid'), testID: `${testID}-paid` },
            ]}
            testID={`${testID}-pricing`}
          />
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
                  placeholder={host.currency ?? 'EGP'}
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
          <ChoiceChips
            wrap
            flush
            label={tr('Booked by the')}
            value={unit}
            onChange={(u) => {
              setUnit(u);
              if (u === 'each') {
                setProviders(null);
                // A shop sells more than one at a time: ten an order unless set otherwise.
                if (maxQuantity === 1) setMaxQuantity(10);
              }
            }}
            options={[
              { value: 'minutes' as const, label: tr('Minutes'), testID: `${testID}-by-minutes` },
              { value: 'days' as const, label: tr('Days'), testID: `${testID}-days` },
              { value: 'each' as const, label: tr('The piece'), testID: `${testID}-each` },
            ]}
            testID={`${testID}-unit`}
          />
          {unit === 'minutes' ? (
            <ChoiceChips
              wrap
              flush
              label={tr('How long')}
              value={String(minutes)}
              onChange={(m) => setMinutes(SLOT_MINUTES.find((x) => String(x) === m) ?? null)}
              options={SLOT_MINUTES.map((m) => ({ value: String(m), label: tr('{m} min', { m }) }))}
              testID={`${testID}-minutes`}
            />
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
        {unit === 'each' ? (
          <View style={{ gap: 6 }}>
            <SwitchRow
              label={tr('Count how many are left')}
              detail={tr(
                'Each order takes from it and a cancelled one puts its back; at none, it reads sold out.',
              )}
              value={counted}
              onChange={setCounted}
              testID={`${testID}-counted`}
            />
            {counted ? (
              <TextField
                placeholder="20"
                value={left}
                onChangeText={(v) => setLeft(v.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
                inputMode="numeric"
                accessibilityLabel={tr('How many are left')}
                testID={`${testID}-stock`}
              />
            ) : null}
          </View>
        ) : null}
        {unit === 'each' ? (
          <ItemOptionsEditor options={options} paid={paid} onChange={setOptions} testID={testID} />
        ) : null}
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
            <ChoiceChips
              multiple
              wrap
              flush
              label={tr('Who does it')}
              value={providers?.length ? providers : [ANYONE]}
              onChange={(next) => {
                // Anyone just chosen clears the names; a name chosen takes Anyone off.
                if (next.includes(ANYONE) && providers?.length) setProviders(null);
                else {
                  const named = next.filter((id) => id !== ANYONE);
                  setProviders(named.length ? named : null);
                }
              }}
              options={[
                {
                  value: ANYONE,
                  label: tr('Anyone on the team'),
                  testID: `${testID}-provider-anyone`,
                },
                ...host.team.map((m) => ({
                  value: m.id,
                  label: m.name,
                  testID: `${testID}-provider-${m.id}`,
                })),
              ]}
              testID={`${testID}-providers`}
            />
            <Text variant="caption" color="textTertiary">
              {tr(
                'Decided when you confirm a booking: whoever is free with the fewest that day. Customers never see who.',
              )}
            </Text>
          </View>
        ) : null}
        <AddressField slug={slug} name={name} onChange={setSlug} testID={testID} />
        <SwitchRow
          label={tr('They write what it’s for')}
          value={askTopic}
          onChange={setAskTopic}
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
