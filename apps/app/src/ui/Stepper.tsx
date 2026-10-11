/**
 * A count chosen a step at a time (R77): how many chairs, how many places, how many days. Its
 * label, Fewer, the count (announced as it changes) and More; `${testID}-less` and
 * `${testID}-more` either side of the count's own id.
 */
import { tr } from '@caime/core/i18n';
import Minus from 'lucide-react-native/icons/minus';
import Plus from 'lucide-react-native/icons/plus';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { IconButton } from './IconButton';
import { Text } from './Text';

export function Stepper({
  label,
  value,
  min,
  max,
  onChange,
  format,
  leading,
  testID,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
  /** How the count reads ("2 nights"); the number alone without. */
  format?: (n: number) => string;
  /** Drawn in the label's place (an item's photo, name and price); the label still names it. */
  leading?: ReactNode;
  testID?: string;
}) {
  return (
    <View
      role="group"
      accessibilityLabel={label}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
    >
      {leading ?? (
        <Text variant="label" style={{ flex: 1 }}>
          {label}
        </Text>
      )}
      <IconButton
        icon={Minus}
        label={tr('Fewer')}
        disabled={value <= min}
        onPress={() => onChange(Math.max(min, value - 1))}
        testID={testID ? `${testID}-less` : undefined}
      />
      <Text
        variant="bodyStrong"
        style={{ minWidth: 28, textAlign: 'center' }}
        accessibilityLiveRegion="polite"
        testID={testID}
      >
        {format ? format(value) : String(value)}
      </Text>
      <IconButton
        icon={Plus}
        label={tr('More')}
        disabled={value >= max}
        onPress={() => onChange(Math.min(max, value + 1))}
        testID={testID ? `${testID}-more` : undefined}
      />
    </View>
  );
}
