/**
 * The language, and region, dates, times and numbers are written in for someone: each named in
 * itself (as people look for their own), with how a date and a number look in it.
 */
import { LANGUAGES } from '@caishy/core/languages';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useTheme } from '@/theme/theme';
import { ChevronDown } from '@/ui/icons';
import { Pressable } from '@/ui/Pressable';
import { type SearchItem, SearchSheet } from '@/ui/SearchSheet';
import { Text } from '@/ui/Text';
import { folded } from './find';

/** How a date, a time and a number look in `tag`. */
function sample(tag: string): string {
  try {
    const at = new Date(Date.UTC(2026, 2, 15, 15, 30));
    const date = new Intl.DateTimeFormat(tag, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'UTC',
    }).format(at);
    return `${date} · ${new Intl.NumberFormat(tag).format(1234.5)}`;
  } catch {
    return tag;
  }
}

const matches = (i: SearchItem, term: string) => {
  const q = folded(term);
  return (
    !q ||
    folded(`${i.title} ${i.subtitle ?? ''} ${i.key}`)
      .split(/[\s()·,-]+/)
      .some((w) => w.startsWith(q))
  );
};

export function LanguageField({
  label,
  value,
  onChange,
  hint,
  testID,
}: {
  label: string;
  value: string;
  onChange: (tag: string) => void;
  hint?: string;
  testID?: string;
}) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const items = useMemo(() => {
    const known = LANGUAGES.map((l) => ({
      key: l.tag,
      title: l.native,
      subtitle: `${l.english} · ${sample(l.tag)}`,
    }));
    // One chosen from the device that isn't on the list is still shown as chosen.
    return known.some((k) => k.key === value)
      ? known
      : [{ key: value, title: value, subtitle: sample(value) }, ...known];
  }, [value]);
  const shown = items.find((i) => i.key === value);
  return (
    <View style={{ gap: 6 }}>
      <Text variant="captionStrong" color="textSecondary">
        {label}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${shown?.title ?? value}`}
        accessibilityHint="Opens the list of languages"
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
          <Text variant="caption" color="textSecondary">
            {sample(value)}
          </Text>
        </View>
        <ChevronDown size={18} color={t.c.textSecondary} />
      </Pressable>
      {hint ? (
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
        searchLabel="Search languages"
        empty="No language by that name."
        testID={testID}
      />
    </View>
  );
}
