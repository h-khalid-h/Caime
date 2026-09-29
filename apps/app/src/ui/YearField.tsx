/**
 * Choosing a year (the year an organization began): a field showing the one chosen, opening a
 * sheet that finds any year as it's typed, the latest first. The same on the web and the phones,
 * as the country field is; none is typed by hand, so nothing but a year is ever sent.
 */
import { useMemo, useState } from 'react';
import { lazyPart } from '@/ui/Lazy';
import { PickerField } from '@/ui/PickerField';
import type { SearchItem } from '@/ui/SearchSheet';

const SearchSheet = lazyPart(() => import('@/ui/SearchSheet').then((m) => m.SearchSheet));

/** The choice that leaves the year out, where it's optional. */
const NONE = 'none';

export interface YearFieldProps {
  label: string;
  /** The year chosen, or null while there's none. */
  value: number | null;
  onChange: (year: number | null) => void;
  /** The earliest and latest years that can be chosen. */
  min: number;
  max: number;
  /** Offered as a choice when the year can be left out. */
  optional?: boolean;
  hint?: string;
  error?: string | null;
  placeholder?: string;
  testID?: string;
}

const matches = (i: SearchItem, term: string) => {
  const typed = term.replace(/\D/g, '');
  return i.key === NONE ? !typed : !typed || i.key.startsWith(typed);
};

export function YearField({
  label,
  value,
  onChange,
  min,
  max,
  optional = false,
  hint,
  error,
  placeholder = 'Choose a year',
  testID,
}: YearFieldProps) {
  const [open, setOpen] = useState(false);
  // Mounted from the first time it's opened, so it can slide away as it closes.
  const [opened, setOpened] = useState(false);
  const items = useMemo(() => {
    const years: SearchItem[] = [];
    for (let y = max; y >= min; y--) years.push({ key: String(y), title: String(y) });
    return optional ? [{ key: NONE, title: 'Not said' }, ...years] : years;
  }, [min, max, optional]);
  return (
    <PickerField
      label={label}
      shown={value ? String(value) : null}
      placeholder={placeholder}
      accessibilityHint="Opens the list of years"
      onOpen={() => {
        setOpen(true);
        setOpened(true);
      }}
      hint={hint}
      error={error}
      maxWidth={220}
      testID={testID}
    >
      {opened ? (
        <SearchSheet
          open={open}
          onClose={() => setOpen(false)}
          title={label}
          items={items}
          value={value ? String(value) : optional ? NONE : null}
          onPick={(key) => onChange(key === NONE ? null : Number(key))}
          matches={matches}
          searchLabel="Type a year"
          empty="No year like that."
          testID={testID}
        />
      ) : null}
    </PickerField>
  );
}
