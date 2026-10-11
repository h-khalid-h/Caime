import { useLocalSearchParams } from 'expo-router';
import { BusinessInbox } from '@/features/shell/panes';

export default function OrganizationInbox() {
  // `?view=bookings` opens on the Bookings view (a bridge from someone's own calendar).
  const { handle, view } = useLocalSearchParams<{ handle: string; view?: string }>();
  return (
    <BusinessInbox
      handle={handle}
      initialView={view === 'bookings' || view === 'orders' ? view : undefined}
      key={`${handle}:${view ?? ''}`}
    />
  );
}
