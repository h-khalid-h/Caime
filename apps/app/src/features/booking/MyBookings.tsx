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
    <SettingsPage title={tr('What you offer')}>
      <Text variant="body" color="textSecondary" style={{ paddingHorizontal: 4 }}>
        {tr(
          'What people may book, order or pay you for: a lesson, a consultation, a cake, an hour of your time. Each thing says who sees it; a public one has a page of its own. Every booking, order and payment is a card you confirm, and nothing is paid through Caime.',
        )}
      </Text>
      {q.data ? (
        <View testID="my-bookings">
          <BookingSetup
            host={{ kind: 'person', name: me.displayName, currency: me.currency }}
            offer={q.data}
            save={async (next) => {
              const saved = await endpoints.setMyBooking(next);
              qc.setQueryData(qk.myBooking, saved);
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
