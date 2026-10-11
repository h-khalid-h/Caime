/**
 * One choice among a few, as rows (R77): each with an optional explanation, the one chosen
 * marked, read as a radio group and one stop for the keyboard (the arrows move and choose). The
 * body of a `ChoiceSheet`, or a list on a screen of its own; each row `${testID}-${value}` (or
 * `${optionTestID}-${value}` where the group's own id must differ: a `ChoiceSheet`'s list is
 * `${testID}-list`, so its row and its list never share an id).
 */
import { View } from 'react-native';
import { useRtl } from '@/lib/direction';
import { useTheme } from '@/theme/theme';
import { arrowKeyMoves, rovingTabIndex } from './arrowKeys';
import type { IconComponent } from './Button';
import { ListRow } from './ListRow';

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
  detail?: string;
  icon?: IconComponent;
  disabled?: boolean;
  /** Its own id; else the list's with its value (`${testID}-${value}`). */
  testID?: string;
}

export function ChoiceList<T extends string>({
  value,
  options,
  onChange,
  label,
  testID,
  optionTestID = testID,
}: {
  value: T | null;
  options: Array<ChoiceOption<T>>;
  onChange: (v: T) => void;
  label: string;
  testID?: string;
  /** The rows' prefix when it isn't the group's id. */
  optionTestID?: string;
}) {
  const t = useTheme();
  const rtl = useRtl();
  const anyChosen = options.some((o) => o.value === value);
  const pick = (o: ChoiceOption<T> | undefined) => {
    if (o && !o.disabled) onChange(o.value);
  };
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      testID={testID}
      {...arrowKeyMoves({ rtl, choose: (i) => pick(options[i]) })}
    >
      {options.map((o, i) => {
        const chosen = o.value === value;
        return (
          <ListRow
            key={o.value}
            title={o.label}
            subtitle={o.detail}
            icon={o.icon}
            iconColor={chosen ? t.c.accent : undefined}
            radio
            checked={chosen}
            selected={chosen}
            disabled={o.disabled}
            tabIndex={rovingTabIndex(chosen, i === 0, anyChosen)}
            onPress={() => pick(o)}
            testID={o.testID ?? (optionTestID ? `${optionTestID}-${o.value}` : undefined)}
            style={i === 0 ? undefined : { borderTopWidth: 1, borderTopColor: t.c.border }}
          />
        );
      })}
    </View>
  );
}
