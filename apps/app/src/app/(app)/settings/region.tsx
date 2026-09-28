/**
 * Language and region: where someone lives (their defaults: the work week, the currency of an
 * amount), the time zone their times are in, and how dates, times and numbers are written for
 * them. Each is saved as it's chosen.
 */
import type { MeView } from '@caishy/core/api';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { deviceInfo } from '@/features/auth/device';
import { CountryField } from '@/features/geo/CountryField';
import { LanguageField } from '@/features/geo/LanguageField';
import { TimeZoneField } from '@/features/geo/TimeZoneField';
import { Group, SettingsPage } from '@/features/settings/SettingsPage';
import { useMe, useSession } from '@/state/session';
import { toast } from '@/ui/Toast';

export default function Region() {
  const me = useMe();
  const qc = useQueryClient();
  const [device] = useState(deviceInfo);
  const save = async (patch: Partial<Pick<MeView, 'country' | 'timeZone' | 'locale'>>) => {
    try {
      const { user } = await endpoints.updateMe(patch);
      const week = user.workweek.join() !== me.workweek.join();
      useSession.getState().setUser(user);
      // Times and "needs you" follow the zone and the work week: what's listed may change.
      void qc.invalidateQueries({ queryKey: qk.inbox });
      toast(week ? 'Saved. Your work week follows your country now.' : 'Saved');
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    }
  };
  return (
    <SettingsPage title="Language and region">
      <Group
        title="Where you are"
        footer="Your country sets your defaults, like the days work notifications wait for and the currency of amounts. Your time zone is what quiet hours and due dates keep to. Neither is shown to anyone."
      >
        <View style={{ padding: 16, gap: 16 }}>
          <CountryField
            label="Country"
            value={me.country}
            onChange={(country) => void save({ country })}
            locale={me.locale}
            testID="region-country"
          />
          <TimeZoneField
            label="Time zone"
            value={me.timeZone}
            onChange={(timeZone) => void save({ timeZone })}
            locale={me.locale}
            deviceZone={device.timeZone}
            testID="region-zone"
          />
        </View>
      </Group>
      <Group
        title="Dates, times and numbers"
        footer="How Caishy writes them for you. Dates you type are read in English and Arabic."
      >
        <View style={{ padding: 16 }}>
          <LanguageField
            label="Written as in"
            value={me.locale}
            onChange={(locale) => void save({ locale })}
            testID="region-language"
          />
        </View>
      </Group>
    </SettingsPage>
  );
}
