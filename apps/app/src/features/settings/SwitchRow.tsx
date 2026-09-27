/**
 * A setting that's on or off: what it is, and its switch. The words turn it too, as a label does
 * (a bigger target), and to a screen reader it's the one switch, never a button around a switch.
 */
import { Switch, View } from 'react-native';
import { useTheme } from '@/theme/theme';
import { Pressable } from '@/ui/Pressable';
import { Text } from '@/ui/Text';

export function SwitchRow({
  label,
  detail,
  value,
  onChange,
  disabled,
  testID,
}: {
  label: string;
  detail?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  testID?: string;
}) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 }}>
      <Pressable
        accessible={false}
        focusable={false}
        // Never a stop of its own for the keyboard (on the web a Pressable is one unless told):
        // the switch is the one control.
        tabIndex={-1}
        focusRing={false}
        onPress={disabled ? undefined : () => onChange(!value)}
        style={{ flex: 1, gap: 2, paddingVertical: 8 }}
      >
        <Text variant="bodyStrong">{label}</Text>
        {detail ? (
          <Text variant="caption" color="textSecondary">
            {detail}
          </Text>
        ) : null}
      </Pressable>
      <Switch
        value={value}
        disabled={disabled}
        onValueChange={onChange}
        trackColor={{ true: t.c.primary, false: t.c.borderStrong }}
        accessibilityLabel={label}
        accessibilityHint={detail}
        testID={testID}
      />
    </View>
  );
}
