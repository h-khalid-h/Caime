import '@/lib/polyfills';
import { tr } from '@caime/core/i18n';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useFonts } from 'expo-font';
import { SplashScreen, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  CACHE_VERSION,
  PERSIST_MAX_AGE,
  persister,
  queryClient,
  saveCacheWhenLeft,
} from '@/api/queryClient';
import { IconMark } from '@/brand/Wordmark';
import { CallLayer } from '@/features/calls/CallLayer';
import { ScreenError } from '@/features/common/ScreenError';
import { ScreenToasts } from '@/features/shell/ScreenToasts';
import { isWeb } from '@/lib/config';
import { loadLanguage, useLanguage } from '@/lib/i18n';
import { keepAppForOffline } from '@/lib/offline';
import { handleIn, inviteIn, teamInviteIn } from '@/lib/paths';
import { useOutbox } from '@/state/outbox';
import { useRememberLinks } from '@/state/pendingLink';
import { useSession } from '@/state/session';
import { useTaskOutbox } from '@/state/taskOutbox';
import { ARABIC_FONT_FILES, LATIN_FONT_FILES } from '@/theme/fontFiles';
import { ThemeProvider, useTheme } from '@/theme/theme';
import { Direction } from '@/ui/Direction';

void SplashScreen.preventAutoHideAsync().catch(() => {});

export const ErrorBoundary = ScreenError;

/**
 * Whether this document is someone's public page (R44): the server says which page it wrote
 * (`caime-page`), so a link to a person who can't be found by handle still opens the app and
 * its way in, and only a page that reads stays as it is.
 */
function onPublicPage(): boolean {
  if (typeof document === 'undefined' || typeof window === 'undefined') return false;
  const path = window.location.pathname;
  if (handleIn(path) === null && inviteIn(path) === null && teamInviteIn(path) === null)
    return false;
  const kind = document.querySelector('meta[name="caime-page"]')?.getAttribute('content');
  return (
    kind === 'person' ||
    kind === 'org' ||
    kind === 'item' ||
    kind === 'collection' ||
    kind === 'invite' ||
    kind === 'team-invite'
  );
}

export default function RootLayout() {
  const [latinLoaded, fontError] = useFonts(LATIN_FONT_FILES);
  // The Arabic faces load beside them (R73): an Arabic reader's first frame waits for them,
  // anyone else's doesn't (review 2026-10-09: every splash waited for the seven).
  const [arabicLoaded, arabicError] = useFonts(ARABIC_FONT_FILES);
  const status = useSession((s) => s.status);
  // A meeting's guest (R84) is signed in for that meeting alone: none of the app is theirs.
  const guest = useSession((s) => s.status === 'signedIn' && s.user?.kind === 'provisional');
  useRememberLinks(status);
  // A slow font never holds the app hostage: after 2.5 s we render with the system font.
  const [fontTimeout, setFontTimeout] = useState(false);
  // The interface language (R54): its catalog is loaded before the first screen, and a change
  // remounts the app so every string runs again.
  const language = useLanguage((s) => s.language);
  const generation = useLanguage((s) => s.generation);
  useEffect(() => {
    void useSession.getState().boot();
    void loadLanguage();
    keepAppForOffline();
    const timer = setTimeout(() => setFontTimeout(true), 2500);
    return () => clearTimeout(timer);
  }, []);
  const fontsLoaded = latinLoaded && (language !== 'ar' || arabicLoaded || Boolean(arabicError));
  const ready =
    (fontsLoaded || Boolean(fontError) || fontTimeout) && status !== 'booting' && language !== null;
  // A visitor on someone's public page (R44): the page they were sent stays, readable, with its
  // own ways in; the app mounts only once they're signed in. Mounting anything here would hide
  // the page (`#root:empty` shows it) and send them to Welcome.
  const visitor = isWeb && status !== 'signedIn' && onPublicPage();
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  // The router's own wrapper is in the root whatever this returns, so the page is shown by a
  // mark on the document, not by the root being empty.
  useEffect(() => {
    if (!isWeb || typeof document === 'undefined') return;
    document.documentElement.toggleAttribute('data-visitor', visitor);
  }, [visitor]);
  if (visitor) return null;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{ persister, maxAge: PERSIST_MAX_AGE, buster: CACHE_VERSION }}
          onSuccess={() => {
            saveCacheWhenLeft(CACHE_VERSION);
            // Show the restored cache at once, then refresh whatever is on screen.
            void queryClient.invalidateQueries();
            useOutbox.getState().flush();
            useTaskOutbox.getState().flush();
          }}
        >
          <ThemeProvider>
            <Direction>
              {ready ? (
                <RootStack key={generation} signedIn={status === 'signedIn'} guest={guest} />
              ) : (
                <Boot />
              )}
              {/* The call over everything, for whoever is signed in, a meeting's guest too. */}
              {ready && status === 'signedIn' ? <CallLayer /> : null}
              <ScreenToasts />
            </Direction>
            <ThemedStatusBar />
          </ThemeProvider>
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function RootStack({ signedIn, guest }: { signedIn: boolean; guest: boolean }) {
  const t = useTheme();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.c.canvas } }}>
      <Stack.Protected guard={signedIn && !guest}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={guest}>
        <Stack.Screen name="(guest)" />
      </Stack.Protected>
      {/* A guest's link (R84): how they arrive, signed in or not, and then their meeting. */}
      <Stack.Screen name="j/[token]" />
    </Stack>
  );
}

function Boot() {
  const t = useTheme();
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: t.c.canvas,
      }}
      accessibilityRole="progressbar"
      accessibilityState={{ busy: true }}
      accessibilityLabel={tr('Caime is starting')}
    >
      <IconMark size={64} />
    </View>
  );
}

function ThemedStatusBar() {
  const t = useTheme();
  return <StatusBar style={t.scheme === 'dark' ? 'light' : 'dark'} />;
}
