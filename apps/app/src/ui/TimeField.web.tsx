/**
 * A time of day, on the web: the browser's own time field, typed or picked, in the 12 or 24
 * hours the account's language and region use (`lang`, where the browser honours it), and known
 * to a screen reader for what it is.
 */
import { createElement, useId, useState } from 'react';
import { useUserClock } from '@/lib/time';
import { fontFace } from '@/theme/fonts';
import { useTheme } from '@/theme/theme';
import { FieldShell, fieldInputStyle } from './FieldShell';
import { TIME_OF_DAY, type TimeFieldProps } from './times';

export function TimeField({ label, value, onChange, hint, error, testID }: TimeFieldProps) {
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
      style={{ flex: 1 }}
    >
      {createElement('input', {
        type: 'time',
        value,
        required: true,
        lang: locale,
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
          ...fieldInputStyle(t, { focused, error: Boolean(error) }),
          color: t.c.text,
          ...fontFace(body.family, body.weight),
        },
      })}
    </FieldShell>
  );
}
