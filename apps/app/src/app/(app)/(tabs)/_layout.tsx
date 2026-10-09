import { Slot } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { YouSheet } from '@/features/shell/YouButton';
import { useTheme } from '@/theme/theme';
import { useLayout } from '@/ui/layout';

const noBar = () => null;

export default function TabsLayout() {
  const { desktop } = useLayout();
  const t = useTheme();
  // On desktop the rail is the navigation, so the tab routes render straight into the detail pane.
  if (desktop) return <Slot />;
  // You (your picture at the top of each place) isn't a tab: its sheet is one for all five, and
  // All settings (/you) opens over the place you were in, so Back comes back to it. The bar of
  // places isn't the tabs' own: it's the signed-in layout's, under whatever is open (TabBar).
  return (
    <>
      <Tabs
        tabBar={noBar}
        screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: t.c.canvas } }}
      >
        <Tabs.Screen name="index" />
        <Tabs.Screen name="chats" />
        <Tabs.Screen name="people" />
        <Tabs.Screen name="spaces" />
        <Tabs.Screen name="actions" />
      </Tabs>
      <YouSheet />
    </>
  );
}
