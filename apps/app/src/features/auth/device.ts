import { safeLocale } from '@caime/core/locale';
import { getCalendars, getLocales } from 'expo-localization';
import { Platform } from 'react-native';
import { clientKind } from '@/state/session';

/** What sign-up and sign-in tell the server about this device (never anything identifying). */
export function deviceInfo() {
  const locale = safeLocale(getLocales()[0]?.languageTag);
  const timeZone = getCalendars()[0]?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const deviceName =
    Platform.OS === 'web'
      ? 'Web browser'
      : Platform.OS === 'ios'
        ? 'iPhone or iPad'
        : 'Android device';
  return { client: clientKind, locale, timeZone: timeZone ?? undefined, deviceName };
}
