import { safeLocale } from '@caishy/core/locale';
import { getLocales } from 'expo-localization';
import { useEffect, useState } from 'react';
import { useSession } from '@/state/session';

/** "Now", refreshed every minute so relative times ("5m", "Yesterday") stay true. */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

/**
 * The person's own time zone and locale, for every date the app shows: the ones they chose
 * (Language and region), and the device's before they've signed in.
 */
export function useUserClock(): { timeZone: string; locale: string } {
  const user = useSession((s) => s.user);
  return {
    timeZone: user?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC',
    locale: user?.locale ?? safeLocale(getLocales()[0]?.languageTag),
  };
}
