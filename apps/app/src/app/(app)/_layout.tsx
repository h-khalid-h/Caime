import { Redirect, Slot, Stack, usePathname } from 'expo-router';
import { View } from 'react-native';
import { ScreenError } from '@/features/common/ScreenError';
import { InboxList } from '@/features/inbox/InboxList';
import { PeopleList } from '@/features/people/PeopleList';
import { SettingsMenu } from '@/features/settings/SettingsMenu';
import { NavRail } from '@/features/shell/NavRail';
import { useSection } from '@/features/shell/sections';
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
  if (!user) return null;
  if (!user.onboarded && pathname !== '/onboarding') return <Redirect href="/onboarding" />;
  if (desktop && pathname !== '/onboarding') return <DesktopShell />;
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.c.canvas } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
    </Stack>
  );
}

function DesktopShell() {
  const t = useTheme();
  const section = useSection();
  const pane =
    section === 'chats' ? (
      <InboxList pane />
    ) : section === 'people' ? (
      <PeopleList pane />
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
