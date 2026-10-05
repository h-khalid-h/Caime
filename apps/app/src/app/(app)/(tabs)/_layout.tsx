import { Slot } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { TabBar } from '@/features/shell/TabBar';
import { YouSheet } from '@/features/shell/YouButton';
import { useTheme } from '@/theme/theme';
import { useLayout } from '@/ui/layout';

export default function TabsLayout() {
  const { desktop } = useLayout();
  const t = useTheme();
  // On desktop the rail is the navigation, so the tab routes render straight into the detail pane.
  if (desktop) return <Slot />;
  // You (your picture at the top of each place) isn't a tab: its sheet is one for all five, and
  // All settings (/you) opens over the place you were in, so Back comes back to it.
  return (
    <>
      <Tabs
        tabBar={(props) => <TabBar {...props} />}
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
