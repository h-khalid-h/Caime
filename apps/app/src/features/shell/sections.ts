import { useGlobalSearchParams, usePathname } from 'expo-router';

export type Section =
  | 'chats'
  | 'people'
  | 'spaces'
  | 'actions'
  | 'search'
  | 'notifications'
  | 'business'
  | 'you';

/**
 * The organization whose inbox the desktop shell lists: on its inbox, and on a conversation
 * opened from it (`/c/<id>?inbox=<handle>`), so the list stays beside it.
 */
export function inboxHandleOf(pathname: string, inbox?: string): string | null {
  const m = pathname.match(/^\/o\/([^/]+)\/inbox$/);
  if (m?.[1]) return decodeURIComponent(m[1]);
  return pathname.startsWith('/c/') && inbox ? inbox : null;
}

export function sectionOf(pathname: string, inbox?: string): Section {
  if (inboxHandleOf(pathname, inbox)) return 'business';
  // Organizations' updates open from Chats; call history from People and from a person's page:
  // the list they came from stays beside them.
  if (
    pathname === '/' ||
    pathname.startsWith('/c/') ||
    pathname === '/new-group' ||
    pathname === '/updates'
  )
    return 'chats';
  if (
    pathname.startsWith('/people') ||
    pathname.startsWith('/p/') ||
    pathname === '/connect' ||
    pathname === '/requests' ||
    pathname === '/calls'
  )
    return 'people';
  if (pathname.startsWith('/spaces') || pathname.startsWith('/s/') || pathname === '/new-space')
    return 'spaces';
  if (pathname.startsWith('/actions')) return 'actions';
  if (pathname.startsWith('/search')) return 'search';
  if (pathname.startsWith('/notifications')) return 'notifications';
  return 'you';
}

function useInboxParam(): string | undefined {
  const { inbox } = useGlobalSearchParams<{ inbox?: string }>();
  return typeof inbox === 'string' ? inbox : undefined;
}

export function useSection(): Section {
  return sectionOf(usePathname(), useInboxParam());
}

export function useInboxHandle(): string | null {
  return inboxHandleOf(usePathname(), useInboxParam());
}
