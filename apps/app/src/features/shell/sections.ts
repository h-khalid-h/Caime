import { usePathname } from 'expo-router';

export type Section = 'chats' | 'people' | 'actions' | 'search' | 'notifications' | 'you';

export function sectionOf(pathname: string): Section {
  if (pathname === '/' || pathname.startsWith('/c/') || pathname === '/new-group') return 'chats';
  if (
    pathname.startsWith('/people') ||
    pathname.startsWith('/p/') ||
    pathname === '/connect' ||
    pathname === '/requests'
  )
    return 'people';
  if (pathname.startsWith('/actions')) return 'actions';
  if (pathname.startsWith('/search')) return 'search';
  if (pathname.startsWith('/notifications')) return 'notifications';
  return 'you';
}

export function useSection(): Section {
  return sectionOf(usePathname());
}
