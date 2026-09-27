/**
 * Possible duplicates (PRD §51). The card in People and the section on a person's page load only
 * when there's one to show: most people never have two accounts of anyone.
 */
import type { ConnectionView } from '@caishy/core/api';
import { lazy, Suspense } from 'react';
import { useConnections, useDuplicates } from '@/api/hooks';

const Offers = lazy(() => import('./SamePerson').then((m) => ({ default: m.DuplicateOffers })));
const Accounts = lazy(() => import('./SamePerson').then((m) => ({ default: m.OtherAccounts })));

/** At the top of People: who may be the same person, to merge or keep apart. */
export function DuplicateOffers({ all }: { all: ConnectionView[] }) {
  const q = useDuplicates();
  if (!q.data?.suggestions.length) return null;
  return (
    <Suspense fallback={null}>
      <Offers all={all} />
    </Suspense>
  );
}

/** On someone's page: the other accounts they are in People, or the one they show under. */
export function OtherAccounts({ personId, name }: { personId: string; name: string }) {
  const q = useConnections();
  const mine = q.data?.connections.find((c) => c.person.id === personId);
  if (!mine || (!mine.mergedInto && !mine.also.length)) return null;
  return (
    <Suspense fallback={null}>
      <Accounts personId={personId} name={name} />
    </Suspense>
  );
}
