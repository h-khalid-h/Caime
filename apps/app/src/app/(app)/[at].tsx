import { tr } from '@caime/core/i18n';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { ApiError } from '@/api/client';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { Button } from '@/ui/Button';
import { EmptyState } from '@/ui/EmptyState';
import { IconButton } from '@/ui/IconButton';
import { ArrowLeft, UserPlus } from '@/ui/icons';
import { useLayout } from '@/ui/layout';
import { Screen, TopBar } from '@/ui/Screen';
import { SkeletonRows } from '@/ui/Skeleton';

/**
 * A shared link, /@handle: it opens that person or organization (handles are one namespace).
 * Any other single-segment path lands here too, and says there's nothing there.
 */
export default function HandleLink() {
  const { at = '', book } = useLocalSearchParams<{ at: string; book?: string }>();
  const { desktop } = useLayout();
  const handle = at.startsWith('@') && at.length > 1 ? at.slice(1) : null;
  const q = useQuery({
    queryKey: qk.handle(handle ?? ''),
    queryFn: () => endpoints.openHandle(handle ?? ''),
    enabled: handle !== null,
    retry: (n, e) => !(e instanceof ApiError && e.status < 500) && n < 2,
  });
  const found = q.data;
  useEffect(() => {
    if (!found) return;
    // A Book link (R58) carries on to the page's Book.
    const more = book !== undefined ? { book: '1' } : {};
    if (found.kind === 'org')
      router.replace({ pathname: '/o/[handle]', params: { handle: found.handle, ...more } });
    else router.replace({ pathname: '/p/[id]', params: { id: found.id, ...more } });
  }, [found, book]);

  const missing = handle === null || (q.error instanceof ApiError && q.error.status === 404);
  return (
    <Screen edges={desktop ? [] : ['top', 'bottom']}>
      <TopBar
        left={
          desktop ? undefined : (
            <IconButton
              icon={ArrowLeft}
              label={tr('Back')}
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
            />
          )
        }
        title={handle ? `@${handle}` : tr('Caime')}
      />
      {missing ? (
        <EmptyState
          character="pico"
          expression="curious"
          icon={UserPlus}
          title={
            handle ? tr('No one here goes by @{handle}', { handle }) : tr('There’s nothing here')
          }
          body={
            handle
              ? tr(
                  'Check the spelling, or ask them for their link. Some people choose not to be found by their handle.',
                )
              : tr('The link may be old or mistyped.')
          }
          action={<Button label={tr('Find people')} onPress={() => router.replace('/connect')} />}
        />
      ) : q.isError ? (
        <EmptyState
          title={tr('That link didn’t open')}
          body={(q.error as Error).message}
          action={<Button label={tr('Try again')} onPress={() => void q.refetch()} />}
        />
      ) : (
        <SkeletonRows />
      )}
    </Screen>
  );
}
