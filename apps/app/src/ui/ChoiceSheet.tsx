/**
 * A setting with a few values, in a panel (R77): one row showing what's chosen, which opens a
 * sheet of radio rows to choose from, or, above fifteen, a sheet that finds one as it's typed.
 * The row is `testID`, the sheet's list `${testID}-list` and its rows `${testID}-${value}`.
 */
import { useState } from 'react';
import { View, type ViewStyle } from 'react-native';
import { wordsMatch } from '@/lib/find';
import type { IconComponent } from './Button';
import { ChoiceList, type ChoiceOption } from './ChoiceList';
import { lazyPart, useOpened } from './Lazy';
import { ListRow } from './ListRow';
import type { SearchItem } from './SearchSheet';
import { Sheet } from './Sheet';

/** The finding sheet, loaded the first time a long list is opened. */
const SearchSheet = lazyPart(() => import('./SearchSheet').then((m) => m.SearchSheet));

/** Above this many, the sheet finds one as it's typed. */
const SEARCH_ABOVE = 15;

const matches = (i: SearchItem, term: string) => wordsMatch([i.title, i.subtitle, i.key], term);

export function ChoiceSheet<T extends string>({
  label,
  value,
  options,
  onChange,
  icon,
  detail,
  shown: said,
  searchLabel,
  disabled,
  rowStyle,
  testID,
}: {
  label: string;
  value: T | null;
  options: Array<ChoiceOption<T>>;
  onChange: (v: T) => void;
  icon?: IconComponent;
  /** Under the row while nothing's chosen, or beside what is. */
  detail?: string;
  /** What the row says of the choice, when that's more than the chosen option's label. */
  shown?: string;
  /** The search field's words, for a list above fifteen. */
  searchLabel?: string;
  disabled?: boolean;
  rowStyle?: ViewStyle;
  testID?: string;
}) {
  const [open, setOpen] = useState(false);
  const opened = useOpened(open);
  const chosen = options.find((o) => o.value === value);
  const picked = said ?? chosen?.label;
  const shown = picked ? (detail ? `${picked} · ${detail}` : picked) : detail;
  const long = options.length > SEARCH_ABOVE;
  return (
    <>
      <ListRow
        icon={icon}
        title={label}
        subtitle={shown ?? null}
        chevron
        onPress={disabled ? undefined : () => setOpen(true)}
        style={rowStyle}
        testID={testID}
      />
      {opened ? (
        long ? (
          <SearchSheet
            open={open}
            onClose={() => setOpen(false)}
            title={label}
            items={options.map((o) => ({ key: o.value, title: o.label, subtitle: o.detail }))}
            value={value}
            onPick={(key) => onChange(key as T)}
            matches={matches}
            searchLabel={searchLabel ?? label}
            testID={testID}
          />
        ) : (
          <Sheet open={open} onClose={() => setOpen(false)} title={label}>
            <View style={{ marginHorizontal: -20 }}>
              <ChoiceList
                label={label}
                value={value}
                options={options}
                onChange={(v) => {
                  onChange(v);
                  setOpen(false);
                }}
                testID={testID ? `${testID}-list` : undefined}
                optionTestID={testID}
              />
            </View>
          </Sheet>
        )
      ) : null}
    </>
  );
}
