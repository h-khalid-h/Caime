/**
 * A day, on a phone: the phone's own date picker. On Android its calendar (opening on the year
 * for a birthday, so decades go by in one tap); on iOS its wheels for a birthday or its calendar
 * otherwise, in a sheet with Done. Shown in the field as the person's language writes dates.
 */
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, View } from 'react-native';
import { useUserClock } from '@/lib/time';
import { useTheme } from '@/theme/theme';
import { Button } from './Button';
import { type DateFieldProps, dateOf, dayOf, formatDay } from './dates';
import { Calendar } from './icons';
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
  placeholder = 'Choose a day',
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
  const ring = Boolean(error);
  return (
    <View style={{ gap: 6 }}>
      <Text variant="captionStrong" color="textSecondary">
        {label}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${shown ?? 'not chosen'}`}
        accessibilityHint="Opens a date picker"
        onPress={choose}
        testID={testID}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          minHeight: 48,
          maxWidth: 280,
          borderRadius: t.radii.md,
          borderWidth: ring ? 2 : 1,
          borderColor: error ? t.c.danger : t.c.border,
          backgroundColor: t.c.surface,
          paddingHorizontal: ring ? 13 : 14,
        }}
      >
        <Text variant="body" color={shown ? 'text' : 'textTertiary'}>
          {shown ?? placeholder}
        </Text>
        <Calendar size={18} color={t.c.textSecondary} />
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
      {Platform.OS === 'ios' ? (
        <Sheet
          open={open}
          onClose={() => setOpen(false)}
          title={label}
          scroll={false}
          footer={
            <Button
              label="Done"
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
    </View>
  );
}
