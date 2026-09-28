/**
 * A time of day, on the web: the browser's own time field, typed or picked, in the 12 or 24
 * hours the person's language uses, and known to a screen reader for what it is.
 */
import { createElement, useId, useState } from 'react';
import { View } from 'react-native';
import { fontFamily } from '@/theme/fonts';
import { useTheme } from '@/theme/theme';
import { Text } from './Text';
import { TIME_OF_DAY, type TimeFieldProps } from './times';

export function TimeField({ label, value, onChange, hint, error, testID }: TimeFieldProps) {
  const t = useTheme();
  const id = useId();
  const [focused, setFocused] = useState(false);
  const ring = focused || Boolean(error);
  const body = t.type.body;
  const note = error ?? hint;
  return (
    <View style={{ gap: 6, flex: 1 }}>
      <Text variant="captionStrong" color="textSecondary" nativeID={`${id}-label`}>
        {label}
      </Text>
      {createElement('input', {
        type: 'time',
        value,
        required: true,
        'aria-labelledby': `${id}-label`,
        'aria-describedby': note ? `${id}-note` : undefined,
        'aria-invalid': error ? true : undefined,
        'data-testid': testID,
        // Only a whole time counts: a field holding part of one keeps the last.
        onChange: (e: { currentTarget: { value: string } }) => {
          const v = e.currentTarget.value;
          if (TIME_OF_DAY.test(v)) onChange(v);
        },
        onFocus: () => setFocused(true),
        onBlur: () => setFocused(false),
        style: {
          boxSizing: 'border-box',
          width: '100%',
          minHeight: 48,
          borderRadius: t.radii.md,
          borderStyle: 'solid',
          borderWidth: ring ? 2 : 1,
          borderColor: error ? t.c.danger : focused ? t.c.focus : t.c.border,
          backgroundColor: t.c.surface,
          color: t.c.text,
          paddingLeft: ring ? 13 : 14,
          paddingRight: ring ? 13 : 14,
          fontFamily: fontFamily(body.family, body.weight),
          fontSize: 16,
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
