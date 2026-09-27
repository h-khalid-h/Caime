/**
 * How Caishy thinks someone may be known (PRD §12), on a person's page and at the top of People.
 * The cards load only when there's one to show: most of the time there isn't.
 */
import type { ConnectionView } from '@caishy/core/api';
import { useRelationshipOffers } from '@/api/hooks';
import { lazyPart } from '@/ui/Lazy';

const Card = lazyPart(() => import('./RelationshipOffers').then((m) => m.PersonOffer));
const Cards = lazyPart(() => import('./RelationshipOffers').then((m) => m.RelationshipOffers));

export function PersonOffer({ person }: { person: { id: string; displayName: string } }) {
  const q = useRelationshipOffers(person.id);
  if (!q.data?.suggestions.length) return null;
  return <Card person={person} />;
}

export function RelationshipOffers({ all }: { all: ConnectionView[] }) {
  const q = useRelationshipOffers();
  if (!q.data?.suggestions.length) return null;
  return <Cards all={all} />;
}
