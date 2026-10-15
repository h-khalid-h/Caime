/**
 * A branch of an organization's (R92): the days and hours it's booked on (its own, each day's
 * range its own if need be, else the organization's) and the people of the team who work there
 * (else whoever does the item), in the organization's zone, on its grid.
 */
import type { BookingDay, BookingHours, PlaceHours } from '@caime/core/booking';
import { tr } from '@caime/core/i18n';
import { useState } from 'react';
import { View } from 'react-native';
import { Button } from '@/ui/Button';
import { ChoiceChips } from '@/ui/Chip';
import { Sheet } from '@/ui/Sheet';
import { SwitchRow } from '@/ui/SwitchRow';
import { Text } from '@/ui/Text';
import { WeekHours, weekHoursError } from './WeekHours';

/** Everyone on the team: the staff choice that names nobody (an id is a uuid). */
const ANYONE = 'anyone';

export function BranchHours({
  branch,
  hours,
  weekStart,
  team,
  onClose,
  onSave,
  testID,
}: {
  branch: { id: string; name: string };
  hours: BookingHours;
  weekStart: number;
  /** The team, to say who works here. */
  team: Array<{ id: string; name: string }>;
  onClose: () => void;
  /** Its own days and people, or null for the organization's and anyone; throws a message to show. */
  onSave: (own: Omit<PlaceHours, 'placeId'> | null) => Promise<void>;
  testID: string;
}) {
  const kept = hours.placeHours?.find((p) => p.placeId === branch.id) ?? null;
  const [ownDays, setOwnDays] = useState(Boolean(kept?.days.length));
  const [days, setDays] = useState<BookingDay[]>(
    kept?.days.length ? kept.days : hours.days.map((d) => ({ ...d })),
  );
  const [staff, setStaff] = useState<string[] | null>(kept?.staff?.length ? kept.staff : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async (next: Omit<PlaceHours, 'placeId'> | null) => {
    setBusy(true);
    setError(null);
    try {
      await onSave(next);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const submit = () => {
    const wrong = ownDays ? weekHoursError(days) : null;
    if (wrong) return setError(wrong);
    if (!ownDays && !staff?.length) return save(null);
    return save({ days: ownDays ? days : [], staff: staff?.length ? staff : null });
  };
  return (
    <Sheet
      open
      onClose={onClose}
      title={tr('Hours at {place}', { place: branch.name })}
      subtitle={tr('In {timeZone}. Its items are booked on these days.', {
        timeZone: hours.timeZone,
      })}
      footer={
        <View style={{ gap: 8 }}>
          <Button
            label={tr('Save')}
            block
            size="lg"
            onPress={() => void submit()}
            loading={busy}
            testID={`${testID}-save`}
          />
          {kept ? (
            <Button
              label={tr('Same as the organization’s')}
              variant="ghost"
              block
              disabled={busy}
              onPress={() => void save(null)}
              testID={`${testID}-same`}
            />
          ) : null}
        </View>
      }
    >
      <View style={{ gap: 16 }}>
        <SwitchRow
          label={tr('Its own days and hours')}
          detail={tr('Off: it opens when the organization does.')}
          value={ownDays}
          onChange={setOwnDays}
          testID={`${testID}-own`}
        />
        {ownDays ? (
          <WeekHours days={days} onChange={setDays} weekStart={weekStart} testID={testID} />
        ) : null}
        {team.length ? (
          <View style={{ gap: 6 }}>
            <Text variant="label">{tr('Who works here')}</Text>
            <ChoiceChips
              multiple
              wrap
              flush
              label={tr('Who works here')}
              value={staff?.length ? staff : [ANYONE]}
              onChange={(next) => {
                // Anyone just chosen clears the names; a name chosen takes Anyone off.
                if (next.includes(ANYONE) && staff?.length) setStaff(null);
                else {
                  const named = next.filter((id) => id !== ANYONE);
                  setStaff(named.length ? named : null);
                }
              }}
              options={[
                {
                  value: ANYONE,
                  label: tr('Anyone on the team'),
                  testID: `${testID}-staff-anyone`,
                },
                ...team.map((m) => ({
                  value: m.id,
                  label: m.name,
                  testID: `${testID}-staff-${m.id}`,
                })),
              ]}
              testID={`${testID}-staff`}
            />
            <Text variant="caption" color="textTertiary">
              {tr(
                'Its items are done by these people unless an item names its own. A booking goes to whoever of them is free.',
              )}
            </Text>
          </View>
        ) : null}
        {error ? (
          <Text variant="caption" color="danger">
            {error}
          </Text>
        ) : null}
      </View>
    </Sheet>
  );
}
