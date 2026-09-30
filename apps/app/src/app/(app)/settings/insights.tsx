import { PersonInsights } from '@/features/insights/PersonInsights';
import { SettingsPage } from '@/features/settings/SettingsPage';

/** How your relationships are going (R47): Pro's, from your own one-to-ones, for you only. */
export default function InsightsSettings() {
  return (
    <SettingsPage title="Relationship insights">
      <PersonInsights />
    </SettingsPage>
  );
}
