/**
 * Choosing a country (where someone lives, where an organization is based): a field showing the
 * one chosen, opening a sheet that finds any of them as you type, in your language.
 */
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useTheme } from '@/theme/theme';
import { ChevronDown } from '@/ui/icons';
import { Pressable } from '@/ui/Pressable';
import { type SearchItem, SearchSheet } from '@/ui/SearchSheet';
import { Text } from '@/ui/Text';
import { useCountries } from './countries';
import { countryMatches, flagOf } from './find';

export interface CountryFieldProps {
  label: string;
  /** The country chosen (ISO 3166-1, "EG"), or null while there's none. */
  value: string | null;
  onChange: (code: string) => void;
  /** The language to name countries in (BCP 47). */
  locale: string;
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
  hint,
  error,
  testID,
}: CountryFieldProps) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const countries = useCountries(locale);
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
  const ring = Boolean(error);
  return (
    <View style={{ gap: 6 }}>
      <Text variant="captionStrong" color="textSecondary">
        {label}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${name ?? 'not chosen'}`}
        accessibilityHint="Opens the list of countries"
        onPress={() => setOpen(true)}
        testID={testID}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          minHeight: 48,
          borderRadius: t.radii.md,
          borderWidth: ring ? 2 : 1,
          borderColor: error ? t.c.danger : t.c.border,
          backgroundColor: t.c.surface,
          paddingHorizontal: ring ? 13 : 14,
        }}
      >
        {value ? (
          <Text variant="body" accessibilityElementsHidden importantForAccessibility="no">
            {flagOf(value)}
          </Text>
        ) : null}
        <Text variant="body" color={name ? 'text' : 'textTertiary'} style={{ flex: 1 }}>
          {name ?? 'Choose a country'}
        </Text>
        <ChevronDown size={18} color={t.c.textSecondary} />
      </Pressable>
      {error ? (
        <Text variant="caption" color="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
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
        searchLabel="Search countries"
        loading={countries.isPending}
        failed={countries.isError}
        empty="No country by that name."
        testID={testID}
      />
    </View>
  );
}
