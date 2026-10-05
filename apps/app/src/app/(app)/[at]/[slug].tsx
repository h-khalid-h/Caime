import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { ApiError } from '@/api/client';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { Screen } from '@/ui/Screen';
import { SkeletonRows } from '@/ui/Skeleton';

/**
 * One of someone's items or collections (R61, `/@<handle>/<slug>`): opened on their page, as
 * `/@handle` opens it, with the item's sheet; a handle nobody has goes to `/@handle`, which says
 * so. `?book` and `?order` carry on.
 */
export default function HandleItemLink() {
  const {
    at = '',
    slug = '',
    book,
    order,
  } = useLocalSearchParams<{ at: string; slug: string; book?: string; order?: string }>();
  const handle = at.startsWith('@') && at.length > 1 ? at.slice(1) : null;
  const q = useQuery({
    queryKey: qk.handle(handle ?? ''),
    queryFn: () => endpoints.openHandle(handle ?? ''),
    enabled: handle !== null,
    retry: (n, e) => !(e instanceof ApiError && e.status < 500) && n < 2,
  });
  const found = q.data;
  useEffect(() => {
    const more = book !== undefined ? { book: '1' } : order !== undefined ? { order: '1' } : {};
    if (q.isError || handle === null) {
      router.replace({ pathname: '/[at]', params: { at } });
      return;
    }
    if (!found) return;
    if (found.kind === 'org')
      router.replace({
        pathname: '/o/[handle]',
        params: { handle: found.handle, item: slug, ...more },
      });
    else router.replace({ pathname: '/p/[id]', params: { id: found.id, item: slug, ...more } });
  }, [found, q.isError, handle, at, slug, book, order]);
  return (
    <Screen>
      <SkeletonRows />
    </Screen>
  );
}
