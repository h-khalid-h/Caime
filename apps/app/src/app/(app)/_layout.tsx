import { Redirect, router, Slot, Stack, usePathname } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import { BusinessInbox } from '@/features/business/BusinessInbox';
import { CallLayer } from '@/features/calls/CallLayer';
import { ScreenError } from '@/features/common/ScreenError';
import { InboxList } from '@/features/inbox/InboxList';
import { LiveLocationSharer } from '@/features/location/LiveLocationSharer';
import { PeopleList } from '@/features/people/PeopleList';
import { SettingsMenu } from '@/features/settings/SettingsMenu';
import { NavRail } from '@/features/shell/NavRail';
import { useInboxHandle, useSection } from '@/features/shell/sections';
import { KeyboardShortcuts } from '@/features/shell/shortcuts';
import { SpacesList } from '@/features/spaces/SpacesList';
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
