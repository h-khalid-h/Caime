/**
 * A host's bookings (R51, R58), for whoever sets them: an organization's owner and admins in
 * its setup, a person in Settings. The hours (which days, from when to when, the grid, how soon
 * and how far ahead) and the catalog of what can be booked in them: each item a name, a price
 * or none, minutes or days, how many at once, how many in one booking, who may book it, and,
 * for an organization, who on the team does it. One component for both, so a clinic and a
 * consultant set up the same thing the same way.
 */
import type { BookingHours, BookingItem, BookingUnit } from '@caime/core/booking';
import {
  BOOKING_CAPACITY_MAX,
  BOOKING_DAYS_MAX,
  BOOKING_ITEMS_MAX,
  describeHours,
  SLOT_MINUTES,
} from '@caime/core/booking';
import { formatAmount } from '@caime/core/format';
import { msg, tr, trn } from '@caime/core/i18n';
import type { Sphere } from '@caime/core/taxonomy';
import { useState } from 'react';
import { View } from 'react-native';
import { useUserClock } from '@/lib/time';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { IconButton } from '@/ui/IconButton';
import { CalendarCheck, Minus, Plus, Tag } from '@/ui/icons';
import { ListRow, SectionTitle } from '@/ui/ListRow';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { TimeField } from '@/ui/TimeField';
import { toast } from '@/ui/Toast';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const LEADS: Array<{ value: number; label: string }> = [
  { value: 0, label: msg('Any time') },
  { value: 60, label: '1 hour ahead' },
  { value: 120, label: '2 hours ahead' },
  { value: 1440, label: msg('A day ahead') },
];
const HORIZONS: Array<{ value: number; label: string }> = [
  { value: 7, label: msg('A week') },
  { value: 14, label: '2 weeks' },
  { value: 30, label: msg('A month') },
  { value: 60, label: '2 months' },
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
}

/** "Haircut · 45 min · EGP 200 · Everyone": an item in one line. */
export function itemLine(item: BookingItem, locale: string, host: BookingHostInfo): string {
  return [
    item.unit === 'minutes' ? tr('{m} min', { m: item.minutes ?? 0 }) : tr('Per day'),
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
  hours,
  items,
  save,
  testID = 'booking',
}: {
  host: BookingHostInfo;
  hours: BookingHours | null;
  items: BookingItem[];
  /** Saves both; throws with a message the person can read. */
  save: (hours: BookingHours | null, items: BookingItem[]) => Promise<void>;
  testID?: string;
}) {
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
      await save(next, items);
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
    await save(hours, next);
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
      {items.map((item) => (
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
      {items.length < BOOKING_ITEMS_MAX ? (
        <ListRow
          icon={Plus}
          title={tr('Add something to book')}
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
            })
          }
          testID={`${testID}-add-item`}
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
              {DAYS.map((d, i) => (
                <Chip
                  key={d}
                  label={d}
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
      {editing ? (
        <ItemSheet
          host={host}
          item={editing}
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
    </>
  );
}

function ItemSheet({
  host,
  item,
  isNew,
  onClose,
  onSave,
  onRemove,
  testID,
}: {
  host: BookingHostInfo;
  item: BookingItem;
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
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'save' | 'remove' | null>(null);

  const toggleSphere = (s: Sphere) =>
    setAudience((a) => {
      const list = Array.isArray(a) ? a : [];
      const next = list.includes(s) ? list.filter((x) => x !== s) : [...list, s];
      return next.length ? next : 'connections';
    });
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
        maxQuantity: Math.min(maxQuantity, unit === 'minutes' ? capacity : BOOKING_DAYS_MAX),
        audience,
        providers: host.kind === 'org' && providers?.length ? providers : null,
        askTopic,
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
          ) : (
            <Text variant="caption" color="textTertiary">
              {tr('A stay: one booking takes whole days from the day it starts.')}
            </Text>
          )}
        </View>
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
        <Stepper
          label={
            unit === 'days' ? tr('Days in one booking, up to') : tr('Places in one booking, up to')
          }
          value={maxQuantity}
          min={1}
          max={unit === 'minutes' ? capacity : BOOKING_DAYS_MAX}
          onChange={setMaxQuantity}
          testID={`${testID}-max`}
        />
        <View style={{ gap: 6 }}>
          <Text variant="label">{tr('Who may book it')}</Text>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Chip
              label={tr('Everyone')}
              selected={audience === 'public'}
              role="radio"
              onPress={() => setAudience('public')}
              testID={`${testID}-public`}
            />
            <Chip
              label={host.kind === 'org' ? tr('Customers') : tr('Connections')}
              selected={audience === 'connections'}
              role="radio"
              onPress={() => setAudience('connections')}
            />
            {host.kind === 'person'
              ? PERSON_SPHERES.map((p) => (
                  <Chip
                    key={p.sphere}
                    label={tr(p.label)}
                    selected={Array.isArray(audience) && audience.includes(p.sphere)}
                    onPress={() => toggleSphere(p.sphere)}
                  />
                ))
              : null}
          </View>
          <Text variant="caption" color="textTertiary">
            {audience === 'public'
              ? tr('Listed on your public page with its price; anyone can sign up and book it.')
              : host.kind === 'org'
                ? tr('Anyone who writes to you on Caime.')
                : tr('Only the people you choose see it.')}
          </Text>
        </View>
        {host.kind === 'org' && host.team?.length ? (
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
