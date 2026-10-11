/**
 * A day, on the web: the browser's own date field, so it can be typed in the order the person's
 * language writes dates or picked from its calendar (and on a phone's browser, the phone's own
 * picker), and a screen reader knows it for what it is. In the account's language and region
 * (`lang`), not the browser's, where the browser honours it.
 */
import { createElement, useId, useState } from 'react';
import { useUserClock } from '@/lib/time';
import { fontFace } from '@/theme/fonts';
import { useTheme } from '@/theme/theme';
import type { DateFieldProps } from './dates';
import { FieldShell, fieldInputStyle } from './FieldShell';

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
  const { locale } = useUserClock();
  const [focused, setFocused] = useState(false);
  const body = t.type.body;
  const note = error ?? hint;
  return (
    <FieldShell
      label={label}
      labelID={`${id}-label`}
      hint={hint}
      error={error}
      noteID={`${id}-note`}
    >
      {createElement('input', {
        type: 'date',
        value: value ?? '',
        min,
        max,
        required: true,
        lang: locale,
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
          ...fieldInputStyle(t, { focused, error: Boolean(error) }, 280),
          color: value ? t.c.text : t.c.textTertiary,
          ...fontFace(body.family, body.weight),
        },
      })}
    </FieldShell>
  );
}
