/**
 * A day, on a phone: the phone's own date picker. On Android its calendar (opening on the year
 * for a birthday, so decades go by in one tap); on iOS its wheels for a birthday or its calendar
 * otherwise, in a sheet with Done. Shown in the field as the person's language writes dates, on
 * the one field shell.
 */

import { tr } from '@caime/core/i18n';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import Calendar from 'lucide-react-native/icons/calendar';
import { useState } from 'react';
import { Platform } from 'react-native';
import { useUserClock } from '@/lib/time';
import { useTheme } from '@/theme/theme';
import { Button } from './Button';
import { type DateFieldProps, dateOf, dayOf, formatDay } from './dates';
import { FieldShell, fieldBox } from './FieldShell';
import { Pressable } from './Pressable';
import { Sheet } from './Sheet';
import { Text } from './Text';

export function DateField({
  label,
  value,
  onChange,
  min,
  max,
  hint,
  error,
  placeholder = tr('Choose a day'),
  memorable,
  testID,
}: DateFieldProps) {
  const t = useTheme();
  // As the person writes dates and times (Language and region), not the device.
  const { locale } = useUserClock();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Date>(new Date());
  const minimumDate = dateOf(min) ?? undefined;
  const maximumDate = dateOf(max) ?? undefined;
  // Where the picker starts: the day chosen, else today, kept within what can be chosen.
  const start = () => {
    const at = dateOf(value) ?? new Date();
    if (maximumDate && at > maximumDate) return maximumDate;
    if (minimumDate && at < minimumDate) return minimumDate;
    return at;
  };
  const shown = value ? formatDay(value, locale) : null;
  const choose = () => {
    if (Platform.OS === 'android') {
      // The system's own dialog, which works in local days and with the app's theme (Material 3's
      // needs a Material theme, and reads its dates as UTC days).
      DateTimePickerAndroid.open({
        value: start(),
        mode: 'date',
        design: 'default',
        startOnYearSelection: memorable,
        minimumDate,
        maximumDate,
        onValueChange: (_, date) => onChange(dayOf(date)),
      });
      return;
    }
    setDraft(start());
    setOpen(true);
  };
  return (
    <FieldShell label={label} hint={hint} error={error}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${shown ?? 'not chosen'}`}
        accessibilityHint={tr('Opens a date picker')}
        onPress={choose}
        testID={testID}
        focusRadius={t.radii.md}
        style={[fieldBox(t, { error: Boolean(error) }), { maxWidth: 280 }]}
      >
        <Text variant="body" color={shown ? 'text' : 'textTertiary'} style={{ flex: 1 }}>
          {shown ?? placeholder}
        </Text>
        <Calendar size={18} color={t.c.textSecondary} />
      </Pressable>
      {Platform.OS === 'ios' ? (
        <Sheet
          open={open}
          onClose={() => setOpen(false)}
          title={label}
          scroll={false}
          footer={
            <Button
              label={tr('Done')}
              size="lg"
              block
              onPress={() => {
                onChange(dayOf(draft));
                setOpen(false);
              }}
              testID={testID ? `${testID}-done` : undefined}
            />
          }
        >
          <DateTimePicker
            value={draft}
            mode="date"
            display={memorable ? 'spinner' : 'inline'}
            locale={locale}
            themeVariant={t.scheme}
            accentColor={t.c.accent}
            minimumDate={minimumDate}
            maximumDate={maximumDate}
            onValueChange={(_, date) => setDraft(date)}
            style={{ alignSelf: 'center' }}
          />
        </Sheet>
      ) : null}
    </FieldShell>
  );
}
