/**
 * The time zone someone's times are in (quiet hours, due dates, "tomorrow at 10"): a field with
 * its city and offset, the device's offered when it's another, any found by city or country.
 */

import { tr } from '@caime/core/i18n';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { wordsMatch } from '@/lib/find';
import { Button } from '@/ui/Button';
import { lazyPart } from '@/ui/Lazy';
import { PickerField } from '@/ui/PickerField';
import type { SearchItem } from '@/ui/SearchSheet';
import { Text } from '@/ui/Text';

/** The list, loaded the first time it's opened. */
const SearchSheet = lazyPart(() => import('@/ui/SearchSheet').then((m) => m.SearchSheet));

const HOUR = 3_600_000;

const matches = (i: SearchItem, term: string) => wordsMatch([i.title, i.subtitle, i.key], term);

export function TimeZoneField({
  label,
  value,
  onChange,
  locale,
  deviceZone,
  hint,
  testID,
}: {
  label: string;
  value: string;
  onChange: (zone: string) => void;
  locale: string;
  /** The zone this device reports, offered when it isn't the one chosen. */
  deviceZone?: string;
  hint?: string;
  testID?: string;
}) {
  const [open, setOpen] = useState(false);
  // Mounted from the first time it's opened, so it can slide away as it closes.
  const [opened, setOpened] = useState(false);
  const zones = useQuery({
    queryKey: qk.timeZones(locale, deviceZone ?? ''),
    queryFn: () => endpoints.timeZones(locale, deviceZone),
    staleTime: HOUR,
    gcTime: 24 * HOUR,
  });
  const items = useMemo(
    () =>
      (zones.data?.zones ?? []).map((z) => ({
        key: z.zone,
        title: z.city,
        subtitle: [z.countryName, z.offset].filter(Boolean).join(' · '),
      })),
    [zones.data],
  );
  const shown = items.find((i) => i.key === value);
  const suggested = zones.data?.suggested ?? null;
  const offered = suggested && suggested !== value ? items.find((i) => i.key === suggested) : null;
  return (
    <PickerField
      label={label}
      shown={shown?.title ?? value}
      detail={shown?.subtitle ?? null}
      placeholder={value}
      accessibilityHint={tr('Opens the list of time zones')}
      onOpen={() => {
        setOpen(true);
        setOpened(true);
        // A list that didn't load is asked for again as it's opened.
        if (zones.isError) void zones.refetch();
      }}
      hint={offered ? undefined : hint}
      testID={testID}
    >
      {offered ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Text variant="caption" color="textSecondary" style={{ flexShrink: 1 }}>
            {tr('This device is in {title} ({subtitle}).', {
              title: offered.title,
              subtitle: offered.subtitle,
            })}
          </Text>
          <Button
            label={tr('Use it')}
            size="sm"
            variant="secondary"
            onPress={() => onChange(offered.key)}
            testID={testID ? `${testID}-device` : undefined}
          />
        </View>
      ) : null}
      {opened ? (
        <SearchSheet
          open={open}
          onClose={() => setOpen(false)}
          title={label}
          items={items}
          value={value}
          onPick={onChange}
          matches={matches}
          searchLabel={tr('Search cities or countries')}
          loading={zones.isPending}
          failed={zones.isError}
          onRetry={() => void zones.refetch()}
          empty={tr('No time zone by that name.')}
          testID={testID}
        />
      ) : null}
    </PickerField>
  );
}
