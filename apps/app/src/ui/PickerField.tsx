/**
 * A field whose value is chosen from a list (a country, a year, a language, a time zone): what's
 * chosen, or a placeholder, with a chevron, opening whatever the caller renders after it (a
 * SearchSheet). One shell for every such field (`FieldShell`), so they all look the same.
 */

import { listed, tr } from '@caime/core/i18n';
import ChevronDown from 'lucide-react-native/icons/chevron-down';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useTheme } from '@/theme/theme';
import { FieldShell, fieldBox } from './FieldShell';
import { Pressable } from './Pressable';
import { Text } from './Text';

export function PickerField({
  label,
  shown,
  detail,
  placeholder,
  mark,
  accessibilityHint,
  onOpen,
  hint,
  error,
  maxWidth,
  testID,
  children,
}: {
  label: string;
  /** What's chosen, as people read it; null while nothing is. */
  shown: string | null;
  /** A second line under what's chosen (a zone's country and offset). */
  detail?: string | null;
  placeholder: string;
  /** Shown before the value (a flag), hidden from screen readers. */
  mark?: string | null;
  accessibilityHint: string;
  onOpen: () => void;
  hint?: string;
  error?: string | null;
  maxWidth?: number;
  testID?: string;
  /** The sheet, mounted by the caller once it has been opened. */
  children?: ReactNode;
}) {
  const t = useTheme();
  return (
    <FieldShell label={label} hint={hint} error={error}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={listed(shown ? [label, shown, detail] : [label, tr('not chosen')])}
        accessibilityHint={accessibilityHint}
        onPress={onOpen}
        testID={testID}
        focusRadius={t.radii.md}
        style={[fieldBox(t, { error: Boolean(error) }), { maxWidth }]}
      >
        {mark ? (
          <Text variant="body" accessibilityElementsHidden importantForAccessibility="no">
            {mark}
          </Text>
        ) : null}
        <View style={{ flex: 1 }}>
          <Text variant="body" color={shown ? 'text' : 'textTertiary'}>
            {shown ?? placeholder}
          </Text>
          {shown && detail ? (
            <Text variant="caption" color="textSecondary">
              {detail}
            </Text>
          ) : null}
        </View>
        <ChevronDown size={18} color={t.c.textSecondary} />
      </Pressable>
      {children}
    </FieldShell>
  );
}
