/**
 * An organization's bookable hours (R51), for its owner and admins: which days, from when to
 * when, how long a slot is, how soon and how far ahead. From these the open slots are offered
 * to customers (and by the AI agent); an appointment card books one, and the team confirms it.
 */

import type { OrgView } from '@caime/core/api';
import { type BookingHours, describeHours, SLOT_MINUTES } from '@caime/core/booking';
import { msg, tr } from '@caime/core/i18n';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { useUserClock } from '@/lib/time';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { CalendarCheck } from '@/ui/icons';
import { ListRow, SectionTitle } from '@/ui/ListRow';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
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

export function OrgBooking({ org }: { org: OrgView }) {
  const qc = useQueryClient();
  const { timeZone } = useUserClock();
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState<number[]>([]);
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('17:00');
  const [slot, setSlot] = useState<BookingHours['slotMinutes']>(30);
  const [lead, setLead] = useState(120);
  const [horizon, setHorizon] = useState(30);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const edit = () => {
    const b = org.booking;
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
  const save = async (booking: BookingHours | null) => {
    setBusy(true);
    setError(null);
    try {
      await endpoints.setOrgBooking(org.id, booking);
      void qc.invalidateQueries({ queryKey: qk.org(org.handle) });
      setOpen(false);
      toast(booking ? tr('Customers can book from your open slots now') : tr('Bookings are off'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const submit = () => {
    if (!days.length) return setError('Pick at least one day.');
    if (start >= end) return setError('The day has to end after it starts.');
    return save({
      timeZone: org.booking?.timeZone ?? timeZone,
      slotMinutes: slot,
      days: [...days].sort().map((weekday) => ({ weekday, start, end })),
      leadMinutes: lead,
      horizonDays: horizon,
    });
  };

  return (
    <>
      <SectionTitle>{tr('Bookings')}</SectionTitle>
      <ListRow
        icon={CalendarCheck}
        title={org.booking ? describeHours(org.booking) : tr('Bookings are off')}
        subtitle={
          org.booking
            ? tr(
                'Customers, and your AI agent, book from the open slots; your team confirms each one.',
              )
            : tr('Set bookable hours and customers book from the open slots in them.')
        }
        chevron
        onPress={edit}
        testID="org-booking"
      />
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={tr('Bookable hours')}
        subtitle={tr('In {timeZone}. A booking is an appointment card your team confirms.', {
          timeZone: org.booking?.timeZone ?? timeZone,
        })}
        footer={
          <View style={{ gap: 8 }}>
            <Button
              label={tr('Save')}
              block
              size="lg"
              onPress={submit}
              loading={busy}
              testID="org-booking-save"
            />
            {org.booking ? (
              <Button
                label={tr('Turn bookings off')}
                variant="ghost"
                block
                onPress={() => void save(null)}
                testID="org-booking-off"
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
                  testID={`org-booking-day-${i}`}
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
                testID="org-booking-start"
              />
            </View>
            <View style={{ flex: 1 }}>
              <TimeField label={tr('To')} value={end} onChange={setEnd} testID="org-booking-end" />
            </View>
          </View>
          <View style={{ gap: 6 }}>
            <Text variant="label">{tr('Each booking lasts')}</Text>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {SLOT_MINUTES.map((m) => (
                <Chip
                  key={m}
                  label={tr('{m} min', { m })}
                  selected={slot === m}
                  role="radio"
                  onPress={() => setSlot(m)}
                  testID={`org-booking-slot-${m}`}
                />
              ))}
            </View>
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
            <Text variant="bodyStrong" color="danger" testID="org-booking-error">
              {error}
            </Text>
          ) : null}
        </View>
      </Sheet>
    </>
  );
}
