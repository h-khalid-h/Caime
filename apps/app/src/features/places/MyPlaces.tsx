/**
 * Settings · Places (R92): where you are (home, work), each shown only to whom you choose, and
 * used by copying it into a card's "Where" or an order's delivery address.
 */
import { tr } from '@caime/core/i18n';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { Group, SettingsPage } from '@/features/settings/SettingsPage';
import { patchCache } from '@/state/cache';
import { lazyPart } from '@/ui/Lazy';
import { SkeletonRows } from '@/ui/Skeleton';

// One chunk with the other places parts (`parts.ts`), never the app's start.
const PlacesSetup = lazyPart(() => import('./parts').then((m) => m.PlacesSetup));

export function MyPlaces() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: qk.myPlaces, queryFn: endpoints.myPlaces });
  return (
    <SettingsPage title={tr('Your places')}>
      <Group
        footer={tr(
          'Each is shown to whom you choose, nobody until you do. When you pick one for a meeting, a delivery or something you offer, its words go with that card, and the card keeps them if the place changes.',
        )}
      >
        {q.data ? (
          <PlacesSetup
            owner={{ kind: 'person' }}
            places={q.data.places}
            save={async (places) => {
              const saved = await endpoints.saveMyPlaces(places);
              patchCache(qc, qk.myPlaces, () => saved);
              void qc.invalidateQueries({ queryKey: qk.myPlaces });
            }}
          />
        ) : (
          <SkeletonRows />
        )}
      </Group>
    </SettingsPage>
  );
}
