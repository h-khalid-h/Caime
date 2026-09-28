import '@/lib/polyfills';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { Nunito_600SemiBold } from '@expo-google-fonts/nunito/600SemiBold';
import { Nunito_700Bold } from '@expo-google-fonts/nunito/700Bold';
import { Nunito_800ExtraBold } from '@expo-google-fonts/nunito/800ExtraBold';
import { Nunito_900Black } from '@expo-google-fonts/nunito/900Black';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useFonts } from 'expo-font';
import { SplashScreen, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PERSIST_MAX_AGE, persister, queryClient, saveCacheWhenLeft } from '@/api/queryClient';
import { HeartMark } from '@/brand/Wordmark';
import { ScreenError } from '@/features/common/ScreenError';
import { keepAppForOffline } from '@/lib/offline';
import { useOutbox } from '@/state/outbox';
import { useRememberLinks } from '@/state/pendingLink';
import { useSession } from '@/state/session';
import { useTaskOutbox } from '@/state/taskOutbox';
import { ThemeProvider, useTheme } from '@/theme/theme';
import { ToastHost } from '@/ui/Toast';

void SplashScreen.preventAutoHideAsync().catch(() => {});

export const ErrorBoundary = ScreenError;

/**
 * Bump when a cached shape changes incompatibly (a view gains a field the screens rely on); old
 * caches are dropped, not misread. 2: connections say who's merged into whom (PRD §51). 3: a
 * conversation lists its topics, and a one-to-one says whether it's between connections (§58).
 * 4: a person's page says who they are to you (§67), and a conversation's details and a space's
 * page say what's coming up (§41). 5: you have a date of birth and a country (a currency from it),
 * not a birth year and a region; an organization has a country, a currency and a founding year.
 */
const CACHE_VERSION = '5';

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Nunito_600SemiBold,
    Nunito_700Bold,
    Nunito_800ExtraBold,
    Nunito_900Black,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  const status = useSession((s) => s.status);
  useRememberLinks(status);
  // A slow font never holds the app hostage: after 2.5 s we render with the system font.
  const [fontTimeout, setFontTimeout] = useState(false);
  useEffect(() => {
    void useSession.getState().boot();
    keepAppForOffline();
    const timer = setTimeout(() => setFontTimeout(true), 2500);
    return () => clearTimeout(timer);
  }, []);
  const ready = (fontsLoaded || Boolean(fontError) || fontTimeout) && status !== 'booting';
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

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
            {ready ? <RootStack signedIn={status === 'signedIn'} /> : <Boot />}
            <ToastHost />
            <ThemedStatusBar />
          </ThemeProvider>
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function RootStack({ signedIn }: { signedIn: boolean }) {
  const t = useTheme();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.c.canvas } }}>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
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
      accessibilityLabel="Caishy is starting"
    >
      <HeartMark size={44} />
    </View>
  );
}

function ThemedStatusBar() {
  const t = useTheme();
  return <StatusBar style={t.scheme === 'dark' ? 'light' : 'dark'} />;
}
