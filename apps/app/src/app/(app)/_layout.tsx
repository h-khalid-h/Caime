import { Redirect, router, Slot, Stack, usePathname } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import { CallLayer } from '@/features/calls/CallLayer';
import { ScreenError } from '@/features/common/ScreenError';
import { InboxList } from '@/features/inbox/InboxList';
import { LiveLocationSharer } from '@/features/location/LiveLocationSharer';
import { ReportSheet } from '@/features/safety/ReportSheet';
import { NavRail } from '@/features/shell/NavRail';
import { BusinessInbox, PeopleList, SettingsMenu, SpacesList } from '@/features/shell/panes';
import { useInboxHandle, useSection } from '@/features/shell/sections';
import { KeyboardShortcuts } from '@/features/shell/shortcuts';
import { takeLink } from '@/state/pendingLink';
import { useSession } from '@/state/session';
import { useTheme } from '@/theme/theme';
import { useLayout } from '@/ui/layout';

export const ErrorBoundary = ScreenError;

/** Signed in. Phones get a stack over bottom tabs; desktops get rail, list and detail side by side. */
export default function AppLayout() {
  const user = useSession((s) => s.user);
  const pathname = usePathname();
  const { desktop } = useLayout();
  const t = useTheme();
  const onboarded = Boolean(user?.onboarded);
  // Signed in through a link (someone's @handle): go where it pointed. Onboarding takes it itself.
  useEffect(() => {
    if (!onboarded) return;
    const link = takeLink();
    if (link) setTimeout(() => router.push(link), 0);
  }, [onboarded]);
  // This browser can read a private message from the first one anyone writes to this person
  // (R18): its keys are made, or found again, as soon as they're signed in here. Loaded after
  // the app is up: nothing on the first screen needs it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: once per person signed in
  useEffect(() => {
    if (!onboarded) return;
    void import('@/features/e2ee/private')
      .then((m) => (m.privateSupported ? m.ensureDevice() : undefined))
      .catch(() => {});
  }, [onboarded, user?.id]);
  // Notifications in this browser (web push): a sign-in where they already said yes gets its
  // pushes too, and a tapped notification moves the open tab to it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: once per person signed in
  useEffect(() => {
    if (!onboarded) return;
    let stop = () => {};
    void import('@/features/push/webPush')
      .then((m) => {
        void m.resumeWebPush();
        stop = m.onOpenFromNotification((path) => router.push(path as never));
      })
      .catch(() => {});
    return () => stop();
  }, [onboarded, user?.id]);
  if (!user) return null;
  if (!user.onboarded && pathname !== '/onboarding') return <Redirect href="/onboarding" />;
  // Onboarding, and an app asking to act for them, have the whole window: nothing else to do there.
  const focused = pathname === '/onboarding' || pathname.startsWith('/oauth/');
  if (desktop && !focused)
    return (
      <>
        <DesktopShell />
        <KeyboardShortcuts />
        <LiveLocationSharer />
        <CallLayer />
        <ReportSheet />
        <ReportSheet />
      </>
    );
  return (
    <>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.c.canvas } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
      </Stack>
      <KeyboardShortcuts />
      <LiveLocationSharer />
      <CallLayer />
      <ReportSheet />
    </>
  );
}

function DesktopShell() {
  const t = useTheme();
  const section = useSection();
  const inboxHandle = useInboxHandle();
  const pane =
    section === 'business' && inboxHandle ? (
      <BusinessInbox pane handle={inboxHandle} key={inboxHandle} />
    ) : section === 'chats' ? (
      <InboxList pane />
    ) : section === 'people' ? (
      <PeopleList pane />
    ) : section === 'spaces' ? (
      <SpacesList pane />
    ) : section === 'you' ? (
      <SettingsMenu pane />
    ) : null;
  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: t.c.canvas }}>
      <NavRail />
      {pane ? (
        <View
          style={{
            width: 380,
            borderRightWidth: 1,
            borderRightColor: t.c.border,
            backgroundColor: t.c.surface,
          }}
        >
          {pane}
        </View>
      ) : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Slot />
      </View>
    </View>
  );
}
