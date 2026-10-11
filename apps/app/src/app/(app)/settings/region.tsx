/**
 * Language and region: where someone lives (their defaults: the work week, the currency of an
 * amount), the time zone their times are in, and how dates, times and numbers are written for
 * them. Each is saved as it's chosen.
 */
import type { MeView } from '@caime/core/api';
import { INTERFACE_LANGUAGES, type LanguageChoice, tr } from '@caime/core/i18n';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { deviceInfo } from '@/features/auth/device';
import { CountryField } from '@/features/geo/CountryField';
import { useCountries } from '@/features/geo/countries';
import { LanguageField } from '@/features/geo/LanguageField';
import { TimeZoneField } from '@/features/geo/TimeZoneField';
import { Choice, Group, SettingsPage } from '@/features/settings/SettingsPage';
import { savePrefs } from '@/features/settings/savePrefs';
import { LANGUAGE_NAMES } from '@/lib/i18n';
import { useMe, useSession } from '@/state/session';
import { usePrefs } from '@/theme/prefs';
import { Button } from '@/ui/Button';
import { Text } from '@/ui/Text';
import { toast } from '@/ui/Toast';

export default function Region() {
  const me = useMe();
  const qc = useQueryClient();
  const [device] = useState(deviceInfo);
  const language = usePrefs((p) => p.language);
  // Saving the preference is enough: the language follows it (lib/i18n.ts), and the app
  // remounts in it.
  const chooseLanguage = (choice: LanguageChoice) => savePrefs({ language: choice });
  // A country change offers the zone that goes with it (R76), when the one kept is elsewhere.
  const countries = useCountries(me.locale, device.timeZone);
  const zones = useQuery({
    queryKey: qk.timeZones(me.locale, device.timeZone ?? ''),
    queryFn: () => endpoints.timeZones(me.locale, device.timeZone),
    staleTime: 3_600_000,
  });
  const [offeredZone, setOfferedZone] = useState<string | null>(null);
  const save = async (patch: Partial<Pick<MeView, 'country' | 'timeZone' | 'locale'>>) => {
    try {
      const { user } = await endpoints.updateMe(patch);
      const week = user.workweek.join() !== me.workweek.join();
      useSession.getState().setUser(user);
      // Times and "needs you" follow the zone and the work week: what's listed may change.
      void qc.invalidateQueries({ queryKey: qk.inbox });
      toast(week ? tr('Saved. Your work week follows your country now.') : tr('Saved'));
      if (patch.country) {
        const main = countries.data?.countries.find((c) => c.code === patch.country)?.zone;
        const kept = zones.data?.zones.find((z) => z.zone === user.timeZone)?.country;
        setOfferedZone(main && main !== user.timeZone && kept !== patch.country ? main : null);
      }
      if (patch.timeZone) setOfferedZone(null);
    } catch (e) {
      toast((e as Error).message, { tone: 'danger' });
    }
  };
  return (
    <SettingsPage title={tr('Language and region')}>
      <Group
        title={tr('Where you are')}
        footer={tr(
          'Your country sets your defaults, like the days work notifications wait for and the currency of amounts. Your time zone is what quiet hours and due dates keep to. Neither is shown to anyone.',
        )}
      >
        <View style={{ padding: 16, gap: 16 }}>
          <CountryField
            label={tr('Country')}
            value={me.country}
            onChange={(country) => void save({ country })}
            locale={me.locale}
            testID="region-country"
          />
          <TimeZoneField
            label={tr('Time zone')}
            value={me.timeZone}
            onChange={(timeZone) => void save({ timeZone })}
            locale={me.locale}
            deviceZone={device.timeZone}
            testID="region-zone"
          />
          {offeredZone ? (
            <View style={{ gap: 8 }} testID="region-zone-offer">
              <Text variant="caption" color="textSecondary">
                {tr('Your time zone is still {zone}. Your new country keeps {offered}.', {
                  zone: me.timeZone,
                  offered: offeredZone,
                })}
              </Text>
              <Button
                label={tr('Use {zone}', { zone: offeredZone })}
                variant="secondary"
                onPress={() => void save({ timeZone: offeredZone })}
                testID="region-zone-offer-use"
              />
            </View>
          ) : null}
        </View>
      </Group>
      <Group
        title={tr('Language')}
        footer={tr('Caime in the language you choose. Automatic follows your device.')}
      >
        <Choice
          label={tr('Language')}
          value={language}
          onChange={chooseLanguage}
          options={[
            { value: 'auto', label: tr('Automatic'), detail: tr('Your device’s language') },
            ...INTERFACE_LANGUAGES.map((l) => ({ value: l, label: LANGUAGE_NAMES[l] })),
          ]}
        />
      </Group>
      <Group
        title={tr('Dates, times and numbers')}
        footer={tr('How Caime writes them for you. Dates you type are read in English and Arabic.')}
      >
        <View style={{ padding: 16 }}>
          <LanguageField
            label={tr('Written as in')}
            value={me.locale}
            onChange={(locale) => void save({ locale })}
            testID="region-language"
          />
        </View>
      </Group>
    </SettingsPage>
  );
}
