/**
 * Settings · Security's word on one's age (M16 B7): never checked, or what the last check found,
 * how and until when, with the way to check (again); and where the web's check comes back to
 * (`?age=`), said once and taken off the address. Nothing shows where this Caime checks no ages
 * and none was ever checked.
 */
import { ageReturnOf } from '@caime/core/age-assurance';
import { formatDayHeading } from '@caime/core/format';
import { tr } from '@caime/core/i18n';
import { router, useLocalSearchParams } from 'expo-router';
import UserCheck from 'lucide-react-native/icons/user-check';
import { useEffect } from 'react';
import { Group } from '@/features/settings/SettingsPage';
import { useNow, useUserClock } from '@/lib/time';
import { useSession } from '@/state/session';
import { ListRow } from '@/ui/ListRow';
import { askAgeCheck } from './ageCheck';
import { sayAgeReturn } from './said';

export function AgeStatus() {
  const me = useSession((s) => s.user);
  const now = useNow();
  const { timeZone, locale } = useUserClock();
  const { age } = useLocalSearchParams<{ age?: string }>();
  useEffect(() => {
    const state = ageReturnOf(age);
    if (!state) return;
    if (state !== 'cancel') sayAgeReturn(state);
    router.setParams({ age: undefined });
  }, [age]);
  if (!me || (!me.ageCheckOffered && !me.ageCheck)) return null;
  const c = me.ageCheck;
  const status = !c
    ? tr('Not checked')
    : c.outcome === 'adult'
      ? c.method === 'document'
        ? tr('18 or over, by a document')
        : tr('18 or over, by an estimate')
      : tr('Under 18 until {date}', {
          date: formatDayHeading(c.holdsUntil ?? c.checkedAt, now, timeZone, locale),
        });
  return (
    <Group
      title={tr('Your age')}
      footer={tr(
        'Checked when you ask, or when Caime asks before something that needs it. Caime never gets the picture.',
      )}
    >
      <ListRow
        icon={UserCheck}
        title={tr('Age check')}
        subtitle={status}
        onPress={me.ageCheckOffered ? () => askAgeCheck('self') : undefined}
        testID="age-status"
      />
    </Group>
  );
}
