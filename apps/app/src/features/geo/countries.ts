/**
 * Countries: where someone lives and where an organization is based (lib/geo.ts on the server,
 * which names them in the person's language), and the one a device suggests from its time zone.
 */
import { useQuery } from '@tanstack/react-query';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';

const DAY = 86_400_000;

/** The list, named in `locale`'s language; it changes rarely, so it's asked for once a day. */
export function useCountries(locale: string, timeZone?: string) {
  return useQuery({
    queryKey: qk.countries(locale, timeZone ?? ''),
    queryFn: () => endpoints.countries(locale, timeZone),
    staleTime: DAY,
    gcTime: 7 * DAY,
  });
}
