/**
 * A link that opened Caime before its person was signed in (someone's @handle, an organization,
 * a conversation), kept through sign-in, sign-up and onboarding so they land where it pointed.
 */
import * as Linking from 'expo-linking';
import { useEffect } from 'react';
import { create } from 'zustand';
import { isWeb } from '@/lib/config';
import { appPath, deepLinkPath } from '@/lib/paths';

const KEY = 'caime.pendingLink';

function stored(): string | null {
  if (!isWeb) return null;
  try {
    return appPath(sessionStorage.getItem(KEY));
  } catch {
    return null;
  }
}

/** Screens read it reactively: Welcome renders before the root layout has looked at the URL. */
export const usePendingLink = create<{ link: string | null }>(() => ({ link: stored() }));

function keep(link: string | null) {
  usePendingLink.setState({ link });
  if (!isWeb) return;
  // A reload during sign-up keeps it; a new tab starts clean.
  try {
    if (link) sessionStorage.setItem(KEY, link);
    else sessionStorage.removeItem(KEY);
  } catch {}
}

export function rememberLink(path: string | null): void {
  const safe = appPath(path);
  if (safe) keep(safe);
}

export function peekLink(): string | null {
  return usePendingLink.getState().link;
}

/** The link to open now that someone is in, once: it is forgotten as it is taken. */
export function takeLink(): string | null {
  const link = peekLink();
  if (link) keep(null);
  return link;
}

/**
 * The page the web app opened on, read before the router moves a signed-out visitor away. A
 * public page served without the app (R44) carries itself into the way in as `?link=`, so
 * whoever it was about is still where sign-up leads, and still who the invite is counted for.
 */
function openedLink(): string | null {
  if (!isWeb || typeof window === 'undefined') return null;
  const { pathname, search } = window.location;
  const carried = new URLSearchParams(search).get('link');
  if (carried && /^\/(sign-up|sign-in|welcome)\/?$/.test(pathname)) return carried;
  return `${pathname}${search}`;
}
let opened: string | null = openedLink();
let openedSeen = false;

/** From the root layout: when the session turns out to be signed out, keep the link that opened it. */
export function useRememberLinks(status: 'booting' | 'signedOut' | 'signedIn'): void {
  useEffect(() => {
    if (status === 'booting') return;
    if (!openedSeen) {
      openedSeen = true;
      if (status === 'signedOut') {
        if (isWeb) rememberLink(opened);
        else void Linking.getInitialURL().then((url) => url && rememberLink(deepLinkPath(url)));
      }
      opened = null;
    }
    if (status !== 'signedOut' || isWeb) return;
    // A link tapped while the app is open but nobody is signed in.
    const sub = Linking.addEventListener('url', ({ url }) => rememberLink(deepLinkPath(url)));
    return () => sub.remove();
  }, [status]);
}
