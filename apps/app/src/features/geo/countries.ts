/**
 * Countries: where someone lives and where an organization is based (lib/geo.ts on the server,
 * which names them in the person's language), and the one a device suggests from its time zone.
 */
import { useQuery } from '@tanstack/react-query';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { useLanguage } from '@/lib/languageState';

const DAY = 86_400_000;

/**
 * The list, named in the language on screen (an Arabic screen says «مصر», whatever the account's
 * formatting locale), else `locale`'s; it changes rarely, so it's asked for once a day.
 */
export function useCountries(locale: string, timeZone?: string) {
  const shown = useLanguage((s) => s.language);
  const naming = shown && shown !== 'en' ? shown : locale;
  return useQuery({
    queryKey: qk.countries(naming, timeZone ?? ''),
    queryFn: () => endpoints.countries(naming, timeZone),
    staleTime: DAY,
    gcTime: 7 * DAY,
  });
}
