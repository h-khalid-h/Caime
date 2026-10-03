/** How someone shows as being there (profile and the You sheet choose it the same way). */

import { msg, tr, trAll } from '@caime/core/i18n';
import { Choice } from '@/features/settings/SettingsPage';

export type PresenceChoiceValue = 'auto' | 'busy' | 'away' | 'invisible';

export const PRESENCE_OPTIONS: Array<{
  value: PresenceChoiceValue;
  label: string;
  detail?: string;
}> = [
  { value: 'auto', label: msg('Automatic'), detail: msg('Online while you use Caime') },
  { value: 'busy', label: msg('Busy') },
  { value: 'away', label: msg('Away') },
  {
    value: 'invisible',
    label: msg('Invisible'),
    detail: msg('Hides when you’re online and last seen'),
  },
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
      label={tr('Presence')}
      value={value}
      onChange={onChange}
      options={trAll(PRESENCE_OPTIONS)}
    />
  );
}
