/**
 * A day, on the web: the browser's own date field, so it can be typed in the order the person's
 * language writes dates or picked from its calendar (and on a phone's browser, the phone's own
 * picker), and a screen reader knows it for what it is.
 */
import { createElement, useId, useState } from 'react';
import { View } from 'react-native';
import { fontFace } from '@/theme/fonts';
import { useTheme } from '@/theme/theme';
import type { DateFieldProps } from './dates';
import { Text } from './Text';

export function DateField({
  label,
  value,
  onChange,
  min,
  max,
  hint,
  error,
  testID,
}: DateFieldProps) {
  const t = useTheme();
  const id = useId();
  const [focused, setFocused] = useState(false);
  const ring = focused || Boolean(error);
  const body = t.type.body;
  const note = error ?? hint;
  return (
    <View style={{ gap: 6 }}>
      <Text variant="captionStrong" color="textSecondary" nativeID={`${id}-label`}>
        {label}
      </Text>
      {createElement('input', {
        type: 'date',
        value: value ?? '',
        min,
        max,
        required: true,
        'aria-labelledby': `${id}-label`,
        'aria-describedby': note ? `${id}-note` : undefined,
        'aria-invalid': error ? true : undefined,
        'data-testid': testID,
        // A field holding only part of a day has no value yet.
        onChange: (e: { currentTarget: { value: string } }) =>
          onChange(e.currentTarget.value || null),
        onFocus: () => setFocused(true),
        onBlur: () => setFocused(false),
        style: {
          boxSizing: 'border-box',
          width: '100%',
          maxWidth: 280,
          minHeight: 48,
          borderRadius: t.radii.md,
          borderStyle: 'solid',
          borderWidth: ring ? 2 : 1,
          borderColor: error ? t.c.danger : focused ? t.c.focus : t.c.border,
          backgroundColor: t.c.surface,
          color: value ? t.c.text : t.c.textTertiary,
          paddingLeft: ring ? 13 : 14,
          paddingRight: ring ? 13 : 14,
          ...fontFace(body.family, body.weight),
          fontSize: 16,
          // The border is the focus ring; the calendar button follows the theme.
          outline: 'none',
          colorScheme: t.scheme,
        },
      })}
      {note ? (
        <Text
          variant="caption"
          color={error ? 'danger' : 'textTertiary'}
          nativeID={`${id}-note`}
          accessibilityLiveRegion={error ? 'polite' : undefined}
        >
          {note}
        </Text>
      ) : null}
    </View>
  );
}
