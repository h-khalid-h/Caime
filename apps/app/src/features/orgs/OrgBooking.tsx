/**
 * An organization's bookings (R51, R58), for its owner and admins: its hours and catalog,
 * through the one setup every host uses (features/booking/BookingSetup). Items may name who on
 * the team does them.
 */
import type { OrgView } from '@caime/core/api';
import { useQueryClient } from '@tanstack/react-query';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { lazyPart } from '@/ui/Lazy';

// Shared with Settings · Bookings: loaded when shown, so it sits in neither route's chunk nor
// the startup one.
const BookingSetup = lazyPart(() =>
  import('@/features/booking/BookingSetup').then((m) => m.BookingSetup),
);

export function OrgBooking({ org }: { org: OrgView }) {
  const qc = useQueryClient();
  return (
    <BookingSetup
      host={{
        kind: 'org',
        name: org.name,
        currency: org.currency,
        team: (org.members ?? []).map((m) => ({ id: m.userId, name: m.person.displayName })),
        ref: { kind: 'org', id: org.id },
      }}
      offer={{
        booking: org.booking,
        items: org.bookingItems,
        ordering: org.ordering,
        collections: org.collections,
        payments: org.payments,
      }}
      save={async (next) => {
        await endpoints.setOrgBooking(org.id, next);
        void qc.invalidateQueries({ queryKey: qk.org(org.handle) });
        void qc.invalidateQueries({ queryKey: qk.allSlots });
      }}
      testID="org-booking"
    />
  );
}
