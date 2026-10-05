/**
 * A person's bookings (R58): their hours and what people may book of them, by relationship,
 * in Settings. The same setup an organization uses; the items are theirs to do.
 */
import { tr } from '@caime/core/i18n';
import { useQueryClient } from '@tanstack/react-query';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { useMyBooking } from '@/api/hooks';
import { qk } from '@/api/keys';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { useMe } from '@/state/session';
import { lazyPart } from '@/ui/Lazy';
import { SkeletonRows } from '@/ui/Skeleton';
import { Text } from '@/ui/Text';

const BookingSetup = lazyPart(() => import('./BookingSetup').then((m) => m.BookingSetup));

export function MyBookings() {
  const me = useMe();
  const qc = useQueryClient();
  const q = useMyBooking();
  return (
    <SettingsPage title={tr('Bookings')}>
      <Text variant="body" color="textSecondary" style={{ paddingHorizontal: 4 }}>
        {tr(
          'Set hours and what can be booked in them: a lesson, a consultation, an hour of your time. Each item says who may book it; a public one is on your page. Every booking is an appointment card you confirm, and nothing is paid through Caime.',
        )}
      </Text>
      {q.data ? (
        <View testID="my-bookings">
          <BookingSetup
            host={{ kind: 'person', name: me.displayName, currency: me.currency }}
            hours={q.data.booking}
            items={q.data.items}
            ordering={q.data.ordering}
            save={async (booking, items, ordering) => {
              await endpoints.setMyBooking(booking, items, ordering);
              qc.setQueryData(qk.myBooking, { booking, items, ordering });
              void qc.invalidateQueries({ queryKey: qk.me });
              void qc.invalidateQueries({ queryKey: qk.allSlots });
            }}
            testID="my-booking"
          />
        </View>
      ) : (
        <SkeletonRows count={3} />
      )}
    </SettingsPage>
  );
}
