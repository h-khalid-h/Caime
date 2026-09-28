/** How someone shows as being there (profile and the You sheet choose it the same way). */
import { Choice } from '@/features/settings/SettingsPage';

export type PresenceChoiceValue = 'auto' | 'busy' | 'away' | 'invisible';

export const PRESENCE_OPTIONS: Array<{
  value: PresenceChoiceValue;
  label: string;
  detail?: string;
}> = [
  { value: 'auto', label: 'Automatic', detail: 'Online while you use Caime' },
  { value: 'busy', label: 'Busy' },
  { value: 'away', label: 'Away' },
  { value: 'invisible', label: 'Invisible', detail: 'Hides when you’re online and last seen' },
];

export function PresenceChoice({
  value,
  onChange,
}: {
  value: PresenceChoiceValue;
  onChange: (v: PresenceChoiceValue) => void;
}) {
  return (
    <Choice<PresenceChoiceValue>
      label="Presence"
      value={value}
      onChange={onChange}
      options={PRESENCE_OPTIONS}
    />
  );
}
