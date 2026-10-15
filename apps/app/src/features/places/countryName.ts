/** A country's name in the reader's language (R92), from the one countries list the app keeps. */
import { useMemo } from 'react';
import { useCountries } from '@/features/geo/countries';
import { useMe } from '@/state/session';

export function useCountryName(): (code: string) => string {
  const me = useMe();
  const q = useCountries(me.locale);
  return useMemo(() => {
    const names = new Map((q.data?.countries ?? []).map((c) => [c.code, c.name]));
    return (code: string) => names.get(code) ?? code;
  }, [q.data]);
}
