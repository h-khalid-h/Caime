import { Redirect } from 'expo-router';

/**
 * `/settings` (and `/settings/`) is You: its menu on a phone, its first page beside the menu on a
 * desktop (`/you` decides), never a page that isn't there.
 */
export default function SettingsIndex() {
  return <Redirect href="/you" />;
}
