/**
 * Whether an organization's customers may call it (M16 H8a), for its owner and admins: on, a
 * customer calls from their conversation with it and the call rings whoever of the team is in
 * that conversation; the first to answer takes it, and the customer sees the organization.
 */
import type { OrgView } from '@caime/core/api';
import { tr } from '@caime/core/i18n';
import { useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { useTheme } from '@/theme/theme';
import { SectionTitle } from '@/ui/ListRow';
import { SwitchRow } from '@/ui/SwitchRow';
import { toast } from '@/ui/Toast';

export function OrgCalls({ org, refresh }: { org: OrgView; refresh: (o: OrgView) => void }) {
  const t = useTheme();
  const [saving, setSaving] = useState(false);
  // Only whoever runs it reads the setting.
  if (org.callsFrom === null) return null;
  const set = async (on: boolean) => {
    setSaving(true);
    try {
      refresh((await endpoints.updateOrg(org.id, { callsFrom: on ? 'customers' : 'nobody' })).org);
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    } finally {
      setSaving(false);
    }
  };
  return (
    <>
      <SectionTitle>{tr('Calls')}</SectionTitle>
      <View
        style={{
          marginHorizontal: 16,
          borderRadius: t.radii.lg,
          borderWidth: 1,
          borderColor: t.c.border,
          backgroundColor: t.c.surface,
          overflow: 'hidden',
        }}
      >
        <SwitchRow
          inset
          label={tr('Customers may call')}
          detail={tr(
            'From their conversation with {name}, by voice or video. It rings whoever of the team is in that conversation, the first to answer takes it, and the customer sees {name}, never who answered.',
            { name: org.name },
          )}
          value={org.callsFrom === 'customers'}
          disabled={saving}
          onChange={(on) => void set(on)}
          testID="org-calls-from"
        />
      </View>
    </>
  );
}
