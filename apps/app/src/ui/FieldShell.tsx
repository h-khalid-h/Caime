/**
 * The shell every field sits in (R77): its label above, the box its control sits in (one
 * height, radius, ring and padding for a text field, a picker, a date or a time), and its hint
 * or error below, read to a screen reader. A control that draws its own box (a browser's date
 * input) takes the box's style from `fieldInputStyle`; everything else sits in `fieldBox`.
 */
import { controlHeight } from '@caime/brand/tokens';
import type { ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';
import type { Theme } from '@/theme/theme';
import { Text } from './Text';

export interface FieldState {
  focused?: boolean;
  error?: boolean;
}

/** The box a field's control sits in. */
export function fieldBox(t: Theme, { focused, error }: FieldState): ViewStyle {
  const ring = focused || error;
  return {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: controlHeight.field,
    borderRadius: t.radii.md,
    borderWidth: ring ? 2 : 1,
    borderColor: error ? t.c.danger : focused ? t.c.focus : t.c.border,
    backgroundColor: t.c.surface,
    paddingHorizontal: ring ? 13 : 14,
  };
}

/** The same box as a browser input's own style, for a control that draws itself. */
export function fieldInputStyle(t: Theme, state: FieldState, maxWidth?: number) {
  const box = fieldBox(t, state);
  return {
    boxSizing: 'border-box',
    width: '100%',
    maxWidth,
    minHeight: box.minHeight,
    borderRadius: box.borderRadius,
    borderStyle: 'solid',
    borderWidth: box.borderWidth,
    borderColor: box.borderColor,
    backgroundColor: box.backgroundColor,
    paddingLeft: box.paddingHorizontal,
    paddingRight: box.paddingHorizontal,
    fontSize: 16,
    // The border is the focus ring; a native picker inside follows the theme.
    outline: 'none',
    colorScheme: t.scheme,
  } as const;
}

export function FieldShell({
  label,
  labelID,
  hint,
  error,
  noteID,
  style,
  children,
}: {
  label?: string;
  /** The label's id, for a control that's labelled by it (a browser input). */
  labelID?: string;
  hint?: string;
  error?: string | null;
  /** The note's id, for a control that's described by it. */
  noteID?: string;
  style?: ViewStyle;
  children: ReactNode;
}) {
  const note = error ?? hint;
  return (
    <View style={[{ gap: 6 }, style]}>
      {label ? (
        <Text variant="captionStrong" color="textSecondary" nativeID={labelID}>
          {label}
        </Text>
      ) : null}
      {children}
      {note ? (
        <Text
          variant="caption"
          color={error ? 'danger' : 'textTertiary'}
          nativeID={noteID}
          accessibilityLiveRegion={error ? 'polite' : undefined}
        >
          {note}
        </Text>
      ) : null}
    </View>
  );
}
