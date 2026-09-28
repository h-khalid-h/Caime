/**
 * Choosing a country (where someone lives, where an organization is based): a field showing the
 * one chosen, opening a sheet that finds any of them as you type, in your language.
 */
import { useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import { useTheme } from '@/theme/theme';
import { Check, ChevronDown, Search } from '@/ui/icons';
import { ListRow } from '@/ui/ListRow';
import { useLayout } from '@/ui/layout';
import { Pressable } from '@/ui/Pressable';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
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
  const { height, desktop } = useLayout();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const countries = useCountries(locale);
  const all = countries.data?.countries ?? [];
  const chosen = all.find((c) => c.code === value);
  // The one chosen comes first while nothing's typed, so it's where the list opens.
  const list = useMemo(() => {
    const found = all.filter((c) => countryMatches(c, term));
    if (term.trim() || !chosen) return found;
    return [chosen, ...found.filter((c) => c.code !== chosen.code)];
  }, [all, term, chosen]);
  const name = chosen?.name ?? value;
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
        onPress={() => {
          setTerm('');
          setOpen(true);
        }}
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
      <Sheet open={open} onClose={() => setOpen(false)} title={label} scroll={false}>
        <TextField
          icon={Search}
          placeholder="Search countries"
          accessibilityLabel="Search countries"
          value={term}
          onChangeText={setTerm}
          autoCorrect={false}
          autoFocus={desktop}
          testID={testID ? `${testID}-search` : undefined}
        />
        <View accessibilityRole="radiogroup" accessibilityLabel={label}>
          <FlatList
            data={list}
            keyExtractor={(c) => c.code}
            keyboardShouldPersistTaps="handled"
            initialNumToRender={16}
            style={{ maxHeight: Math.max(240, height * 0.55), marginHorizontal: -20 }}
            renderItem={({ item }) => (
              <ListRow
                left={
                  <Text
                    variant="title"
                    accessibilityElementsHidden
                    importantForAccessibility="no"
                    style={{ width: 32, textAlign: 'center' }}
                  >
                    {flagOf(item.code)}
                  </Text>
                }
                title={item.name}
                radio
                checked={item.code === value}
                selected={item.code === value}
                right={item.code === value ? <Check size={18} color={t.c.accent} /> : null}
                onPress={() => {
                  onChange(item.code);
                  setOpen(false);
                }}
                testID={`country-${item.code}`}
              />
            )}
            ListEmptyComponent={
              <Text variant="body" color="textSecondary" style={{ padding: 20 }}>
                {countries.isError
                  ? 'The list didn’t load. Check your connection and try again.'
                  : countries.data
                    ? 'No country by that name.'
                    : 'Loading…'}
              </Text>
            }
          />
        </View>
      </Sheet>
    </View>
  );
}
