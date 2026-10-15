/**
 * An organization's places (R92), for its owner and admins: its headquarters and branches, each
 * shown to anyone on its page, to its customers, or to its team. The one editor people use too.
 */
import type { OrgView } from '@caime/core/api';
import { tr } from '@caime/core/i18n';
import { useQueryClient } from '@tanstack/react-query';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { Group } from '@/features/settings/SettingsPage';
import { lazyPart } from '@/ui/Lazy';

const PlacesSetup = lazyPart(() => import('@/features/places/parts').then((m) => m.PlacesSetup));

export function OrgPlaces({ org }: { org: OrgView }) {
  const qc = useQueryClient();
  return (
    <Group
      title={tr('Places')}
      footer={tr(
        'Where to find you: a public one is on your page with a map, for search engines too; one for your customers shows to people you serve; one for your team stays inside.',
      )}
    >
      <PlacesSetup
        owner={{ kind: 'org' }}
        places={org.places}
        save={async (places) => {
          await endpoints.saveOrgPlaces(org.id, places);
          void qc.invalidateQueries({ queryKey: qk.org(org.handle) });
        }}
      />
    </Group>
  );
}
