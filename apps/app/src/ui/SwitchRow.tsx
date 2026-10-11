/**
 * A setting that's on or off (R77): what it is, and its switch. The words turn it too, as a label
 * does (a bigger target), and to a screen reader it's the one switch, never a button around a
 * switch. With `onOpen` the words open the thing instead (an automation's editor), a button of
 * their own beside the switch. Every switch in the app is one of these.
 */
import { Switch, View } from 'react-native';
import { useTheme } from '@/theme/theme';
import type { IconComponent } from './Button';
import { Pressable } from './Pressable';
import { Text } from './Text';

export function SwitchRow({
  label,
  detail,
  value,
  onChange,
  onOpen,
  icon: Icon,
  disabled,
  inset,
  divider,
  testID,
  rowTestID,
}: {
  label: string;
  detail?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  /** The words open this instead of turning the switch. */
  onOpen?: () => void;
  icon?: IconComponent;
  disabled?: boolean;
  /** A row of a settings group: the group's own inset and height. */
  inset?: boolean;
  /** A hairline above it (the second row of a group). */
  divider?: boolean;
  /** The switch's id. */
  testID?: string;
  /** The words' id, when they open something. */
  rowTestID?: string;
}) {
  const t = useTheme();
  const words = {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  } as const;
  const said = (
    <>
      {Icon ? <Icon size={20} color={t.c.textSecondary} /> : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong">{label}</Text>
        {detail ? (
          <Text variant="caption" color="textSecondary">
            {detail}
          </Text>
        ) : null}
      </View>
    </>
  );
  return (
    <View
      style={[
        { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
        inset ? { paddingHorizontal: 16, paddingVertical: 4, minHeight: 56 } : null,
        divider ? { borderTopWidth: 1, borderTopColor: t.c.border } : null,
      ]}
    >
      {onOpen ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={detail ? `${label}. ${detail}` : label}
          onPress={onOpen}
          testID={rowTestID}
          focusRadius={t.radii.sm}
          style={({ hovered, pressed }) => ({
            ...words,
            paddingHorizontal: inset ? 8 : 0,
            marginHorizontal: inset ? -8 : 0,
            borderRadius: t.radii.sm,
            backgroundColor: pressed ? t.c.surfacePressed : hovered ? t.c.surfaceHover : undefined,
          })}
        >
          {said}
        </Pressable>
      ) : (
        <Pressable
          accessible={false}
          focusable={false}
          // Never a stop of its own for the keyboard (on the web a Pressable is one unless told):
          // the switch is the one control.
          tabIndex={-1}
          focusRing={false}
          onPress={disabled ? undefined : () => onChange(!value)}
          style={words}
        >
          {said}
        </Pressable>
      )}
      <Switch
        value={value}
        disabled={disabled}
        onValueChange={onChange}
        trackColor={{ true: t.c.primary, false: t.c.borderStrong }}
        // Its state is the switch's own (on or off), never part of its name.
        accessibilityLabel={label}
        accessibilityHint={detail}
        testID={testID}
      />
    </View>
  );
}
