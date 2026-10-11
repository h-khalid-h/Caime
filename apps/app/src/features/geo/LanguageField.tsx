/**
 * The language, and region, dates, times and numbers are written in for someone: each named in
 * itself (as people look for their own), with how a date and a number look in it.
 */

import { tr } from '@caime/core/i18n';
import { LANGUAGES } from '@caime/core/languages';
import { safeLocale } from '@caime/core/locale';
import { getLocales } from 'expo-localization';
import { useMemo, useState } from 'react';
import { wordsMatch } from '@/lib/find';
import { lazyPart } from '@/ui/Lazy';
import { PickerField } from '@/ui/PickerField';
import type { SearchItem } from '@/ui/SearchSheet';
import { namesOf } from './names';

/** The list, loaded the first time it's opened. */
const SearchSheet = lazyPart(() => import('@/ui/SearchSheet').then((m) => m.SearchSheet));

/** The device's own language and region, as the app keeps a locale. */
const deviceLocale = () => safeLocale(getLocales()[0]?.languageTag);

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

// By its names and tag, never by its sample (every month name and "2026" would match).
const matches = (i: SearchItem, term: string) =>
  wordsMatch([i.title, namesOf(i.key).english, i.key], term);

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
  const [open, setOpen] = useState(false);
  // Mounted from the first time it's opened, so it can slide away as it closes.
  const [opened, setOpened] = useState(false);
  const items = useMemo(() => {
    const known = LANGUAGES.map((l) => ({
      key: l.tag,
      title: l.native,
      subtitle: `${l.english} · ${sample(l.tag)}`,
    }));
    // The one chosen and the device's own, when the list doesn't have them, by their names: a
    // phone in Kuwait (ar-KW) can go back to its own after trying another.
    const extra = [...new Set([value, deviceLocale()])].filter(
      (tag) => !known.some((k) => k.key === tag),
    );
    return [
      ...extra.map((tag) => {
        const names = namesOf(tag);
        return { key: tag, title: names.native, subtitle: `${names.english} · ${sample(tag)}` };
      }),
      ...known,
    ];
  }, [value]);
  const shown = items.find((i) => i.key === value);
  return (
    <PickerField
      label={label}
      shown={shown?.title ?? value}
      detail={sample(value)}
      placeholder={value}
      accessibilityHint={tr('Opens the list of languages')}
      onOpen={() => {
        setOpen(true);
        setOpened(true);
      }}
      hint={hint}
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
          searchLabel={tr('Search languages')}
          empty={tr('No language by that name.')}
          testID={testID}
        />
      ) : null}
    </PickerField>
  );
}
