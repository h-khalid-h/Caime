/**
 * A field whose value is chosen from a list (a country, a year): what's chosen, or a
 * placeholder, with a chevron, opening whatever the caller renders after it (a SearchSheet).
 * One look for every such field, so the country and year fields share it.
 */

import ChevronDown from 'lucide-react-native/icons/chevron-down';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useTheme } from '@/theme/theme';
import { Pressable } from './Pressable';
import { Text } from './Text';

export function PickerField({
  label,
  shown,
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
  const ring = Boolean(error);
  return (
    <View style={{ gap: 6 }}>
      <Text variant="captionStrong" color="textSecondary">
        {label}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${shown ?? 'not chosen'}`}
        accessibilityHint={accessibilityHint}
        onPress={onOpen}
        testID={testID}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          minHeight: 48,
          maxWidth,
          borderRadius: t.radii.md,
          borderWidth: ring ? 2 : 1,
          borderColor: error ? t.c.danger : t.c.border,
          backgroundColor: t.c.surface,
          paddingHorizontal: ring ? 13 : 14,
        }}
      >
        {mark ? (
          <Text variant="body" accessibilityElementsHidden importantForAccessibility="no">
            {mark}
          </Text>
        ) : null}
        <Text variant="body" color={shown ? 'text' : 'textTertiary'} style={{ flex: 1 }}>
          {shown ?? placeholder}
        </Text>
        <ChevronDown size={18} color={t.c.textSecondary} />
      </Pressable>
      {error ? (
        <Text variant="caption" color="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" color="textTertiary">
          {hint}
        </Text>
      ) : null}
      {children}
    </View>
  );
}
