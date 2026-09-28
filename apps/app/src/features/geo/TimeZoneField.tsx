/**
 * The time zone someone's times are in (quiet hours, due dates, "tomorrow at 10"): a field with
 * its city and offset, the device's offered when it's another, any found by city or country.
 */
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { qk } from '@/api/keys';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { ChevronDown } from '@/ui/icons';
import { Pressable } from '@/ui/Pressable';
import { type SearchItem, SearchSheet } from '@/ui/SearchSheet';
import { Text } from '@/ui/Text';
import { folded } from './find';

const HOUR = 3_600_000;

const matches = (i: SearchItem, term: string) => {
  const q = folded(term);
  if (!q) return true;
  const words = `${i.title} ${i.subtitle ?? ''} ${i.key}`;
  return folded(words)
    .split(/[\s/·_,()-]+/)
    .some((w) => w.startsWith(q));
};

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
  const t = useTheme();
  const [open, setOpen] = useState(false);
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
    <View style={{ gap: 6 }}>
      <Text variant="captionStrong" color="textSecondary">
        {label}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${shown ? `${shown.title}, ${shown.subtitle}` : value}`}
        accessibilityHint="Opens the list of time zones"
        onPress={() => setOpen(true)}
        testID={testID}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          minHeight: 48,
          borderRadius: t.radii.md,
          borderWidth: 1,
          borderColor: t.c.border,
          backgroundColor: t.c.surface,
          paddingHorizontal: 14,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text variant="body">{shown?.title ?? value}</Text>
          {shown?.subtitle ? (
            <Text variant="caption" color="textSecondary">
              {shown.subtitle}
            </Text>
          ) : null}
        </View>
        <ChevronDown size={18} color={t.c.textSecondary} />
      </Pressable>
      {offered ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Text variant="caption" color="textSecondary" style={{ flexShrink: 1 }}>
            This device is in {offered.title} ({offered.subtitle}).
          </Text>
          <Button
            label="Use it"
            size="sm"
            variant="secondary"
            onPress={() => onChange(offered.key)}
            testID={testID ? `${testID}-device` : undefined}
          />
        </View>
      ) : hint ? (
        <Text variant="caption" color="textTertiary">
          {hint}
        </Text>
      ) : null}
      <SearchSheet
        open={open}
        onClose={() => setOpen(false)}
        title={label}
        items={items}
        value={value}
        onPick={onChange}
        matches={matches}
        searchLabel="Search cities or countries"
        loading={zones.isPending}
        failed={zones.isError}
        empty="No time zone by that name."
        testID={testID}
      />
    </View>
  );
}
