/**
 * An organization's bookings (R51, R58), for its owner and admins: its hours and catalog,
 * through the one setup every host uses (features/booking/BookingSetup). Items may name who on
 * the team does them and at which of its branches.
 */
import type { OrgView } from '@caime/core/api';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { branchName } from '@/features/booking/branchName';
import { lazyPart } from '@/ui/Lazy';

// Shared with Settings · Bookings: loaded when shown, so it sits in neither route's chunk nor
// the startup one.
const BookingSetup = lazyPart(() =>
  import('@/features/booking/BookingSetup').then((m) => m.BookingSetup),
);

export function OrgBooking({ org }: { org: OrgView }) {
  const qc = useQueryClient();
  // Its forms (M16 H5), the setup's own list: one may follow an item once it's booked.
  const forms = useQuery({
    queryKey: qk.orgForms(org.id),
    queryFn: () => endpoints.orgForms(org.id),
  }).data?.forms;
  return (
    <BookingSetup
      host={{
        kind: 'org',
        name: org.name,
        currency: org.currency,
        timeZone: org.timeZone,
        workweek: org.workweek,
        weekStart: org.weekStart,
        payKinds: org.payKinds,
        team: (org.members ?? []).map((m) => ({ id: m.userId, name: m.person.displayName })),
        ref: { kind: 'org', id: org.id },
        // Where its items may be done (R92): its places customers may see.
        branches: (org.places ?? [])
          .filter((p) => p.orgAudience !== 'team')
          .map((p) => ({ id: p.id, name: branchName(p) })),
        forms: (forms ?? []).map((f) => ({ id: f.id, name: f.name })),
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
