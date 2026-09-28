/**
 * The currency an amount is in: its code as a chip beside the amount, the person's or the
 * organization's country's to start with, any other found by name or code in a sheet.
 */
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { Chip } from '@/ui/Chip';
import { ChevronDown } from '@/ui/icons';
import { type SearchItem, SearchSheet } from '@/ui/SearchSheet';
import { folded } from './find';

const DAY = 86_400_000;

const matches = (i: SearchItem, term: string) => {
  const q = folded(term);
  return (
    !q ||
    i.key.toLowerCase().startsWith(q) ||
    folded(i.title)
      .split(/\s+/)
      .some((w) => w.startsWith(q))
  );
};

export function CurrencyField({
  value,
  onChange,
  locale,
  label = 'Currency',
  testID,
}: {
  value: string | null;
  onChange: (code: string) => void;
  locale: string;
  label?: string;
  testID?: string;
}) {
  const [open, setOpen] = useState(false);
  const currencies = useQuery({
    queryKey: qk.currencies(locale),
    queryFn: () => endpoints.currencies(locale),
    staleTime: DAY,
    gcTime: 7 * DAY,
    enabled: open || value !== null,
  });
  const items = useMemo(
    () =>
      (currencies.data?.currencies ?? []).map((c) => ({
        key: c.code,
        title: c.name,
        subtitle: c.name === c.code ? undefined : c.code,
      })),
    [currencies.data],
  );
  const name = items.find((i) => i.key === value)?.title;
  return (
    <>
      <Chip
        label={value ?? 'Currency'}
        icon={ChevronDown}
        onPress={() => setOpen(true)}
        accessibilityLabel={`${label}, ${name ?? value ?? 'not chosen'}. Change it`}
        testID={testID}
      />
      <SearchSheet
        open={open}
        onClose={() => setOpen(false)}
        title={label}
        items={items}
        value={value}
        onPick={onChange}
        matches={matches}
        searchLabel="Search currencies"
        loading={currencies.isPending}
        failed={currencies.isError}
        empty="No currency by that name."
        testID={testID}
      />
    </>
  );
}
