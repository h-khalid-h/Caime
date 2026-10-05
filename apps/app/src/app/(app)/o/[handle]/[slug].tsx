import { Redirect, useLocalSearchParams } from 'expo-router';

/**
 * One of an organization's items or collections (R61, `/o/<handle>/<slug>`): its page, with the
 * item's sheet over it (`?item`). A redirect, never the screen itself: a screen two routes
 * import moves into the startup chunk. `?book` and `?order` carry on.
 */
export default function OrganizationItem() {
  const { handle, slug, book, order, pay } = useLocalSearchParams<{
    handle: string;
    slug: string;
    book?: string;
    order?: string;
    pay?: string;
  }>();
  const more =
    book !== undefined
      ? { book: '1' }
      : order !== undefined
        ? { order: '1' }
        : pay !== undefined
          ? { pay: '1' }
          : {};
  return <Redirect href={{ pathname: '/o/[handle]', params: { handle, item: slug, ...more } }} />;
}
