import { tr } from '@caime/core/i18n';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Connected } from '@/features/apps/Connected';
import { Discover } from '@/features/apps/Discover';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { Segmented } from '@/ui/Segmented';

type Tab = 'connected' | 'discover';

/**
 * Apps (R74): what's connected to Caime, and what can be. Connected holds every app someone let
 * act for them and Caime's own built-ins that are on; Discover is the directory. A link may open
 * Discover (`?tab=discover`) or one app in it (`?app=`).
 */
export default function Apps() {
  const params = useLocalSearchParams<{ tab?: string; app?: string }>();
  const [tab, setTab] = useState<Tab>(
    params.tab === 'discover' || params.app ? 'discover' : 'connected',
  );
  return (
    <SettingsPage title={tr('Apps')}>
      <Segmented<Tab>
        label={tr('Apps')}
        value={tab}
        onChange={setTab}
        options={[
          { value: 'connected', label: tr('Connected') },
          { value: 'discover', label: tr('Discover') },
        ]}
      />
      {tab === 'connected' ? (
        <Connected onDiscover={() => setTab('discover')} />
      ) : (
        <Discover openApp={params.app} />
      )}
    </SettingsPage>
  );
}
