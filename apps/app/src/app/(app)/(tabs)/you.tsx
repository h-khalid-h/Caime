import { Redirect } from 'expo-router';
import { SettingsMenu } from '@/features/settings/SettingsMenu';
import { useLayout } from '@/ui/layout';

export default function You() {
  const { desktop } = useLayout();
  // On desktop the menu is the list pane; open the first page beside it.
  if (desktop) return <Redirect href="/settings/profile" />;
  return <SettingsMenu />;
}
