/**
 * Choosing a country (where someone lives, where an organization is based): a field showing the
 * one chosen, opening a sheet that finds any of them as you type, in your language.
 */

import { tr } from '@caime/core/i18n';
import { useMemo, useState } from 'react';
import { lazyPart } from '@/ui/Lazy';
import { PickerField } from '@/ui/PickerField';
import type { SearchItem } from '@/ui/SearchSheet';
import { useCountries } from './countries';
import { countryMatches, flagOf } from './find';

/** The list, loaded the first time it's opened. */
const SearchSheet = lazyPart(() => import('@/ui/SearchSheet').then((m) => m.SearchSheet));

export interface CountryFieldProps {
  label: string;
  /** The country chosen (ISO 3166-1, "EG"), or null while there's none. */
  value: string | null;
  onChange: (code: string) => void;
  /** The language to name countries in (BCP 47). */
  locale: string;
  /**
   * The device's time zone, when the screen also wants the country it suggests (sign-up): one
   * request for both.
   */
  timeZone?: string;
  hint?: string;
  error?: string | null;
  testID?: string;
}

const matches = (i: SearchItem, term: string) =>
  countryMatches({ code: i.key, name: i.title }, term);

export function CountryField({
  label,
  value,
  onChange,
  locale,
  timeZone,
  hint,
  error,
  testID,
}: CountryFieldProps) {
  const [open, setOpen] = useState(false);
  // Mounted from the first time it's opened, so it can slide away as it closes.
  const [opened, setOpened] = useState(false);
  const countries = useCountries(locale, timeZone);
  const items = useMemo(
    () =>
      (countries.data?.countries ?? []).map((c) => ({
        key: c.code,
        title: c.name,
        mark: flagOf(c.code),
      })),
    [countries.data],
  );
  const name = items.find((c) => c.key === value)?.title ?? value;
  return (
    <PickerField
      label={label}
      shown={name}
      placeholder={tr('Choose a country')}
      mark={value ? flagOf(value) : null}
      accessibilityHint={tr('Opens the list of countries')}
      onOpen={() => {
        setOpen(true);
        setOpened(true);
        // A list that didn't load is asked for again as it's opened.
        if (countries.isError) void countries.refetch();
      }}
      hint={hint}
      error={error}
      testID={testID}
    >
      {opened ? (
        <SearchSheet
          open={open}
          onClose={() => setOpen(false)}
          title={label}
          items={items}
          value={value}
          onPick={onChange}
          matches={matches}
          searchLabel={tr('Search countries')}
          loading={countries.isPending}
          failed={countries.isError}
          onRetry={() => void countries.refetch()}
          empty={tr('No country by that name.')}
          testID={testID}
        />
      ) : null}
    </PickerField>
  );
}
