import { safeLocale } from '@caime/core/locale';
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
 * (Language and region), and the device's before they've signed in. The locale carries their
 * country when it names none of its own ("ar" in Egypt reads as "ar-EG"), so Intl writes the
 * clock, the digits and the dates as that country does (R76); with it, their week's first day
 * and whether the clock counts to 12, as their country sets them.
 */
export function useUserClock(): {
  timeZone: string;
  locale: string;
  weekStart: number;
  hour12: boolean;
} {
  // A meeting's guest (R84) never chose a zone or a locale: the device's, as before signing in.
  const user = useSession((s) => (s.user?.kind === 'provisional' ? null : s.user));
  const locale = user?.locale ?? safeLocale(getLocales()[0]?.languageTag);
  return {
    timeZone: user?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC',
    locale: withRegion(locale, user?.country ?? null),
    weekStart: user?.weekStart ?? 1,
    hour12: user?.hour12 ?? false,
  };
}

/** A locale with the country's region when it has none of its own: "ar" + EG → "ar-EG". */
export function withRegion(locale: string, country: string | null): string {
  if (!country || !/^[A-Z]{2}$/.test(country)) return locale;
  try {
    const tag = new Intl.Locale(locale);
    if (tag.region) return locale;
    return new Intl.Locale(locale, { region: country }).toString();
  } catch {
    return locale;
  }
}
